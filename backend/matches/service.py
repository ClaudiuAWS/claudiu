import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')

matches_table      = dynamodb.Table(os.environ['MATCHES_TABLE'])
match_events_table = dynamodb.Table(os.environ['MATCH_EVENTS_TABLE'])
player_lookup_table = dynamodb.Table(os.environ['PLAYER_LOOKUP_TABLE'])


def list_matches() -> list:
    response = matches_table.scan()
    matches = response.get('Items', [])
    return sorted(matches, key=lambda m: m.get('kickoffTime', ''))


def get_match(match_id: str) -> dict:
    match = matches_table.get_item(
        Key={'matchId': match_id}
    ).get('Item')

    if not match:
        raise ValueError(f'Match not found: {match_id}')

    return match


# A real football halftime is ~15 minutes of break time. The data loader
# packs halftime and secondhalf 1 second apart on the match clock, leaving
# no room for the halftime mini-game. Shifting at API read time means
# we don't need to re-run the loader and reseed DDB.
HALFTIME_BREAK_SECONDS = 15 * 60


def get_match_events(match_id: str) -> list:
    """Return all events for a match, sorted by match clock (gameTime), then eventTime.
    The frontend reveal-on-clock filter shows each event at the moment the displayed
    timer reaches its gameTime, so returning unfired events here is safe and
    eliminates the frontend's dependency on backend Lambda dispatch jitter."""
    events = []
    kwargs = {
        'KeyConditionExpression': Key('matchId').eq(match_id),
    }
    while True:
        response = match_events_table.query(**kwargs)
        events.extend(response.get('Items', []))
        lek = response.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek

    events = _apply_halftime_break_shift(events)
    return sorted(events, key=_event_feed_order_key)


def _apply_halftime_break_shift(events: list) -> list:
    """Shift `secondhalf` and all post-halftime events forward by
    HALFTIME_BREAK_SECONDS. Keeps halftime mini-game playable without
    second-half events firing during the break.

    Halftime event itself is left in place — its gameTime defines the
    moment the break starts.

    Idempotent under repeated calls? No — it mutates gameTime each call.
    Callers should call exactly once per request.
    """
    halftime_sec = None
    for e in events:
        if e.get('eventType') == 'halftime':
            halftime_sec = _game_clock_seconds(e.get('gameTime'))
            break
    if halftime_sec is None:
        return events
    for e in events:
        et = e.get('eventType')
        if et == 'halftime':
            continue
        sec = _game_clock_seconds(e.get('gameTime'))
        if sec is None or sec <= halftime_sec:
            continue
        new_sec = sec + HALFTIME_BREAK_SECONDS
        mm = new_sec // 60
        ss = new_sec % 60
        e['gameTime'] = f"{mm}:{ss:02d}"
    return events


def get_match_players(match_id: str) -> list:
    players = []
    kwargs = {'KeyConditionExpression': Key('matchId').eq(match_id)}
    while True:
        resp = player_lookup_table.query(**kwargs)
        players.extend(resp.get('Items', []))
        lek = resp.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek

    def sort_key(p):
        return (
            0 if p.get('teamRole') == 'home' else 1,
            0 if p.get('starting') else 1,
            int(p.get('shirtNumber', 99)),
        )
    return sorted(players, key=sort_key)


def _game_clock_seconds(gt) -> int | None:
    """Match clock seconds from gameTime; handles MM:SS, Decimal, total seconds."""
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


def _event_feed_order_key(e: dict) -> tuple:
    """Sort by match clock MM:SS, then XML event time, then id."""
    sec = _game_clock_seconds(e.get("gameTime"))
    if sec is not None:
        et = e.get("eventTime")
        return (0, sec, str(et or ""), str(e.get("eventId", "")))
    et = e.get("eventTime")
    if et is not None:
        return (1, str(et), str(e.get("eventId", "")))
    return (2, "", str(e.get("eventId", "")))