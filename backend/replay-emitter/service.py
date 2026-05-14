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
lambda_client = boto3.client('lambda')

match_events_table = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])
matches_table      = dynamodb.Table(os.environ['MATCHES_TABLE'])

EVENT_PROCESSOR_ARN  = os.environ['EVENT_PROCESSOR_ARN']
EVENTBRIDGE_ROLE_ARN = os.environ['EVENTBRIDGE_ROLE_ARN']
SCHEDULE_GROUP       = os.environ['SCHEDULE_GROUP']

# Optional FIFO queue. When set, schedules target SQS instead of invoking the
# event-processor Lambda directly — this gives strict in-order delivery per
# `MessageGroupId=matchId` and eliminates the Lambda-cold-start race that lets
# a 28' goal arrive before a 26' card.
EVENT_FIFO_QUEUE_ARN = os.environ.get('EVENT_FIFO_QUEUE_ARN', '').strip() or None

# Events that should not be scheduled — they are anchors or irrelevant
SKIP_EVENT_TYPES = {'kickoff'}

# Boundary events — scheduled at their exact target second; minor neighbours
# get pushed around them so the visible "Half Time / 2nd Half / Full Time"
# transition lands on its true gameTime (no clock overshoot).
BOUNDARY_EVENT_TYPES = {'halftime', 'secondhalf', 'fulltime'}


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

        # Pre-warm event-processor synchronously: pays the ~5s Lambda cold-start
        # cost here (on the /start request) instead of on the first EventBridge
        # schedule firing 1s later. Without this, the first 1-2 events arrive
        # ~25s late on the match clock at 5x speed (cold-start × speedMultiplier),
        # making early-match events visibly bunch around minute 5-6.
        _prewarm_event_processor()

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

def _prewarm_event_processor() -> None:
    """Synchronously invoke event-processor with a no-op payload so its
    execution context is hot before EventBridge fires the first scheduled
    event ~1s from now. The handler short-circuits on `eventType=__warmup__`
    before doing any DynamoDB reads, so the call cost is just the cold-start
    itself (~5s once, then warm thereafter for the rest of the match).
    """
    try:
        lambda_client.invoke(
            FunctionName=EVENT_PROCESSOR_ARN,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'matchId':   '__warmup__',
                'runId':     '__warmup__',
                'eventId':   '__warmup__',
                'eventType': '__warmup__',
                'gameTime':  '00:00',
                'data':      {},
            }).encode('utf-8'),
        )
        print("Event-processor pre-warmed")
    except Exception as e:
        # Pre-warm is a best-effort optimization — never fail match start over it.
        print(f"Event-processor pre-warm failed (non-fatal): {e}")


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


# 15 in-game minutes of halftime break. Applied as a wall-clock fire-time
# delay to post-halftime events (not as a gameTime mutation — that would
# bleed into the displayed match minute, e.g. second half rendering as
# `60'` instead of `45'`). Frontend's reveal filter applies the same
# wall-clock delay so visibility stays in sync.
HALFTIME_BREAK_SECONDS = 15 * 60


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
    (sec / speed_multiplier). Multiple non-boundary events may share a wall
    second — that's fine: the event-processor handlers are order-tolerant
    (`_handle_goal` max-merges scores, `_handle_minor_event` uses a monotonic
    `_merge_minute_value` for currentMinute), and the frontend feed sorts by
    `gameTime` then `eventTime` so display order stays stable regardless of
    arrival order. Two parallel Lambda invocations on the same wall second
    are well within Lambda concurrency limits.

    Why we DON'T enforce a 1s monotonic floor here: at high speedMultiplier,
    clusters of N events targeting the same handful of wall seconds get
    smeared across N consecutive seconds, dragging events many game-minutes
    past their true target (e.g. a 61' goal firing at wall 75 when the
    on-screen clock shows 75:xx). Removing the floor makes events arrive on
    time at the cost of ordering between same-second events, which doesn't
    matter for this app — see handler analysis above.

    Boundary events (`halftime` / `secondhalf` / `fulltime`) DO need ordering
    because they flip `match.status`, so the pre-pass below still reserves
    them their exact target wall-second with monotonicity enforced among
    themselves; non-boundary events step over those reserved slots.

    Feed gameTime is continuous across half-time (51:00 → 51:01) thanks to
    `_recalculate_second_half_match_clock` in the loader.

    Halftime break: a 15-game-minute pad is applied to post-halftime events
    as a wall-clock fire-time delay (see `halftime_break_wall_delay` below).
    We deliberately do NOT mutate gameTime — that would shift the displayed
    match minute (kickoff of 2H rendering as `60'` instead of `45'`).
    """
    now = datetime.now(timezone.utc)

    # Locate halftime's gameTime so we know which subsequent events to
    # delay by HALFTIME_BREAK_SECONDS. None when the match has no halftime
    # event (rare; safety net).
    halftime_sec = None
    for e in events:
        if e.get('eventType') == 'halftime':
            halftime_sec = _game_clock_seconds(e.get('gameTime'))
            break
    halftime_break_wall_delta = (
        timedelta(seconds=HALFTIME_BREAK_SECONDS / max(speed_multiplier, 1e-6))
        if halftime_sec is not None else timedelta(0)
    )

    # Compute each event's natural target wall-second once.
    targets = []
    for event in events:
        if event['eventType'] in SKIP_EVENT_TYPES:
            targets.append(None)
            continue
        print(f"Scheduling event {event}")

        sec = _game_clock_seconds(event.get('gameTime'))
        print(f"    The value of call _game_clock_seconds is {event.get('gameTime')}")
        if sec is not None and speed_multiplier > 0:
            print(f"        We are in the if statement")
            offset_wall = math.ceil(sec / speed_multiplier - 1e-12)
            print(f"        offset_wall = {offset_wall}")
        else:
            print(f"        We are in the else statement")
            event_time = datetime.fromisoformat(
                event['eventTime']
            ).astimezone(timezone.utc)
            offset_seconds = (event_time - kickoff_time).total_seconds()
            offset_wall = math.ceil(offset_seconds / speed_multiplier - 1e-12)
            print(f"        offset_wall = {offset_wall}")

        natural_target = now + timedelta(seconds=max(1, offset_wall))
        # Halftime break: delay post-halftime events by the wall-clock
        # equivalent of HALFTIME_BREAK_SECONDS so the halftime mini-game
        # has room to play. The halftime event itself is NOT delayed.
        if (halftime_sec is not None
                and sec is not None
                and sec > halftime_sec
                and event.get('eventType') != 'halftime'):
            natural_target = natural_target + halftime_break_wall_delta
        targets.append(natural_target)

    # Pre-pass: assign boundary events their own slots in gameTime order,
    # enforcing monotonicity among themselves. Loader sets secondhalf
    # gameTime = halftime + 1s, so they often share a target wall-second —
    # without this, secondhalf could race ahead of halftime in EventBridge
    # and leave status stuck on 'halftime'.
    claimed = set()
    boundary_fire_at = {}
    boundary_last = now
    for idx, (event, target) in enumerate(zip(events, targets)):
        if target is None or event['eventType'] not in BOUNDARY_EVENT_TYPES:
            continue
        slot = max(target, boundary_last + timedelta(seconds=1)) if claimed else target
        boundary_fire_at[idx] = slot
        claimed.add(slot)
        boundary_last = slot

    schedules_created = 0

    for idx, (event, target) in enumerate(zip(events, targets)):
        if target is None:
            continue

        if idx in boundary_fire_at:
            # Boundary lands on its reserved slot.
            fire_at = boundary_fire_at[idx]
        else:
            # Fire at the natural target. Multiple non-boundary events on the
            # same wall-second fire concurrently; this is intentional.
            # Only step over seconds reserved for boundary events.
            candidate = target
            while candidate in claimed:
                candidate += timedelta(seconds=1)
            fire_at = candidate

        _create_schedule(match_id, event, fire_at, run_id, run_tag, schedules_created)
        schedules_created += 1

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

    if EVENT_FIFO_QUEUE_ARN:
        # SQS FIFO target: ContentBasedDeduplication is on at the queue level,
        # so each unique payload hash is dedupe'd within 5 min. MessageGroupId
        # is the matchId — strictly serializes events for one match without
        # blocking other matches.
        target = {
            'Arn':     EVENT_FIFO_QUEUE_ARN,
            'RoleArn': EVENTBRIDGE_ROLE_ARN,
            'Input':   json.dumps(payload, default=str),
            'SqsParameters': {
                'MessageGroupId': match_id,
            },
        }
    else:
        # Legacy direct-Lambda target — keeps working if the SQS env var is
        # ever unset (e.g. local development without the FIFO queue).
        target = {
            'Arn':     EVENT_PROCESSOR_ARN,
            'RoleArn': EVENTBRIDGE_ROLE_ARN,
            'Input':   json.dumps(payload, default=str),
        }

    scheduler.create_schedule(
        Name=schedule_name,
        GroupName=SCHEDULE_GROUP,
        ScheduleExpression=f"at({fire_at.strftime('%Y-%m-%dT%H:%M:%S')})",
        ScheduleExpressionTimezone='UTC',
        Target=target,
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