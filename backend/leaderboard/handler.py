"""
Global leaderboard Lambda — read-only API.

Routes:
    GET  /leaderboard?limit=50    — top-N globally (by totalPoints DESC)
    GET  /leaderboard/me          — current user's stats + rank

Writing happens only inside event-processor → shared/history.py →
shared/leaderboard.py at end-of-match. This Lambda never writes.
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key

_dynamodb = boto3.resource('dynamodb')
_TABLE = _dynamodb.Table(os.environ.get('LEADERBOARD_TABLE', 'claudiu-leaderboard'))

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}


def _resp(status: int, body) -> dict:
    return {
        'statusCode': status,
        'headers':    {**CORS, 'Content-Type': 'application/json'},
        'body':       json.dumps(body, default=str),
    }


def _list_top(limit: int) -> list:
    try:
        response = _TABLE.query(
            IndexName='leaderboard-rank-index',
            KeyConditionExpression=Key('gsiPk').eq('GLOBAL'),
            ScanIndexForward=False,
            Limit=max(1, min(int(limit), 200)),
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"[leaderboard-handler] list_top failed: {e}")
        return []


def _get_user_stats(user_id: str) -> dict | None:
    try:
        return _TABLE.get_item(Key={'userId': user_id}).get('Item')
    except Exception as e:
        print(f"[leaderboard-handler] get_user failed: {e}")
        return None


def _get_user_rank(user_id: str) -> int | None:
    me = _get_user_stats(user_id)
    if not me:
        return None
    my_total = int(me.get('totalPoints') or 0)
    try:
        response = _TABLE.query(
            IndexName='leaderboard-rank-index',
            KeyConditionExpression=(
                Key('gsiPk').eq('GLOBAL') & Key('totalPoints').gt(my_total)
            ),
            Select='COUNT',
        )
        return int(response.get('Count', 0)) + 1
    except Exception as e:
        print(f"[leaderboard-handler] rank failed: {e}")
        return None


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '')

    if method == 'OPTIONS':
        return _resp(200, {})

    try:
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']
    except (KeyError, TypeError):
        return _resp(401, {'error': 'unauthorized'})

    try:
        if method == 'GET' and path.endswith('/leaderboard/me'):
            stats = _get_user_stats(user_id) or {}
            rank = _get_user_rank(user_id)
            return _resp(200, {
                'me': {
                    'userId':        user_id,
                    'displayName':   stats.get('displayName') or '',
                    'avatarUrl':     stats.get('avatarUrl') or '',
                    'totalPoints':   int(stats.get('totalPoints') or 0),
                    'matchesPlayed': int(stats.get('matchesPlayed') or 0),
                    'wins':          int(stats.get('wins') or 0),
                    'rank':          rank,
                },
            })

        if method == 'GET' and path.endswith('/leaderboard'):
            qs = event.get('queryStringParameters') or {}
            try:
                limit = int(qs.get('limit', '50'))
            except (TypeError, ValueError):
                limit = 50
            return _resp(200, {'leaderboard': _list_top(limit)})

        return _resp(404, {'error': 'not found'})
    except Exception as e:
        print(f"[leaderboard-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
