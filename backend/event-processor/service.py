import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')

matches_table      = dynamodb.Table(os.environ['MATCHES_TABLE'])
match_events_table = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])


def process_event(
    match_id: str,
    event_id: str,
    event_type: str,
    game_time: str,
    data: dict,
) -> None:

    # Mark event as fired in DynamoDB
    _mark_event_fired(match_id, event_id)

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

    else:
        print(f"Unknown event type: {event_type}")


# ─────────────────────────────────────────
# Event handlers
# ─────────────────────────────────────────

def _handle_goal(match_id: str, game_time: str, data: dict) -> None:
    current_result = data.get('currentResult', '')
    home_score, away_score = _parse_result(current_result)

    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET homeScore = :h, awayScore = :a, currentMinute = :m',
        ExpressionAttributeValues={
            ':h': home_score,
            ':a': away_score,
            ':m': game_time,
        }
    )
    print(f"Goal processed — {current_result} at {game_time}")


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
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET currentMinute = :m',
        ExpressionAttributeValues={':m': game_time}
    )


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _mark_event_fired(match_id: str, event_id: str) -> None:
    match_events_table.update_item(
        Key={'matchId': match_id, 'eventId': event_id},
        UpdateExpression='SET fired = :f, firedAt = :t',
        ExpressionAttributeValues={
            ':f': True,
            ':t': datetime.now(timezone.utc).isoformat(),
        }
    )


def _parse_result(result: str) -> tuple:
    try:
        parts = result.split(':')
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0