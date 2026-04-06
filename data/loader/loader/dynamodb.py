import boto3
import time
from decimal import Decimal
from boto3 import Session
from constants import (
    MATCHES_TABLE,
    MATCH_EVENTS_TABLE,
    PLAYER_LOOKUP_TABLE,
    MATCH_TTL_SECONDS,
    AWS_REGION,
)

session = Session(profile_name="hackathon", region_name=AWS_REGION)
dynamodb = session.resource("dynamodb")


def write_match(match: dict) -> None:
    table = dynamodb.Table(MATCHES_TABLE)
    item = _clean(match)
    item["TTL"] = int(time.time()) + MATCH_TTL_SECONDS
    table.put_item(Item=item)
    print(f"  ✅ Match written: {match['matchId']}")


def write_events(events: list) -> None:
    table = dynamodb.Table(MATCH_EVENTS_TABLE)
    ttl = int(time.time()) + MATCH_TTL_SECONDS

    with table.batch_writer() as batch:
        for event in events:
            item = _clean({
                "matchId":   event["matchId"],
                "eventId":   event["eventId"],
                "eventType": event["eventType"],
                "eventTime": event["eventTime"],
                "gameTime":  event["gameTime"],
                **event["data"],
            })
            item["TTL"] = ttl
            batch.put_item(Item=item)

    print(f"  ✅ {len(events)} events written")


def write_players(players: dict) -> None:
    table = dynamodb.Table(PLAYER_LOOKUP_TABLE)
    ttl = int(time.time()) + MATCH_TTL_SECONDS

    with table.batch_writer() as batch:
        for player in players.values():
            item = _clean(player)
            item["TTL"] = ttl
            batch.put_item(Item=item)

    print(f"  ✅ {len(players)} players written")


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _clean(obj):
    """
    Recursively prepare a dict for DynamoDB:
    - Remove None values (DynamoDB rejects them)
    - Convert floats to Decimal (DynamoDB requires Decimal not float)
    - Preserve bools, strings, ints as-is
    """
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_clean(v) for v in obj if v is not None]
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj