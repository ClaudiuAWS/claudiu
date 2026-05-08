"""Director service — Bedrock InvokeModel + JSON parse + WS dispatch.

Three actions Claude can pick:
  start_minigame -> push minigame_start over room#{code}
  commentate     -> push commentary_update over room#{code}
  wait           -> no-op

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
MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'anthropic.claude-3-5-haiku-20241022-v1:0')


def run_director_tick(room_code: str, user_id: str, body: dict) -> dict:
        snapshot = body.get('snapshot') or {}
        decision = _ask_claude(snapshot)
        _dispatch(room_code, snapshot, decision)
        return decision


def _ask_claude(snapshot: dict) -> dict:
        """Invoke Bedrock and return the parsed JSON decision.

        Raises on Bedrock errors or invalid JSON; the handler catches and
        falls back to {action: 'wait'}.
        """
        request = {
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': 200,
            'system': SYSTEM_PROMPT,
            'messages': [{
                'role': 'user',
                'content': build_user_message(snapshot),
            }],
        }
        t0 = time.time()
        response = bedrock.invoke_model(modelId=MODEL_ID, body=json.dumps(request))
        elapsed_ms = (time.time() - t0) * 1000
        payload = json.loads(response['body'].read())
        text = payload['content'][0]['text'].strip()
        print(f"bedrock latency={elapsed_ms:.0f}ms response={text[:200]}")

        # Strip code fences if Claude added them despite the rule.
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
