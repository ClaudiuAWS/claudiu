import json
import boto3
import os
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
    kickoff_time = _find_kickoff_time(events)

    _mark_match_live(match_id, speed_multiplier)

    schedules_created = _schedule_events(
        match_id, events, kickoff_time, speed_multiplier
    )

    return {
        'matchId':          match_id,
        'status':           'live',
        'schedulesCreated': schedules_created,
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


def _find_kickoff_time(events: list) -> datetime:
    kickoff = next(
        (e for e in events if e['eventType'] == 'kickoff'),
        None
    )

    if not kickoff:
        raise ValueError('No kickoff event found')

    return datetime.fromisoformat(
        kickoff['eventTime']
    ).astimezone(timezone.utc)


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

    for event in events:
        if event['eventType'] in SKIP_EVENT_TYPES:
            continue

        event_time = datetime.fromisoformat(
            event['eventTime']
        ).astimezone(timezone.utc)

        offset_seconds = (event_time - kickoff_time).total_seconds()
        fire_at = now + timedelta(seconds=offset_seconds / speed_multiplier)

        if fire_at <= now:
            print(f"Skipping past event {event['eventId']} at {fire_at}")
            continue

        _create_schedule(match_id, event, fire_at)
        schedules_created += 1

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


def _extract_event_data(event: dict) -> dict:
    exclude = {'matchId', 'eventId', 'eventType', 'eventTime', 'gameTime', 'TTL'}
    return {k: v for k, v in event.items() if k not in exclude}