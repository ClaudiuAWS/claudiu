import json
import boto3
import os
import math
import hashlib
from datetime import datetime, timezone, timedelta
from boto3.dynamodb.conditions import Key

import ws

# Avoid Lambda timeouts / account limits from huge tick storms (e.g. speedMultiplier=1).
_MAX_TICK_SCHEDULES = 4000

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
    events = _sort_events_for_schedule(_get_match_events(match_id))
    kickoff_time = _find_kickoff_time(match)
    run_id = datetime.now(timezone.utc).isoformat()
    run_tag = hashlib.sha256(run_id.encode()).hexdigest()[:8]

    try:
        _mark_match_live(match_id, speed_multiplier, run_id)

        # Notify clients in the lobby that the match is now live
        live_match = matches_table.get_item(
            Key={'matchId': match_id}, ConsistentRead=True
        ).get('Item', {})
        ws.push_to_channel(f"match#{match_id}", {
            'type':  'match_update',
            'match': live_match,
        })
        # Do not schedule per-second clock ticks: they advance time through half-time
        # and race with event updates (causing random jumps). Match clock is driven by
        # events on the server + smooth client-side display in the UI.
        tick_schedules = 0
        schedules_created = _schedule_events(
            match_id, events, kickoff_time, speed_multiplier, run_id, run_tag
        )
        return {
            'matchId':          match_id,
            'status':           'live',
            'runId':            run_id,
            'schedulesCreated': schedules_created + tick_schedules,
            'eventSchedules':   schedules_created,
            'tickSchedules':    tick_schedules,
            'speedMultiplier':  speed_multiplier,
        }
    except Exception:
        _reset_match_after_failed_start(match_id)
        raise

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
    events = []
    kwargs = {'KeyConditionExpression': Key('matchId').eq(match_id)}
    while True:
        response = match_events_table.query(**kwargs)
        events.extend(response.get('Items', []))
        lek = response.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek

    if not events:
        raise ValueError(f"No events found for match: {match_id}")

    return events


def _sort_events_for_schedule(events: list) -> list:
    """
    DynamoDB query order is undefined. Schedule in the same order as the UI
    (match clock, then eventTime) so later-fired events never insert above
    earlier gameTime rows in the feed.
    """
    return sorted(events, key=_schedule_order_key)


def _game_clock_seconds(gt) -> int | None:
    """Match clock seconds from gameTime; keep in sync with matches/service.py."""
    if gt is None:
        return None
    try:
        if hasattr(gt, "as_tuple"):
            total = int(gt)
            if 0 <= total <= 150 * 60:
                return total
    except Exception:
        pass
    s = str(gt).strip()
    parts = s.split(":")
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            pass
    return None


def _schedule_order_key(e: dict) -> tuple:
    """Keep in sync with backend/matches/service.py _event_feed_order_key."""
    sec = _game_clock_seconds(e.get("gameTime"))
    if sec is not None:
        et = e.get("eventTime")
        return (0, sec, str(et or ""), str(e.get("eventId", "")))
    et = e.get("eventTime")
    if et is not None:
        return (1, str(et), str(e.get("eventId", "")))
    return (2, "", str(e.get("eventId", "")))


def _find_kickoff_time(match: dict) -> datetime:
    kickoff = match.get('kickoffTime')
    if not kickoff:
        raise ValueError('No kickoff time on match record')
    return datetime.fromisoformat(kickoff).astimezone(timezone.utc)


def _mark_match_live(match_id: str, speed_multiplier: float, run_id: str) -> None:
    matches_table.update_item(
        Key={'matchId': match_id},
        UpdateExpression='SET #s = :s, startedAt = :t, speedMultiplier = :m, activeRunId = :r',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':s': 'live',
            ':t': datetime.now(timezone.utc).isoformat(),
            ':m': str(speed_multiplier),
            ':r': run_id,
        }
    )
    print(f"Match {match_id} marked as live")


def _reset_match_after_failed_start(match_id: str) -> None:
    """Allow /start to be retried after a partial scheduling failure."""
    try:
        matches_table.update_item(
            Key={'matchId': match_id},
            UpdateExpression='SET #s = :s REMOVE startedAt, speedMultiplier, activeRunId',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'upcoming'},
        )
        print(f"Reset match {match_id} to upcoming after failed start")
    except Exception as e:
        print(f"Failed to reset match {match_id}: {e}")


def _schedule_events(
    match_id: str,
    events: list,
    kickoff_time: datetime,
    speed_multiplier: float,
    run_id: str,
    run_tag: str
) -> int:
    """
    Schedule each event at its **absolute** match-clock offset from kickoff
    (sec / speed_multiplier), then enforce a 1-second monotonic floor so
    EventBridge's one-shot `at(…:SS)` resolution never collapses two events
    onto the same second (which would let them fire in arbitrary order).

    Why absolute, not cumulative: the previous implementation accumulated
    `max(1, ceil(delta/speed))` per event onto `last_fire_at`. At high
    speedMultiplier (e.g. 60×), bursts of close events each rounded up to
    +1 wall second, drifting fires several seconds (= several match-minutes)
    late by the second half — e.g. a 60' sub firing when the live clock
    already showed 69'. Computing each fire time from the absolute `sec`
    eliminates rolling drift; bursts still get the +1s spread but every
    subsequent sparse event snaps back to its true target.

    Feed gameTime is continuous across half-time (51:00 → 51:01) thanks to
    `_recalculate_second_half_match_clock` in the loader.
    """
    now = datetime.now(timezone.utc)
    schedules_created = 0
    last_fire_at = now

    for event in events:
        if event['eventType'] in SKIP_EVENT_TYPES:
            continue

        sec = _game_clock_seconds(event.get('gameTime'))
        if sec is not None and speed_multiplier > 0:
            offset_wall = math.ceil(sec / speed_multiplier - 1e-12)
            target = now + timedelta(seconds=max(1, offset_wall))
        else:
            event_time = datetime.fromisoformat(
                event['eventTime']
            ).astimezone(timezone.utc)
            offset_seconds = (event_time - kickoff_time).total_seconds()
            offset_wall = math.ceil(offset_seconds / speed_multiplier - 1e-12)
            target = now + timedelta(seconds=max(1, offset_wall))

        # Monotonic floor: ≥1s after previous so EventBridge schedules are
        # all distinct seconds and fire in submission (gameTime-sorted) order.
        fire_at = max(target, last_fire_at + timedelta(seconds=1))

        _create_schedule(match_id, event, fire_at, run_id, run_tag, schedules_created)
        schedules_created += 1
        last_fire_at = fire_at

    print(f"Created {schedules_created} schedules")
    return schedules_created


def _create_schedule(
    match_id: str,
    event: dict,
    fire_at: datetime,
    run_id: str,
    run_tag: str,
    seq: int,
) -> None:
    # Unique per run; avoids collisions with leftover schedules from failed runs.
    schedule_name = f"m{match_id[-6:]}-e{seq:04d}-{run_tag}"
    if len(schedule_name) > 64:
        schedule_name = schedule_name[:64]

    payload = {
        'matchId':   match_id,
        'runId':     run_id,
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
    speed_multiplier: float,
    run_id: str,
    run_tag: str
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
    if replay_seconds > _MAX_TICK_SCHEDULES:
        print(
            f"Capping tick schedules from {replay_seconds} to {_MAX_TICK_SCHEDULES} "
            f"(total_game_seconds={total_game_seconds}, speed={speed_multiplier})"
        )
        replay_seconds = _MAX_TICK_SCHEDULES

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
        _create_tick_schedule(match_id, replay_second, game_time, fire_at, run_id, run_tag)
        created += 1

    print(f"Created {created} clock tick schedules")
    return created


def _create_tick_schedule(
    match_id: str,
    replay_second: int,
    game_time: str,
    fire_at: datetime,
    run_id: str,
    run_tag: str
) -> None:
    schedule_name = f"m{match_id[-6:]}-t{replay_second:04d}-{run_tag}"
    if len(schedule_name) > 64:
        schedule_name = schedule_name[:64]
    payload = {
        'matchId': match_id,
        'runId': run_id,
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