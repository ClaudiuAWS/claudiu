import json
import boto3
import os
import math
from datetime import datetime, timezone, timedelta
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
scheduler = boto3.client('scheduler')

match_events_table = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])
matches_table      = dynamodb.Table(os.environ['MATCHES_TABLE'])

EVENT_PROCESSOR_ARN  = os.environ['EVENT_PROCESSOR_ARN']
EVENTBRIDGE_ROLE_ARN = os.environ['EVENTBRIDGE_ROLE_ARN']
SCHEDULE_GROUP       = os.environ['SCHEDULE_GROUP']

# Events that should not be scheduled — they are anchors or irrelevant
SKIP_EVENT_TYPES = {'kickoff'}


def start_match(match_id: str, speed_multiplier: float) -> dict:
    match = _get_match(match_id)
    events = _get_match_events(match_id)
    kickoff_time = _find_kickoff_time(match)  
    _mark_match_live(match_id, speed_multiplier)
    tick_schedules = _schedule_clock_ticks(
        match_id, events, kickoff_time, speed_multiplier
    )
    schedules_created = _schedule_events(
        match_id, events, kickoff_time, speed_multiplier
    )
    return {
        'matchId':          match_id,
        'status':           'live',
        'schedulesCreated': schedules_created + tick_schedules,
        'eventSchedules':   schedules_created,
        'tickSchedules':    tick_schedules,
        'speedMultiplier':  speed_multiplier,
    }

# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _get_match(match_id: str) -> dict:
    match = matches_table.get_item(
        Key={'matchId': match_id}
    ).get('Item')

    if not match:
        raise ValueError(f"Match not found: {match_id}")

    if match.get('status') == 'live':
        raise ValueError('Match is already live')

    return match


def _get_match_events(match_id: str) -> list:
    response = match_events_table.query(
        KeyConditionExpression=Key('matchId').eq(match_id)
    )
    events = response.get('Items', [])

    if not events:
        raise ValueError(f"No events found for match: {match_id}")

    return events


def _find_kickoff_time(match: dict) -> datetime:
    kickoff = match.get('kickoffTime')
    if not kickoff:
        raise ValueError('No kickoff time on match record')
    return datetime.fromisoformat(kickoff).astimezone(timezone.utc)


def _mark_match_live(match_id: str, speed_multiplier: float) -> None:
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET #s = :s, startedAt = :t, speedMultiplier = :m',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':s': 'live',
            ':t': datetime.now(timezone.utc).isoformat(),
            ':m': str(speed_multiplier),
        }
    )
    print(f"Match {match_id} marked as live")


def _schedule_events(
    match_id: str,
    events: list,
    kickoff_time: datetime,
    speed_multiplier: float
) -> int:
    now = datetime.now(timezone.utc)
    schedules_created = 0
    last_fire_at = now

    for event in events:
        if event['eventType'] in SKIP_EVENT_TYPES:
            continue

        event_time = datetime.fromisoformat(
            event['eventTime']
        ).astimezone(timezone.utc)

        offset_seconds = (event_time - kickoff_time).total_seconds()
        fire_at = now + timedelta(seconds=offset_seconds / speed_multiplier)

        # EventBridge schedules have second-level resolution; ensure
        # chronological events never collapse to the same timestamp.
        if fire_at <= last_fire_at:
            fire_at = last_fire_at + timedelta(seconds=1)

        if fire_at <= now:
            print(f"Skipping past event {event['eventId']} at {fire_at}")
            continue

        _create_schedule(match_id, event, fire_at)
        schedules_created += 1
        last_fire_at = fire_at

    print(f"Created {schedules_created} schedules")
    return schedules_created


def _create_schedule(match_id: str, event: dict, fire_at: datetime) -> None:
    schedule_name = f"m{match_id[-6:]}-e{event['eventId'][-10:]}"

    payload = {
        'matchId':   match_id,
        'eventId':   event['eventId'],
        'eventType': event['eventType'],
        'gameTime':  event.get('gameTime'),
        'data':      _extract_event_data(event),
    }

    scheduler.create_schedule(
        Name=schedule_name,
        GroupName=SCHEDULE_GROUP,
        ScheduleExpression=f"at({fire_at.strftime('%Y-%m-%dT%H:%M:%S')})",
        ScheduleExpressionTimezone='UTC',
        Target={
            'Arn':     EVENT_PROCESSOR_ARN,
            'RoleArn': EVENTBRIDGE_ROLE_ARN,
            'Input':   json.dumps(payload, default=str),
        },
        FlexibleTimeWindow={'Mode': 'OFF'},
        ActionAfterCompletion='DELETE',
    )

    print(f"Scheduled {event['eventType']} ({event.get('gameTime')}) at {fire_at.isoformat()}")


def _schedule_clock_ticks(
    match_id: str,
    events: list,
    kickoff_time: datetime,
    speed_multiplier: float
) -> int:
    """Schedule synthetic per-second ticks so clock advances continuously."""
    if speed_multiplier <= 0:
        return 0

    latest_event_time = max(
        datetime.fromisoformat(e['eventTime']).astimezone(timezone.utc)
        for e in events
    )
    total_game_seconds = max(
        0,
        int((latest_event_time - kickoff_time).total_seconds())
    )
    replay_seconds = max(1, math.ceil(total_game_seconds / speed_multiplier))
    now = datetime.now(timezone.utc)

    created = 0
    for replay_second in range(1, replay_seconds + 1):
        game_second = min(
            total_game_seconds,
            int(replay_second * speed_multiplier)
        )
        minutes, seconds = divmod(game_second, 60)
        game_time = f"{minutes:02d}:{seconds:02d}"
        fire_at = now + timedelta(seconds=replay_second)
        _create_tick_schedule(match_id, replay_second, game_time, fire_at)
        created += 1

    print(f"Created {created} clock tick schedules")
    return created


def _create_tick_schedule(
    match_id: str,
    replay_second: int,
    game_time: str,
    fire_at: datetime
) -> None:
    schedule_name = f"m{match_id[-6:]}-t{replay_second:04d}"
    payload = {
        'matchId': match_id,
        'eventId': f"tick-{replay_second:04d}",
        'eventType': 'clocktick',
        'gameTime': game_time,
        'data': {},
    }

    scheduler.create_schedule(
        Name=schedule_name,
        GroupName=SCHEDULE_GROUP,
        ScheduleExpression=f"at({fire_at.strftime('%Y-%m-%dT%H:%M:%S')})",
        ScheduleExpressionTimezone='UTC',
        Target={
            'Arn': EVENT_PROCESSOR_ARN,
            'RoleArn': EVENTBRIDGE_ROLE_ARN,
            'Input': json.dumps(payload, default=str),
        },
        FlexibleTimeWindow={'Mode': 'OFF'},
        ActionAfterCompletion='DELETE',
    )


def _extract_event_data(event: dict) -> dict:
    exclude = {'matchId', 'eventId', 'eventType', 'eventTime', 'gameTime', 'TTL'}
    return {k: v for k, v in event.items() if k not in exclude}