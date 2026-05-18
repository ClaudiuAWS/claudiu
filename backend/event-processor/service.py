import boto3
import os
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key

import ws

# Badges integration — bundled into this Lambda's zip from
# `backend/shared/badges.py` by the deploy workflow. The import is
# wrapped in try/except so a missing module (e.g. an old deploy where
# the workflow change hasn't shipped yet) cannot break event processing.
try:
    import badges as _badges  # type: ignore
except Exception as _e:  # pragma: no cover
    _badges = None
    print(f"[badges] module import skipped: {_e}")

# Credits integration — same pattern as badges. Bundled from
# `backend/shared/credits.py` by the deploy workflow. Awarding credits
# on scoring events is purely additive; a failure here can never break
# the underlying fantasy scoring or room broadcast.
try:
    import credits as _credits  # type: ignore
except Exception as _e:  # pragma: no cover
    _credits = None
    print(f"[credits] module import skipped: {_e}")

# Match history integration — same additive pattern. Writes one row per
# user per match into claudiu-match-history at end-of-match time. A
# failure here cannot break the existing room cleanup or match_ended
# broadcast.
try:
    import history as _history  # type: ignore
except Exception as _e:  # pragma: no cover
    _history = None
    print(f"[history] module import skipped: {_e}")

dynamodb = boto3.resource('dynamodb')

matches_table       = dynamodb.Table(os.environ['MATCHES_TABLE'])
match_events_table  = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])
rooms_table         = dynamodb.Table(os.environ['ROOMS_TABLE'])
player_lookup_table = dynamodb.Table(os.environ['PLAYER_LOOKUP_TABLE'])


def process_event(
    match_id: str,
    run_id: str,
    event_id: str,
    event_type: str,
    game_time: str,
    data: dict,
) -> None:
    # Warmup invocation from replay-emitter at match start: short-circuit so the
    # Lambda execution context becomes hot before the first real EventBridge
    # schedule fires. Without this, the first 1-2 events of a match eat ~5s of
    # cold-start latency, which surfaces as a 25-30s match-clock lag at 5x speed.
    if event_type == '__warmup__' or match_id == '__warmup__':
        print("Warmup invocation, no-op")
        return

    if not _is_active_run(match_id, run_id):
        print(f"Skipping stale event {event_id} for run {run_id}")
        return

    # Mark only persisted match events as fired.
    if event_type != 'clocktick':
        _mark_event_fired(match_id, event_id, run_id)

    if event_type == 'goal':
        _handle_goal(match_id, game_time, data)

    elif event_type == 'halftime':
        _handle_halftime(match_id, game_time, data)

    elif event_type == 'secondhalf':
        _handle_second_half(match_id, game_time)

    elif event_type == 'fulltime':
        _handle_fulltime(match_id, game_time, data)

    elif event_type in ('card', 'substitution', 'offside',
                        'nutmeg', 'spectacular_play'):
        _handle_minor_event(match_id, game_time)

    elif event_type == 'saved_shot':
        _handle_minor_event(match_id, game_time)

    elif event_type == 'clocktick':
        _handle_clock_tick(match_id, game_time)
        return

    else:
        print(f"Unknown event type: {event_type}")
        return

    # Push updated match state + the triggering event FIRST so the frontend
    # receives events in strict chronological order. Room scoring happens after
    # (it arrives separately via score_update messages on the room channel).
    match = matches_table.get_item(
        Key={'matchId': match_id}, ConsistentRead=True
    ).get('Item', {})
    ws.push_to_channel(f"match#{match_id}", {
        'type':      'match_update',
        'match':     match,
        'event':     {
            'eventId':   event_id,
            'eventType': event_type,
            'gameTime':  game_time,
            'data':      data,
        },
    })

    # Award/deduct fantasy points after the event is already on the client
    _score_rooms_for_event(match_id, event_type, data)

    # Open a mini-game if this event type qualifies. Runs after the WS push
    # of the event itself, so feed display is never delayed; if this fails
    # for any reason, the match continues.
    try:
        _trigger_minigame_for_event(match_id, event_id, event_type, game_time, data)
    except Exception as e:
        print(f"Mini-game trigger failed (non-fatal): {e}")


# ─────────────────────────────────────────
# Event handlers
# ─────────────────────────────────────────

def _handle_goal(match_id: str, game_time: str, data: dict) -> None:
    current_result = data.get('currentResult', '')
    new_home, new_away = _parse_result(current_result)

    existing = matches_table.get_item(
        Key={'matchId': match_id}, ConsistentRead=True
    ).get('Item') or {}
    old_home = _int_score(existing.get('homeScore', 0))
    old_away = _int_score(existing.get('awayScore', 0))

    new_total = new_home + new_away
    old_total = old_home + old_away
    # Goals can fire out of schedule order; a later goal may commit before an earlier one.
    # Never lower total goals (e.g. 2:0 must not overwrite 3:0).
    if new_total < old_total:
        home_score, away_score = old_home, old_away
    else:
        home_score = max(old_home, new_home)
        away_score = max(old_away, new_away)

    minute = _merge_minute_value(existing.get('currentMinute'), game_time)

    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET homeScore = :h, awayScore = :a, currentMinute = :m',
        ExpressionAttributeValues={
            ':h': home_score,
            ':a': away_score,
            ':m': minute,
        }
    )
    print(f"Goal processed — {current_result} at {game_time} (board {home_score}:{away_score})")


def _is_already_past(match_id: str, game_time: str) -> bool:
    """True if the match record's currentMinute is already past `game_time`.
    Boundary events (halftime/secondhalf/fulltime) call this to refuse regressing
    state when SQS / EventBridge delivers them out of order — e.g. secondhalf
    processed before halftime due to scheduler jitter, then halftime arriving
    later must NOT reset status to 'halftime' or rewind currentMinute to 51:00.
    """
    existing = matches_table.get_item(
        Key={'matchId': match_id}, ConsistentRead=True
    ).get('Item') or {}
    existing_sec = _game_time_seconds(existing.get('currentMinute'))
    new_sec      = _game_time_seconds(game_time)
    return existing_sec > new_sec >= 0


def _handle_halftime(match_id: str, game_time: str, data: dict) -> None:
    if _is_already_past(match_id, game_time):
        print(f"Skipping halftime at {game_time} — match already advanced past it (out-of-order arrival)")
        return
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET #s = :s, currentMinute = :m',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':s': 'halftime',
            ':m': game_time,
        }
    )
    print(f"Halftime processed — {data.get('finalResult')} at {game_time}")


def _handle_second_half(match_id: str, game_time: str) -> None:
    if _is_already_past(match_id, game_time):
        # 2H state is already further along; just ensure status reflects 'live'.
        matches_table.update_item(
            Key={'matchId': match_id},
            UpdateExpression='SET #s = :s',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'live'},
        )
        print(f"Second-half marker at {game_time} — match already past, status pinned 'live'")
        return
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET #s = :s, currentMinute = :m',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':s': 'live',
            ':m': game_time,
        }
    )
    print(f"Second half started at {game_time}")


def _handle_fulltime(match_id: str, game_time: str, data: dict) -> None:
    if _is_already_past(match_id, game_time):
        # Defensive: shouldn't happen since fulltime has the highest gameTime,
        # but if it does, never regress.
        print(f"Skipping fulltime at {game_time} — match already advanced past it")
        return
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET #s = :s, currentMinute = :m, finishedAt = :f',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':s': 'fulltime',
            ':m': game_time,
            ':f': datetime.now(timezone.utc).isoformat(),
        }
    )
    _end_rooms(match_id, data.get('finalResult'))
    print(f"Fulltime processed — {data.get('finalResult')} at {game_time}")


def _handle_minor_event(match_id: str, game_time: str) -> None:
    # Cards/subs may be scheduled after a later gameTime goal (XML eventTime order).
    # Never move the match clock backward.
    existing = matches_table.get_item(
        Key={'matchId': match_id}, ConsistentRead=True
    ).get('Item') or {}
    minute = _merge_minute_value(existing.get('currentMinute'), game_time)
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET currentMinute = :m',
        ExpressionAttributeValues={':m': minute}
    )


def _handle_clock_tick(match_id: str, game_time: str) -> None:
    # Legacy: ticks disabled in replay-emitter; ignore any in-flight schedules.
    return


# ─────────────────────────────────────────
# Fantasy scoring (FPL-style positional weights)
# ─────────────────────────────────────────

# German position code → FPL bucket. The goal-scorer's position lives on the
# event payload (data.position); for card/save we look up the owner's position
# via member.teamSelectionDetails. Anything not in the GK/DEF/FWD lists falls
# through to MID, which matches FPL's default treatment of central/wide mids.
_GK_CODES  = {'TW'}
_DEF_CODES = {'IVL', 'IVR', 'IVZ', 'IV', 'LV', 'RV'}
_FWD_CODES = {'ST', 'STZ', 'STL', 'STR', 'MS', 'LF', 'RF', 'LA', 'RA'}

# FPL goal values per bucket. Mirrors official Fantasy Premier League:
# defenders score the most because their goals are rarer; forwards score
# least because that's their job. GK at +10 reflects an outlier event.
_GOAL_VALUE = {'GK': 10, 'DEF': 6, 'MID': 5, 'FWD': 4}


def _bucket(position_code: str | None) -> str:
    if not position_code:
        return 'MID'
    code = position_code.upper()
    if code in _GK_CODES:  return 'GK'
    if code in _DEF_CODES: return 'DEF'
    if code in _FWD_CODES: return 'FWD'
    return 'MID'


def _score_rooms_for_event(match_id: str, event_type: str, data: dict) -> None:
    if event_type not in ('goal', 'card', 'saved_shot'):
        return
    # GSI is eventually consistent — use it only to find which rooms are
    # active for this match, NOT to read members. Then strong-consistent
    # GetItem each room before computing/writing the delta. Without this,
    # two events firing close together each read a stale members snapshot
    # and their writes overwrite each other's score increases — accumulated
    # scores systematically regress as the match progresses.
    response = rooms_table.query(
        IndexName='matchId-index',
        KeyConditionExpression=Key('matchId').eq(match_id),
        ProjectionExpression='roomCode, #s',
        ExpressionAttributeNames={'#s': 'status'},
    )
    for r in response.get('Items', []):
        if r.get('status') == 'ended':
            continue
        fresh = rooms_table.get_item(
            Key={'roomCode': r['roomCode']},
            ConsistentRead=True,
        ).get('Item')
        if not fresh:
            continue
        # Each entry: {userId, delta, reason, playerName}.
        # `reason` and `playerName` are surfaced in score_update.changes so the
        # frontend toast can read like "+6 — Olise scored for your squad".
        member_changes = _calculate_member_changes(fresh, event_type, data)
        if any(c['delta'] != 0 for c in member_changes):
            # Thread the source event id through so the WS broadcast can
            # carry it on each score_change — the frontend uses it as the
            # ironclad dedup key between its optimistic append and this
            # WS broadcast.
            _apply_member_changes(
                fresh, member_changes, event_type,
                source_event_id=data.get('eventId') or '',
            )

            # Badges layer (additive — wrapped so a failure here can never
            # break scoring or the room broadcast above). Reconstructs the
            # same score_changes shape that _apply_member_changes already
            # broadcast, then passes it to the badges evaluator. We do
            # this OUTSIDE _apply_member_changes intentionally to keep its
            # signature and behaviour 100% unchanged.
            if _badges is not None:
                try:
                    badge_changes = []
                    for c in member_changes:
                        if c.get('delta'):
                            badge_changes.append({
                                'userId':        c['userId'],
                                'delta':         c['delta'],
                                'eventType':     event_type,
                                'reason':        c.get('reason') or '',
                                'playerName':    c.get('playerName') or '',
                                'sourceEventId': data.get('eventId') or '',
                            })
                    if badge_changes:
                        _badges.evaluate_score_changes(
                            room=fresh,
                            score_changes=badge_changes,
                            event_type=event_type,
                            match_id=match_id,
                            event_data=data,
                        )
                except Exception as _e:  # pragma: no cover
                    print(f"[badges] evaluate_score_changes failed: {_e}")

            # Credits layer (also additive). Awards in-game credits for
            # positive fantasy-points deltas. Same try/except discipline
            # as badges — a failure here cannot break match flow.
            if _credits is not None:
                try:
                    _credits.award_for_score_changes(
                        [
                            {
                                'userId':     c['userId'],
                                'delta':      c['delta'],
                                'eventType':  event_type,
                                'reason':     c.get('reason') or '',
                                'playerName': c.get('playerName') or '',
                            }
                            for c in member_changes if c.get('delta')
                        ],
                        match_id=match_id,
                    )
                except Exception as _e:  # pragma: no cover
                    print(f"[credits] award_for_score_changes failed: {_e}")


def _calculate_member_changes(room: dict, event_type: str, data: dict) -> list:
    """Return per-member point changes for this event.

    Shape: [{userId, delta, reason, playerName}, ...] — ALL members included
    (delta=0 for users with no involvement) so the caller can decide whether
    to surface a no-op toast (it doesn't).
    """
    members = room.get('members', [])
    out = []

    if event_type == 'goal':
        scoring_pid     = data.get('scoringPlayerId')
        scoring_display = data.get('scoringDisplay') or data.get('scoringPlayerDisplay') or ''
        scoring_pos     = data.get('position')  # German code from the goal payload
        assist_pid      = data.get('assistPlayerId')
        assist_display  = data.get('assistDisplay') or data.get('assistPlayerDisplay') or ''
        scoring_role    = data.get('scoringTeamRole')

        goal_value = _GOAL_VALUE[_bucket(scoring_pos)]

        for m in members:
            uid       = m['userId']
            details   = {d['playerId']: d for d in m.get('teamSelectionDetails', [])}
            captain   = m.get('captainPlayerId') or ''
            # Triple-captain perk armed via the credits-inventory snapshot
            # at squad-lock time → captain multiplier is ×3 for the whole
            # match instead of ×2. Falls back to ×2 when no perk is armed.
            armed_perks = set(m.get('armedPerks') or [])
            captain_mult = 3 if 'captain-triple' in armed_perks else 2
            delta, reason, name = 0, '', ''
            captained = False  # any captain-multiplied component fired?

            # Owners stack: scorer bonus + assist bonus + GK conceded penalty.
            # Captain multiplier applies per-component — if the captain
            # is the scorer, the scorer portion is multiplied; if the
            # captain is the assister, the assister portion is multiplied.
            # Conceded penalty is multiplied too when the captain IS the
            # conceding keeper, since captain-doubling-applies-to-negatives
            # matches Bundesliga Fantasy convention (the price of a bold pick).
            if scoring_pid and scoring_pid in details:
                gain = goal_value * (captain_mult if captain == scoring_pid else 1)
                if captain == scoring_pid: captained = True
                delta += gain
                reason = 'scored for your squad'
                name   = scoring_display

            if assist_pid and assist_pid in details:
                gain = 3 * (captain_mult if captain == assist_pid else 1)
                if captain == assist_pid: captained = True
                delta += gain
                if not reason:
                    reason = 'assisted for your squad'
                    name   = assist_display

            if scoring_role:
                opp_role = 'away' if scoring_role == 'home' else 'home'
                conceding_gk = next(
                    (d for d in details.values()
                     if d.get('position') == 'TW' and d.get('teamRole') == opp_role),
                    None,
                )
                if conceding_gk:
                    gk_pid = conceding_gk.get('playerId') or ''
                    loss = -1 * (captain_mult if captain and captain == gk_pid else 1)
                    if captain and captain == gk_pid: captained = True
                    delta += loss
                    if not reason:
                        reason = 'conceded'
                        name   = conceding_gk.get('displayName') or 'your keeper'

            entry = {'userId': uid, 'delta': delta, 'reason': reason, 'playerName': name}
            if captained:
                entry['captained'] = True
            out.append(entry)

    elif event_type == 'card':
        player_id     = data.get('playerId')
        player_display = data.get('playerDisplay') or ''
        card_color    = (data.get('cardColor') or '').lower()
        if card_color not in ('yellow', 'red'):
            return []
        verb = 'booked' if card_color == 'yellow' else 'sent off'
        magnitude = -1 if card_color == 'yellow' else -3
        for m in members:
            uid       = m['userId']
            selection = set(m.get('teamSelection', []))
            captain   = m.get('captainPlayerId') or ''
            armed_perks = set(m.get('armedPerks') or [])
            captain_mult = 3 if 'captain-triple' in armed_perks else 2
            if player_id and player_id in selection:
                is_captain = (captain == player_id)
                entry = {
                    'userId':     uid,
                    'delta':      magnitude * (captain_mult if is_captain else 1),
                    'reason':     verb,
                    'playerName': player_display,
                }
                if is_captain: entry['captained'] = True
                out.append(entry)
            else:
                out.append({'userId': uid, 'delta': 0, 'reason': '', 'playerName': ''})

    elif event_type == 'saved_shot':
        gk_id      = data.get('goalKeeperId')
        gk_display = data.get('goalKeeperDisplay') or ''
        for m in members:
            uid     = m['userId']
            details = {d['playerId']: d for d in m.get('teamSelectionDetails', [])}
            captain = m.get('captainPlayerId') or ''
            armed_perks = set(m.get('armedPerks') or [])
            captain_mult = 3 if 'captain-triple' in armed_perks else 2
            if gk_id and gk_id in details:
                is_captain = (captain == gk_id)
                entry = {
                    'userId':     uid,
                    'delta':      2 * (captain_mult if is_captain else 1),
                    'reason':     'made a save',
                    'playerName': gk_display,
                }
                if is_captain: entry['captained'] = True
                out.append(entry)
            else:
                out.append({'userId': uid, 'delta': 0, 'reason': '', 'playerName': ''})

    return out


def _apply_member_changes(
    room: dict,
    member_changes: list,
    event_type: str,
    source_event_id: str = '',
) -> None:
    members       = room.get('members', [])
    score_changes = []
    by_user       = {c['userId']: c for c in member_changes}

    for m in members:
        c = by_user.get(m['userId'])
        if not c or c['delta'] == 0:
            continue
        new_score  = int(m.get('score', 0)) + c['delta']
        m['score'] = new_score
        score_changes.append({
            'userId':        m['userId'],
            'delta':         c['delta'],
            'newScore':      new_score,
            'eventType':     event_type,
            'reason':        c.get('reason') or '',
            'playerName':    c.get('playerName') or '',
            'captained':     bool(c.get('captained')),
            # Stable id used by the frontend score_update handler to
            # dedup the optimistic append against this WS broadcast.
            'sourceEventId': source_event_id or '',
        })

    if not score_changes:
        return

    rooms_table.update_item(
        Key={'roomCode': room['roomCode']},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )

    leaderboard = sorted(
        [{'userId': m['userId'], 'displayName': m['displayName'], 'score': int(m.get('score', 0))} for m in members],
        key=lambda x: x['score'],
        reverse=True,
    )
    ws.push_to_channel(f"room#{room['roomCode']}", {
        'type':        'score_update',
        'leaderboard': leaderboard,
        'changes':     score_changes,
    })
    print(f"Scored room {room['roomCode']}: {score_changes}")


# ─────────────────────────────────────────
# Mini-game triggers
# ─────────────────────────────────────────

# Match-event types that open a mini-game in active rooms. Each entry maps to
# a (gameType, durationSec) the frontend modal recognises. Add a new entry +
# implement the matching child component to add a new game vertical.
MINIGAME_TRIGGERS = {
    'offside':  ('OFFSIDE_REFLEX',  8),
    # 15 in-game minutes worth of halftime break (the standard real-football
    # interval). At default 5× speed, that's 180 wall seconds.
    'halftime': ('HALFTIME_QUIZ',   180),
    # Penalties don't have their own eventType — see fallback inside
    # `_trigger_minigame_for_event` that maps eventType:'goal' +
    # isPenalty:true to PENALTY_SHOOTOUT.
}


def _trigger_minigame_for_event(match_id: str, event_id: str, event_type: str, game_time: str, data: dict) -> None:
    """Push a `minigame_start` WS message to active rooms when an event qualifies.

    Per FEATURES.md: each event type opens at most one mini-game per room per match
    (e.g. only the *first* offside fires the modal; subsequent ones stay feed-only).
    Tracked via `triggeredMinigames` (string set) on each room record. We never
    block the match flow — caller wraps this in try/except.
    """
    trigger = MINIGAME_TRIGGERS.get(event_type)
    # Penalties don't have their own eventType — the data loader emits them
    # as eventType:'goal' with `data.isPenalty: true`. Map here so the
    # mini-game fires when those events come through.
    if not trigger and event_type == 'goal' and data.get('isPenalty'):
        trigger = ('PENALTY_SHOOTOUT', 10)
    if not trigger:
        return
    game_type, duration_sec = trigger

    response = rooms_table.query(
        IndexName='matchId-index',
        KeyConditionExpression=Key('matchId').eq(match_id),
    )
    for room in response.get('Items', []):
        if room.get('status') == 'ended':
            continue
        room_code = room['roomCode']
        already = room.get('triggeredMinigames') or set()
        # DynamoDB returns string sets as Python sets when read; make tolerant.
        already_set = set(already) if not isinstance(already, set) else already
        # Per-event idempotency (was per-event_type previously). With the
        # event_id key, multiple events of the same type — e.g. several
        # offsides in a match — each get to broadcast their own mini-game
        # exactly once. Halftime/penalty events are single-occurrence so
        # they're still naturally once-per-match.
        if event_id in already_set:
            continue

        # Mark BEFORE pushing so a retry can't re-open the modal.
        try:
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='ADD triggeredMinigames :v',
                ExpressionAttributeValues={':v': {event_id}},
            )
        except Exception as e:
            print(f"Failed to mark minigame trigger on room {room_code}: {e}")
            continue

        ownership = _compute_ownership_context(room, event_type, data)
        config = {
            'durationMs': duration_sec * 1000,
            'gameTime':   game_time,
            'eventType':  event_type,
            'eventData':  data,
        }
        if game_type == 'OFFSIDE_REFLEX':
            # The "offside moment" is when the attacker's marker hits the defender
            # line. Pin it midway through the countdown so users can tap before
            # OR after; the bracket scores absolute delta from this moment.
            config['offsideMomentMs'] = duration_sec * 1000 // 2
            config['playerName'] = data.get('playerDisplay') or data.get('playerName')
            config['teamRole']   = data.get('teamRole')
        elif game_type == 'PENALTY_SHOOTOUT':
            # Penalty taker context — frontend uses `advantagedUserId` from
            # ownership to assign shooter vs. keeper role.
            config['takerName']  = data.get('scoringDisplay') or data.get('playerDisplay') or data.get('penaltyTakerId')
            config['teamRole']   = data.get('teamRole') or data.get('scoringTeamRole')
        elif game_type == 'HALFTIME_QUIZ':
            # Match-aware halftime quiz: questions built from THIS match's
            # roster + first-half goals (Bayern's keeper, Kimmich's position,
            # who scored the opener, etc.). Falls back to the static rules
            # pool only when DDB roster lookup fails (e.g. before the loader
            # ran). The AI Director can still overwrite via its own
            # minigame_start broadcast with custom `questions` — the
            # commentator's match-aware Bedrock quiz wins when validation
            # passes. Seed by match_id + event_id for deterministic output.
            config['questions'] = _match_aware_quiz_questions(
                match_id, count=3, seed=f"{match_id}#{event_id}",
            )

        payload = {
            'type':                'minigame_start',
            'gameId':              f"{event_id}#{room_code}",
            'gameType':            game_type,
            'title':               _minigame_title(game_type, data),
            'prompt':              _minigame_prompt(game_type, ownership),
            'config':              config,
            'startedAtMs':         int(datetime.now(timezone.utc).timestamp() * 1000),
            'durationMs':          duration_sec * 1000,
            'relatedEventId':      event_id,
            'ownershipContext':    ownership,
        }
        ws.push_to_channel(f"room#{room_code}", payload)
        print(f"Mini-game {game_type} started for room {room_code} on {event_type} event")


def _compute_ownership_context(room: dict, event_type: str, data: dict) -> dict:
    """Identify which member's XI contains the involved player.

    Returns the full FEATURES.md §R1 context shape so per-game scoring can
    award ownership bonuses without re-querying.
    """
    members = room.get('members', [])
    involved_player_id = (
        data.get('playerId')
        or data.get('scoringPlayerId')
        or data.get('goalKeeperId')
    )
    owners = []
    if involved_player_id:
        for m in members:
            details = {d['playerId']: d for d in m.get('teamSelectionDetails', [])}
            if involved_player_id in details:
                owners.append(m['userId'])
    return {
        'matchEventType':     event_type,
        # Frontend MatchMiniGameModal looks up the player avatar by
        # `state.ownershipContext?.playerId`. The frontend reveal trigger
        # produces that exact key, so keep both backend and frontend in
        # sync by emitting both `playerId` (canonical for the modal) and
        # `involvedPlayerId` (legacy / context name).
        'playerId':           involved_player_id,
        'involvedPlayerId':   involved_player_id,
        'involvedPlayerName': data.get('playerDisplay') or data.get('playerName'),
        'ownerUserIds':       owners,
        'neutralEvent':       len(owners) != 1,
        'advantagedUserId':   owners[0] if len(owners) == 1 else None,
    }


def _minigame_title(game_type: str, data: dict) -> str:
    if game_type == 'OFFSIDE_REFLEX':
        return 'Offside Reflex'
    if game_type == 'PENALTY_SHOOTOUT':
        return 'Penalty Shootout'
    if game_type == 'HALFTIME_QUIZ':
        return 'Halftime Quiz'
    if game_type == 'QUIZ_BATTLE':
        return 'Quiz Battle'
    return 'Mini-game'


def _minigame_prompt(game_type: str, ownership: dict) -> str:
    if game_type == 'OFFSIDE_REFLEX':
        if ownership.get('advantagedUserId'):
            return f"{ownership.get('involvedPlayerName') or 'A player'} caught offside — tap when they cross the line."
        return 'Tap when the attacker crosses the offside line.'
    if game_type == 'PENALTY_SHOOTOUT':
        name = ownership.get('involvedPlayerName')
        if name:
            return f"{name} steps up to take the penalty — pick your corner!"
        return 'Penalty kick — shooter aims, keeper dives. Match for the save.'
    if game_type == 'HALFTIME_QUIZ':
        return 'Halftime trivia — three questions, faster correct answers win.'
    return ''


# ─────────────────────────────────────────
# Halftime quiz fallback questions
# ─────────────────────────────────────────
# Python mirror of `frontend/src/utils/quizFallback.js`. Kept in sync so
# the non-Director trigger path serves coherent questions when Bedrock is
# down or returns malformed output. Each entry: {q, choices[4],
# correctIdx, category}.

# Mulberry32 PRNG mirror of the JS implementation in
# `frontend/src/utils/quizFallback.js`. Same seed → same sequence on both
# sides, so backend-broadcast questions match what each client would have
# computed locally.

def _quiz_hash_seed(s: str) -> int:
    """FNV-1a-style 32-bit hash mirroring `_hashSeed` in quizFallback.js."""
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) & 0xFFFFFFFF
    return h


def _quiz_mulberry32(seed: int):
    state = [seed & 0xFFFFFFFF]
    def rand():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        r = state[0]
        r = ((r ^ (r >> 15)) * (r | 1)) & 0xFFFFFFFF
        r = (r ^ (r + ((r ^ (r >> 7)) * (r | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((r ^ (r >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand


def _quiz_shuffle(arr: list, rand) -> None:
    """Fisher-Yates in-place, matching the JS `_shuffleInPlace`."""
    import math as _math
    for i in range(len(arr) - 1, 0, -1):
        j = int(_math.floor(rand() * (i + 1)))
        arr[i], arr[j] = arr[j], arr[i]


_QUIZ_POOL = [
    {'q': 'How many minutes are in a full football match (excluding stoppage time)?',
     'choices': ['80', '85', '90', '95'], 'correctIdx': 2, 'category': 'rules'},
    {'q': 'Which colour card means a player is sent off?',
     'choices': ['Yellow', 'Red', 'Blue', 'Green'], 'correctIdx': 1, 'category': 'rules'},
    {'q': 'Which position is most often credited with goal scoring?',
     'choices': ['Goalkeeper', 'Centre-back', 'Striker', 'Left-back'], 'correctIdx': 2, 'category': 'positions'},
    {'q': 'A penalty kick is taken from how far out?',
     'choices': ['9 metres', '11 metres', '13 metres', '15 metres'], 'correctIdx': 1, 'category': 'rules'},
    {'q': 'How many players from each team start a match on the pitch?',
     'choices': ['10', '11', '12', '13'], 'correctIdx': 1, 'category': 'rules'},
    {'q': 'What is FPL?',
     'choices': ['Free Player List', 'Fantasy Premier League', 'Final Penalty Line', 'Foul Per Lap'],
     'correctIdx': 1, 'category': 'fpl'},
    {'q': 'Which of these is NOT a real on-field position?',
     'choices': ['Right Wing', 'Sweeper', 'Setter', 'Trequartista'], 'correctIdx': 2, 'category': 'positions'},
    {'q': 'In which country was the modern football association founded?',
     'choices': ['Germany', 'Brazil', 'England', 'Italy'], 'correctIdx': 2, 'category': 'history'},
]


def _fallback_quiz_questions(count: int = 3, seed: str = None) -> list:
    """Return `count` fresh questions, shuffled, with shuffled answer order
    (correctIdx adjusted). When `seed` is provided, the output is
    deterministic and matches the JS `pickFallbackQuestions(count, seed)`
    output byte-for-byte — so backend-broadcast and frontend-driven trigger
    paths produce IDENTICAL question lineups."""
    if seed is not None:
        rand = _quiz_mulberry32(_quiz_hash_seed(str(seed)))
    else:
        # Unseeded fallback for non-room contexts (testing). Uses Python's
        # builtin which won't match the JS side — only acceptable when no
        # client comparison is happening.
        import random as _quiz_random
        rand = _quiz_random.random
    indices = list(range(len(_QUIZ_POOL)))
    _quiz_shuffle(indices, rand)
    picked = [_QUIZ_POOL[i] for i in indices[:count]]
    out = []
    for q in picked:
        idxs = list(range(len(q['choices'])))
        _quiz_shuffle(idxs, rand)
        choices = [q['choices'][i] for i in idxs]
        correct_idx = idxs.index(q['correctIdx'])
        out.append({
            'q':          q['q'],
            'choices':    choices,
            'correctIdx': correct_idx,
            'category':   q['category'],
        })
    return out


# ─────────────────────────────────────────
# Match-aware halftime quiz
# ─────────────────────────────────────────
# Builds quiz questions from the LIVE match: players in this fixture, their
# positions, and the first-half goal events. The Brezn Commentator can still
# overwrite this with its Bedrock-generated quiz via the director-handler
# Lambda; the match-aware path is the deterministic baseline so users never
# see the generic-rules pool when real data is available.

# German position code → readable label for trivia choices. Long codes from
# the loader's normalization (IVZ, STR, etc.) all collapse to the family name
# so question choices read naturally.
_POS_LABEL = {
    'TW':  'Goalkeeper',
    'IV':  'Centre-back', 'IVZ': 'Centre-back', 'IVL': 'Centre-back', 'IVR': 'Centre-back',
    'LV':  'Left-back',
    'RV':  'Right-back',
    'DM':  'Defensive Midfielder', 'DMZ': 'Defensive Midfielder',
    'DML': 'Defensive Midfielder', 'DMR': 'Defensive Midfielder',
    'ZM':  'Central Midfielder',
    'OM':  'Attacking Midfielder', 'ZO':  'Attacking Midfielder',
    'OLM': 'Attacking Midfielder', 'ORM': 'Attacking Midfielder',
    'LM':  'Left Winger',  'DLM': 'Left Winger',
    'RM':  'Right Winger', 'DRM': 'Right Winger',
    'LA':  'Left Forward',
    'RA':  'Right Forward',
    'MS':  'Striker', 'ST': 'Striker', 'STZ': 'Striker', 'STL': 'Striker', 'STR': 'Striker',
}

# Plausible distractor clubs for "which team does X play for?" questions.
# Picked from well-known Bundesliga sides so the wrong answers feel real
# even when the user is fairly sure of the right one.
_DISTRACTOR_CLUBS = [
    'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
    'Eintracht Frankfurt', 'VfB Stuttgart', 'Borussia Mönchengladbach',
    'Schalke 04', '1. FC Köln',
]


def _gametime_seconds(gt) -> int:
    """Parse 'MM:SS' game-clock strings to seconds. Returns a large sentinel
    on parse failure so unparseable events sort to the end."""
    if gt is None:
        return 999999
    s = str(gt).strip()
    parts = s.split(':')
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            pass
    return 999999


def _load_match_roster(match_id: str) -> list:
    """All player_lookup rows for this match. Paginates DDB."""
    items = []
    kwargs = {'KeyConditionExpression': Key('matchId').eq(match_id)}
    while True:
        resp = player_lookup_table.query(**kwargs)
        items.extend(resp.get('Items', []))
        lek = resp.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek
    return items


def _load_first_half_goals(match_id: str, roster_by_id: dict) -> list:
    """All goal events with gameTime <= 45:00, in chronological order.
    Each goal carries: {gameTimeSecs, teamRole, scorerName}."""
    items = []
    kwargs = {'KeyConditionExpression': Key('matchId').eq(match_id)}
    while True:
        resp = match_events_table.query(**kwargs)
        items.extend(resp.get('Items', []))
        lek = resp.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek

    goals = []
    for e in items:
        if e.get('eventType') != 'goal':
            continue
        secs = _gametime_seconds(e.get('gameTime'))
        if secs > 45 * 60:
            continue
        data = e.get('data') or {}
        scorer_id = data.get('scoringPlayerId') or data.get('playerId')
        scorer = roster_by_id.get(scorer_id) if scorer_id else None
        scorer_name = (scorer or {}).get('displayName') \
            or data.get('scoringDisplay') or data.get('playerDisplay') \
            or data.get('scoringPlayerName') or data.get('playerName')
        team_role = (scorer or {}).get('teamRole') \
            or data.get('scoringTeamRole') or data.get('teamRole')
        if not scorer_name or not team_role:
            continue
        goals.append({
            'gameTimeSecs': secs,
            'teamRole':     team_role,
            'scorerName':   scorer_name,
        })
    goals.sort(key=lambda g: g['gameTimeSecs'])
    return goals


def _build_quiz_candidates(roster: list, goals: list, home_team: str, away_team: str) -> list:
    """Build a pool of match-aware quiz candidates from roster + goal data.
    Each candidate has the canonical {q, choices (4), correctIdx: 0, category}
    shape — correctIdx is 0 at build time and gets shuffled later."""
    candidates = []

    # Skip rows that lack the basic fields we read from.
    starters = [p for p in roster if p.get('starting') and p.get('displayName')]
    if not starters:
        return candidates

    # ── Q-type: which team does {player} play for? ────────────────────────
    # Use up to 4 random starters to keep variety from match to match.
    for p in starters[:6]:
        team_role = p.get('teamRole')
        if team_role not in ('home', 'away'):
            continue
        correct = home_team if team_role == 'home' else away_team
        other   = away_team if team_role == 'home' else home_team
        # Distractors: the other team in this match + 2 unrelated clubs
        distractors = [other]
        for club in _DISTRACTOR_CLUBS:
            if club != correct and club != other and len(distractors) < 3:
                distractors.append(club)
        candidates.append({
            'q':          f"Which team does {p['displayName']} play for in this match?",
            'choices':    [correct] + distractors,
            'correctIdx': 0,
            'category':   'history',
        })

    # ── Q-type: what position does {player} play? ─────────────────────────
    for p in starters[:8]:
        label = _POS_LABEL.get(p.get('position'))
        if not label:
            continue
        # Distractors: 3 other position labels (deduped, excluding the correct)
        others = sorted({v for v in _POS_LABEL.values() if v != label})
        if len(others) < 3:
            continue
        # Take the first 3 — RNG-shuffled later in the outer flow
        candidates.append({
            'q':          f"What position does {p['displayName']} play?",
            'choices':    [label, others[0], others[1], others[2]],
            'correctIdx': 0,
            'category':   'positions',
        })

    # ── Q-type: who started in goal for {team}? ───────────────────────────
    for team_role, team_name in (('home', home_team), ('away', away_team)):
        keepers = [p for p in starters
                   if p.get('teamRole') == team_role and p.get('position') == 'TW']
        outfield = [p for p in starters
                    if p.get('teamRole') == team_role and p.get('position') != 'TW']
        if not keepers or len(outfield) < 3:
            continue
        keeper_name = keepers[0]['displayName']
        distractors = [op['displayName'] for op in outfield[:3]]
        candidates.append({
            'q':          f"Who started in goal for {team_name}?",
            'choices':    [keeper_name] + distractors,
            'correctIdx': 0,
            'category':   'positions',
        })

    # ── Q-type: who scored {team}'s opening goal? ─────────────────────────
    # Match-event grounded — only fires when first half actually had a goal.
    for team_role, team_name in (('home', home_team), ('away', away_team)):
        team_goals = [g for g in goals if g.get('teamRole') == team_role]
        if not team_goals:
            continue
        scorer = team_goals[0]['scorerName']
        # Distractors from the same team's outfield starters, skipping the scorer
        teammates = [p['displayName'] for p in starters
                     if p.get('teamRole') == team_role
                     and p.get('position') != 'TW'
                     and p.get('displayName') != scorer]
        if len(teammates) < 3:
            continue
        candidates.append({
            'q':          f"Who scored {team_name}'s opening goal of the first half?",
            'choices':    [scorer] + teammates[:3],
            'correctIdx': 0,
            'category':   'goals',
        })

    # ── Q-type: halftime score ────────────────────────────────────────────
    home_goals = sum(1 for g in goals if g.get('teamRole') == 'home')
    away_goals = sum(1 for g in goals if g.get('teamRole') == 'away')
    correct_score = f"{home_goals}-{away_goals}"
    # Plausible distractors: nearby scores not equal to the truth
    distractor_scores = []
    for dh, da in [
        (home_goals + 1, away_goals),
        (home_goals,     away_goals + 1),
        (max(0, home_goals - 1), away_goals),
        (home_goals,     max(0, away_goals - 1)),
        (home_goals + 1, away_goals + 1),
        (0, 0),
        (1, 0),
        (0, 1),
    ]:
        s = f"{dh}-{da}"
        if s != correct_score and s not in distractor_scores:
            distractor_scores.append(s)
        if len(distractor_scores) == 3:
            break
    if len(distractor_scores) == 3:
        candidates.append({
            'q':          'What was the score at halftime?',
            'choices':    [correct_score] + distractor_scores,
            'correctIdx': 0,
            'category':   'stats',
        })

    return candidates


def _match_aware_quiz_questions(match_id: str, count: int = 3, seed: str = None) -> list:
    """Build halftime quiz questions from THIS match's roster + first-half
    goal events. Falls back to the static rules pool when DDB data is
    insufficient (e.g. loader hasn't run, no players, sparse roster)."""
    if seed is not None:
        rand = _quiz_mulberry32(_quiz_hash_seed(str(seed)))
    else:
        import random as _quiz_random
        rand = _quiz_random.random

    # Load roster + events. If anything fails (missing IAM, empty table,
    # network), fall back to the static pool — never block the quiz.
    try:
        roster = _load_match_roster(match_id)
    except Exception as e:
        print(f"[quiz] roster load failed: {e}, using static fallback")
        return _fallback_quiz_questions(count, seed)

    if not roster or sum(1 for p in roster if p.get('starting')) < 11:
        print(f"[quiz] insufficient roster ({len(roster)} rows), using static fallback")
        return _fallback_quiz_questions(count, seed)

    roster_by_id = {p.get('playerId'): p for p in roster if p.get('playerId')}
    try:
        goals = _load_first_half_goals(match_id, roster_by_id)
    except Exception as e:
        print(f"[quiz] goal-events load failed: {e}, continuing with roster only")
        goals = []

    try:
        match = matches_table.get_item(Key={'matchId': match_id}).get('Item') or {}
    except Exception:
        match = {}
    home_team = match.get('homeTeamName') or 'Home'
    away_team = match.get('awayTeamName') or 'Away'

    candidates = _build_quiz_candidates(roster, goals, home_team, away_team)

    # Backstop: if not enough candidates, top up from the static pool so
    # we always return `count` questions. The mix-in is deterministic
    # because the seeded RNG drives both shuffles below.
    if len(candidates) < count:
        topup_needed = count - len(candidates)
        candidates.extend(_fallback_quiz_questions(topup_needed, seed=f"{seed}#static"))

    # Shuffle candidate order + answer order deterministically by the room seed
    _quiz_shuffle(candidates, rand)
    picked = candidates[:count]
    out = []
    for q in picked:
        idxs = list(range(len(q['choices'])))
        _quiz_shuffle(idxs, rand)
        choices = [q['choices'][i] for i in idxs]
        correct_idx = idxs.index(q['correctIdx'])
        out.append({
            'q':          q['q'],
            'choices':    choices,
            'correctIdx': correct_idx,
            'category':   q['category'],
        })
    return out


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _cleanup_rooms(match_id: str) -> None:
    response = rooms_table.query(
        IndexName='matchId-index',
        KeyConditionExpression=Key('matchId').eq(match_id),
    )
    for room in response.get('Items', []):
        code = room['roomCode']
        rooms_table.delete_item(Key={'roomCode': code})
        ws.push_to_channel(f"room#{code}", {'type': 'room_closed'})
    count = len(response.get('Items', []))
    if count:
        print(f"Cleaned up {count} rooms for match {match_id}")


def _end_rooms(match_id: str, final_result: str) -> None:
    """Mark rooms as ended so users can join new rooms, but keep them visible for post-match UX."""
    response = rooms_table.query(
        IndexName='matchId-index',
        KeyConditionExpression=Key('matchId').eq(match_id),
    )
    for room in response.get('Items', []):
        code = room['roomCode']
        rooms_table.update_item(
            Key={'roomCode': code},
            UpdateExpression='SET #s = :s',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'ended'},
        )
        ws.push_to_channel(f"room#{code}", {
            'type':        'match_ended',
            'finalResult': final_result,
        })

        # Match history (additive — wrapped so a failure here cannot
        # affect the room state above or any subsequent cleanup). Writes
        # one permanent row per user into claudiu-match-history.
        if _history is not None:
            try:
                _history.record_match_end(room, final_result)
            except Exception as _e:  # pragma: no cover
                print(f"[history] record_match_end failed for {code}: {_e}")

        # Match-end credit bonuses — participation, winner (scaled by
        # fantasy-pts gap to runner-up), clean sheet, captain delivered,
        # daily-first-match. Additive on top of the per-event payouts
        # that already fired during the match. Wrapped so a credit
        # failure can never affect room cleanup or history.
        if _credits is not None:
            try:
                _credits.award_match_end_bonuses(room, final_result)
            except Exception as _e:  # pragma: no cover
                print(f"[credits] award_match_end_bonuses failed for {code}: {_e}")

    count = len(response.get('Items', []))
    if count:
        print(f"Ended {count} rooms for match {match_id}")


def _mark_event_fired(match_id: str, event_id: str, run_id: str) -> None:
    match_events_table.update_item(
        Key={'matchId': match_id, 'eventId': event_id},
        UpdateExpression='SET fired = :f, firedAt = :t, firedRunId = :r',
        ExpressionAttributeValues={
            ':f': True,
            ':t': datetime.now(timezone.utc).isoformat(),
            ':r': run_id,
        }
    )


def _parse_result(result: str) -> tuple:
    try:
        parts = result.split(':')
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0


def _int_score(value) -> int:
    if value is None:
        return 0
    if hasattr(value, 'as_tuple'):
        return int(value)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _game_time_seconds(gt: str) -> int:
    if not gt:
        return -1
    s = str(gt).strip()
    parts = s.split(':')
    if len(parts) != 2:
        return -1
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return -1


def _merge_minute_value(current, proposed: str) -> str:
    """Keep the later in-match clock; avoids out-of-order XML times rewinding the board."""
    if proposed is None:
        proposed = '00:00'
    np = _game_time_seconds(str(proposed))
    if np < 0:
        return str(current) if current is not None else '00:00'
    if current is None:
        return str(proposed)
    cp = _game_time_seconds(str(current))
    if np >= cp:
        return str(proposed)
    return str(current)


def _is_active_run(match_id: str, run_id: str) -> bool:
    if not run_id:
        return False

    match = matches_table.get_item(
        Key={'matchId': match_id}, ConsistentRead=True
    ).get('Item')
    if not match:
        return False
    return match.get('activeRunId') == run_id
