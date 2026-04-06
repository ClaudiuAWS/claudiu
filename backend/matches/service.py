import boto3
import os
from boto3.dynamodb.conditions import Key, Attr

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


def get_match_events(match_id: str) -> list:
    """Return fired events sorted by match clock (gameTime), then eventTime."""
    events = []
    kwargs = {
        'KeyConditionExpression': Key('matchId').eq(match_id),
        'FilterExpression': Attr('firedAt').exists(),
    }
    while True:
        response = match_events_table.query(**kwargs)
        events.extend(response.get('Items', []))
        lek = response.get('LastEvaluatedKey')
        if not lek:
            break
        kwargs['ExclusiveStartKey'] = lek

    return sorted(events, key=_event_feed_order_key)


def _event_feed_order_key(e: dict) -> tuple:
    """Sort by match clock MM:SS, then XML event time, then id."""
    gt = e.get('gameTime')
    if gt is not None:
        s = str(gt).strip()
        parts = s.split(':')
        if len(parts) == 2 and parts[0].isdigit() and len(parts[1]) == 2 and parts[1].isdigit():
            try:
                sec = int(parts[0]) * 60 + int(parts[1])
                et = e.get('eventTime')
                return (0, sec, str(et or ''), str(e.get('eventId', '')))
            except ValueError:
                pass
    et = e.get('eventTime')
    if et is not None:
        return (1, str(et), str(e.get('eventId', '')))
    return (2, '', str(e.get('eventId', '')))