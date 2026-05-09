"""Director service — Bedrock Converse + JSON parse + WS dispatch.

Three actions the model can pick:
  start_minigame -> push minigame_start over room#{code}
  commentate     -> push commentary_update over room#{code}
  wait           -> no-op

Uses the Converse API (model-agnostic) so we can swap the underlying model
via env var without code changes. Currently configured for Amazon Nova Micro
which is direct-invokable in eu-central-1, doesn't need Marketplace
subscription, and is ~8x cheaper than Anthropic models for this task.

Bedrock failures and JSON parse errors propagate to the handler, which
returns {action: 'wait'} so the match never breaks.
"""
import json
import os
import time

import boto3

import ws  # bundled into the Lambda package by the deploy workflow
from prompts import SYSTEM_PROMPT, build_user_message


bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('BEDROCK_REGION', 'eu-central-1'))
MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'eu.amazon.nova-micro-v1:0')

# Allowed event-type → gameType mappings. AI's start_minigame action is
# rejected (downgraded to commentate or wait) when the trigger event's type
# isn't in this map for the chosen gameType. Prevents Nova Micro hallucinations
# where it picks OFFSIDE_REFLEX for a nutmeg event etc.
_VALID_TRIGGERS = {
    'OFFSIDE_REFLEX':    {'offside'},
    'SHOT_CALL':         {'shotOnGoal', 'shot_on_goal'},
    'PENALTY_SHOOTOUT':  {'penalty'},
}


def run_director_tick(room_code: str, user_id: str, body: dict) -> dict:
        snapshot = body.get('snapshot') or {}
        decision = _ask_model(snapshot)
        _dispatch(room_code, snapshot, decision)
        return decision


def _ask_model(snapshot: dict) -> dict:
        """Invoke Bedrock via the Converse API and return the parsed JSON decision.

        Raises on Bedrock errors or invalid JSON; the handler catches and
        falls back to {action: 'wait'}.
        """
        t0 = time.time()
        response = bedrock.converse(
            modelId=MODEL_ID,
            system=[{'text': SYSTEM_PROMPT}],
            messages=[{
                'role': 'user',
                'content': [{'text': build_user_message(snapshot)}],
            }],
            inferenceConfig={
                'maxTokens': 320,  # bumped from 250 to leave room for reasoning field
                'temperature': 0.4,
            },
        )
        elapsed_ms = (time.time() - t0) * 1000
        text = response['output']['message']['content'][0]['text'].strip()

        # Strip code fences if the model added them despite the rule.
        if text.startswith('```'):
                text = text.strip('`')
                if text.lower().startswith('json'):
                        text = text[4:]
                text = text.strip()

        decision = json.loads(text)
        # Structured log so judges / debugging eyes can scan reasoning quickly.
        print(f"bedrock latency={elapsed_ms:.0f}ms action={decision.get('action')} reasoning={decision.get('reasoning')!r}")
        return decision


def _dispatch(room_code: str, snapshot: dict, decision: dict) -> None:
        action = decision.get('action')
        trigger_event = snapshot.get('triggerEvent') or {}
        related_event_id = trigger_event.get('eventId')
        trigger_type = trigger_event.get('eventType')

        # Validate AI start_minigame against the trigger event's type. Nova Micro
        # sometimes picks OFFSIDE_REFLEX for unrelated events (nutmegs, saves)
        # despite the system prompt. Hard-gate here so the modal never opens
        # nonsensically. Downgrade to commentate when the prompt has text we
        # can repurpose; otherwise drop to wait.
        if action == 'start_minigame':
                game_type = decision.get('gameType')
                allowed_event_types = _VALID_TRIGGERS.get(game_type, set())
                if trigger_type not in allowed_event_types:
                        downgrade_text = decision.get('prompt') or decision.get('title')
                        if downgrade_text:
                                print(f"director: downgrading start_minigame ({game_type}) on {trigger_type} -> commentate")
                                action = 'commentate'
                                decision = {**decision, 'action': 'commentate', 'text': downgrade_text}
                        else:
                                print(f"director: dropping start_minigame ({game_type}) on {trigger_type} -> wait")
                                action = 'wait'
                                decision = {**decision, 'action': 'wait', 'reason': 'gameType-event mismatch'}

        if action == 'start_minigame':
                config = dict(decision.get('config') or {})
                # Defensive defaults — Nova Micro sometimes omits the timing
                # config fields. Fill in OFFSIDE_REFLEX-shaped defaults so the
                # frontend's scoring computation references a valid moment.
                config.setdefault('durationMs', 8000)
                if decision.get('gameType') == 'OFFSIDE_REFLEX':
                        config.setdefault('offsideMomentMs', config['durationMs'] // 2)
                ws.push_to_channel(f"room#{room_code}", {
                    'type':             'minigame_start',
                    'gameId':           f"director-{related_event_id}-{room_code}",
                    'gameType':         decision.get('gameType'),
                    'title':            decision.get('title'),
                    'prompt':           decision.get('prompt'),
                    'config':           config,
                    'startedAtMs':      int(time.time() * 1000),
                    'durationMs':       config.get('durationMs', 8000),
                    'relatedEventId':   related_event_id,
                    'ownershipContext': snapshot.get('ownershipContext') or {},
                    'source':           'ai-director',
                    'reasoning':        decision.get('reasoning') or '',
                })
        elif action == 'commentate':
                ws.push_to_channel(f"room#{room_code}", {
                    'type':           'commentary_update',
                    'text':           decision.get('text', ''),
                    'relatedEventId': related_event_id,
                    'createdAtMs':    int(time.time() * 1000),
                    'reasoning':      decision.get('reasoning') or '',
                })
        # 'wait' -> no-op
