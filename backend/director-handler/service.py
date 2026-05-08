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
                'maxTokens': 250,
                'temperature': 0.4,
            },
        )
        elapsed_ms = (time.time() - t0) * 1000
        text = response['output']['message']['content'][0]['text'].strip()
        print(f"bedrock latency={elapsed_ms:.0f}ms response={text[:200]}")

        # Strip code fences if the model added them despite the rule.
        if text.startswith('```'):
                text = text.strip('`')
                if text.lower().startswith('json'):
                        text = text[4:]
                text = text.strip()

        return json.loads(text)


def _dispatch(room_code: str, snapshot: dict, decision: dict) -> None:
        action = decision.get('action')
        related_event_id = (snapshot.get('triggerEvent') or {}).get('eventId')

        if action == 'start_minigame':
                config = decision.get('config') or {}
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
                })
        elif action == 'commentate':
                ws.push_to_channel(f"room#{room_code}", {
                    'type':           'commentary_update',
                    'text':           decision.get('text', ''),
                    'relatedEventId': related_event_id,
                    'createdAtMs':    int(time.time() * 1000),
                })
        # 'wait' -> no-op
