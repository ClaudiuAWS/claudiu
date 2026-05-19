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
from prompts import (
    SYSTEM_PROMPT,
    build_user_message,
    CAPTAIN_PROMPT,
    build_captain_message,
)


bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('BEDROCK_REGION', 'eu-central-1'))
MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'eu.amazon.nova-micro-v1:0')

# Allowed event-type → gameType mappings. AI's start_minigame action is
# rejected (downgraded to commentate or wait) when the trigger event's type
# isn't in this map for the chosen gameType. Prevents Nova Micro hallucinations
# where it picks OFFSIDE_REFLEX for a nutmeg event etc.
_VALID_TRIGGERS = {
    'OFFSIDE_REFLEX':    {'offside'},
    'SHOT_CALL':         {'shotOnGoal', 'shot_on_goal'},
    # Penalties ride on eventType:'goal' with isPenalty:true. The downgrade
    # gate below applies the secondary isPenalty check, so the literal
    # eventType allowed here is 'goal'.
    'PENALTY_SHOOTOUT':  {'goal'},
    'HALFTIME_QUIZ':     {'halftime'},
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
                ok = trigger_type in allowed_event_types
                # Penalty gate: PENALTY_SHOOTOUT is only valid on goals where
                # isPenalty is true. Non-penalty goals (regular open-play) must
                # NOT trigger the shootout.
                if ok and game_type == 'PENALTY_SHOOTOUT' and not trigger_event.get('isPenalty'):
                        ok = False
                # No once-per-gameType gate any more — idempotency is now
                # per-EVENT (driven by the event-processor's
                # `triggeredMinigames` SS keyed on event_id, and the
                # frontend's per-eventId firedEvents). Multiple offsides
                # each get to fire their own OFFSIDE_REFLEX modal.
                # The prompt still informs the AI of which game types
                # already played so it can vary commentary; it's just
                # advisory, not enforced.
                if not ok:
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
                game_type_dec = decision.get('gameType')
                # Defensive defaults — Nova Micro sometimes omits the timing
                # config fields. Fill in per-game-type defaults so the frontend
                # scoring/UI never sees missing critical fields.
                if game_type_dec == 'HALFTIME_QUIZ':
                        config.setdefault('durationMs', 180_000)  # 15 game-min at 5×
                elif game_type_dec == 'PENALTY_SHOOTOUT':
                        config.setdefault('durationMs', 10000)
                else:
                        config.setdefault('durationMs', 8000)
                if game_type_dec == 'OFFSIDE_REFLEX':
                        config.setdefault('offsideMomentMs', config['durationMs'] // 2)
                if game_type_dec == 'HALFTIME_QUIZ':
                        # Schema gate: each q must have non-empty question text,
                        # 4 distinct non-empty answer strings, a valid correctIdx,
                        # and a category. Drop the whole quiz on any schema failure
                        # so users never see malformed questions.
                        qs = config.get('questions')
                        valid_schema = isinstance(qs, list) and 1 <= len(qs) <= 5 and all(
                                isinstance(q, dict)
                                and isinstance(q.get('q'), str) and len(q['q'].strip()) > 5
                                and isinstance(q.get('choices'), list)
                                and len(q['choices']) == 4
                                and all(isinstance(c, str) and len(c.strip()) > 0 for c in q['choices'])
                                and len({c.strip().lower() for c in q['choices']}) == 4  # no duplicates
                                and isinstance(q.get('correctIdx'), int)
                                and 0 <= q['correctIdx'] < 4
                                for q in qs
                        )
                        if not valid_schema:
                                print("director: HALFTIME_QUIZ schema failed, dropping -> wait")
                                return

                        # Anti-hallucination gate (post-schema):
                        #   1. Drop questions with confidence < 0.5. Missing
                        #      `confidence` defaults to 0.85 — Nova Micro
                        #      regularly omits the field, and using 0.0 there
                        #      meant the entire AI response got rejected. The
                        #      prompt now tells the model "missing = 0.85" so
                        #      its self-rating intent matches what we apply.
                        #   2. For type='player-bio', the question text must
                        #      contain a name from playerDirectory. This prevents
                        #      the model from asking about a famous player who
                        #      isn't actually in this match.
                        #   3. After filtering, we accept whatever survives — no
                        #      "must have ≥1 match-event" requirement any more.
                        #      A pure player-bio quiz (all names grounded in the
                        #      directory) is fine. The earlier rule was rejecting
                        #      perfectly valid quizzes when Nova returned three
                        #      good bio questions.
                        directory_names = set((snapshot.get('playerDirectory') or {}).keys())
                        confident_qs = [q for q in qs if float(q.get('confidence', 0.85)) >= 0.5]
                        print(f"[director] HALFTIME_QUIZ confidence filter: {len(qs)} -> {len(confident_qs)}")
                        grounded_qs = []
                        for q in confident_qs:
                                qtype = q.get('type', 'match-event')
                                if qtype == 'player-bio':
                                        q_text_lower = q['q'].lower()
                                        if not any(name.lower() in q_text_lower for name in directory_names):
                                                # Player-bio about someone not in this match — drop.
                                                continue
                                grounded_qs.append(q)
                        print(f"[director] HALFTIME_QUIZ grounding filter: {len(confident_qs)} -> {len(grounded_qs)}")

                        if len(grounded_qs) == 0:
                                print("[director] HALFTIME_QUIZ all questions dropped; nothing to broadcast -> wait")
                                return
                        config['questions'] = grounded_qs[:3]
                        print(f"[director] HALFTIME_QUIZ broadcasting {len(config['questions'])} AI questions")
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
                # End of HALFTIME_QUIZ-specific validation. Fall through to the
                # ws.push_to_channel below.
        elif action == 'commentate':
                # Personal-commentary support: when the trigger event has an
                # `ownerUserIds` list (a goal/save by a drafted player), tag
                # the WS broadcast with `forUserIds`. The frontend filters
                # on this and applies a gold-tinged styling so the owner
                # feels the line is addressed to THEM specifically. Empty
                # list = broadcast-to-all (default for ambient commentary).
                ownership = snapshot.get('ownershipContext') or {}
                for_user_ids = list(ownership.get('ownerUserIds') or [])
                ws.push_to_channel(f"room#{room_code}", {
                    'type':           'commentary_update',
                    'text':           decision.get('text', ''),
                    'relatedEventId': related_event_id,
                    'createdAtMs':    int(time.time() * 1000),
                    'reasoning':      decision.get('reasoning') or '',
                    'forUserIds':     for_user_ids,
                })
        # 'wait' -> no-op


# ─── Captain-suggestion mode ─────────────────────────────────────────────

# Position priority for the rule-based fallback when the model's
# recommendedPlayerId isn't in the starters whitelist. Goalkeepers are
# excluded outright — they're never a useful captain pick.
_CAPTAIN_POSITION_RANK = {
    'ST': 0, 'MS': 0,                # Strikers — top priority
    'OM': 1,                          # Attacking mid
    'LM': 2, 'RM': 2,                 # Wingers
    'ZM': 3,                          # Central mid
    'DM': 4,                          # Defensive mid
    'IV': 5, 'LV': 5, 'RV': 5,        # Defenders
    # TW (goalkeeper) intentionally absent — filtered out before ranking
}


def _fallback_captain(starters: list) -> str | None:
    """Pick the highest-priority non-keeper starter. Returns playerId or None."""
    eligible = [s for s in starters if s.get('positionCode') != 'TW']
    if not eligible:
        return None
    eligible.sort(key=lambda s: _CAPTAIN_POSITION_RANK.get(s.get('positionCode'), 99))
    return eligible[0].get('playerId')


def run_captain_suggestion(room_code: str, user_id: str, body: dict) -> dict:
    """One-shot captain recommendation for the preview phase of a draft.

    Reads `starters` (11-player XI) from the body, asks Nova Micro via the
    CAPTAIN_PROMPT, validates the recommended playerId against the
    starters whitelist. Falls back to a deterministic position-priority
    pick on validation failure.
    """
    starters = body.get('starters') or []
    if not isinstance(starters, list) or not starters:
        return {'recommendedPlayerId': None, 'reasoning': '', 'confidence': 0.0}

    starter_ids = {s.get('playerId') for s in starters if s.get('playerId')}
    if not starter_ids:
        return {'recommendedPlayerId': None, 'reasoning': '', 'confidence': 0.0}

    try:
        decision = _ask_captain_model(body)
    except Exception as e:
        print(f"captain-suggestion: model call failed: {e}")
        decision = {}

    rec_id = decision.get('recommendedPlayerId')
    if rec_id not in starter_ids:
        # Model returned a hallucinated id (or no id at all). Fall back to
        # the position-priority pick so the user still gets a suggestion.
        rec_id = _fallback_captain(starters)
        if not rec_id:
            return {'recommendedPlayerId': None, 'reasoning': '', 'confidence': 0.0}
        rec_player = next((s for s in starters if s.get('playerId') == rec_id), {})
        return {
            'recommendedPlayerId': rec_id,
            'reasoning': f"Brezn defaulted to {rec_player.get('displayName', 'your top attacker')} ({rec_player.get('positionCode', '?')}).",
            'confidence': 0.5,
        }

    return {
        'recommendedPlayerId': rec_id,
        'reasoning': decision.get('reasoning') or '',
        'confidence': float(decision.get('confidence') or 0.7),
    }


def _ask_captain_model(payload: dict) -> dict:
    """Invoke Bedrock with the CAPTAIN_PROMPT and return the parsed JSON."""
    t0 = time.time()
    response = bedrock.converse(
        modelId=MODEL_ID,
        system=[{'text': CAPTAIN_PROMPT}],
        messages=[{
            'role': 'user',
            'content': [{'text': build_captain_message(payload)}],
        }],
        inferenceConfig={
            'maxTokens': 200,    # Output is small — recommendedPlayerId + 1 sentence
            'temperature': 0.3,  # Slightly lower than tick — favors consistent picks
        },
    )
    elapsed_ms = (time.time() - t0) * 1000
    text = response['output']['message']['content'][0]['text'].strip()

    # Strip code fences if the model added them.
    if text.startswith('```'):
        text = text.strip('`')
        if text.lower().startswith('json'):
            text = text[4:]
        text = text.strip()

    decision = json.loads(text)
    print(f"captain-suggestion latency={elapsed_ms:.0f}ms rec={decision.get('recommendedPlayerId')!r} reasoning={decision.get('reasoning')!r}")
    return decision
