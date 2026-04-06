import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')

matches_table      = dynamodb.Table(os.environ['MATCHES_TABLE'])
match_events_table = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])


def process_event(
    match_id: str,
    run_id: str,
    event_id: str,
    event_type: str,
    game_time: str,
    data: dict,
) -> None:
    if not _is_active_run(match_id, run_id):
        print(f"Skipping stale event {event_id} for run {run_id}")
        return

    # Mark only persisted match events as fired.
    if event_type != 'clocktick':
        _mark_event_fired(match_id, event_id, run_id)

    # Route to correct handler
    if event_type == 'goal':
        _handle_goal(match_id, game_time, data)

    elif event_type == 'halftime':
        _handle_halftime(match_id, game_time, data)

    elif event_type == 'secondhalf':
        _handle_second_half(match_id, game_time)

    elif event_type == 'fulltime':
        _handle_fulltime(match_id, game_time, data)

    elif event_type in ('card', 'substitution'):
        _handle_minor_event(match_id, game_time)

    elif event_type == 'clocktick':
        _handle_clock_tick(match_id, game_time)

    else:
        print(f"Unknown event type: {event_type}")


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


def _handle_halftime(match_id: str, game_time: str, data: dict) -> None:
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
# Private helpers
# ─────────────────────────────────────────

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