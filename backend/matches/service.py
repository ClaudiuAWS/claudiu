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
    response = match_events_table.query(
        KeyConditionExpression=Key('matchId').eq(match_id),
        FilterExpression=Attr('firedAt').exists()
    )
    events = response.get('Items', [])
    return sorted(events, key=lambda e: e.get('firedAt', ''))