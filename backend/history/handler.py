"""
Match history Lambda — read-only API.

Routes:
    GET  /history       — list current user's match history (newest first)

Writing happens only inside event-processor at _end_rooms time, via
backend/shared/history.py. This Lambda never writes.
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key

_dynamodb = boto3.resource('dynamodb')
_TABLE = _dynamodb.Table(os.environ.get('MATCH_HISTORY_TABLE', 'claudiu-match-history'))

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


def _list_user_history(user_id: str, limit: int = 50) -> list:
    try:
        response = _TABLE.query(
            KeyConditionExpression=Key('userId').eq(user_id),
            ScanIndexForward=False,
            Limit=max(1, min(int(limit), 200)),
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"[history-handler] query failed for {user_id}: {e}")
        return []


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
        if method == 'GET' and path.endswith('/history'):
            qs = event.get('queryStringParameters') or {}
            limit = qs.get('limit', '50')
            try:
                limit_int = int(limit)
            except (TypeError, ValueError):
                limit_int = 50
            return _resp(200, {'history': _list_user_history(user_id, limit_int)})

        return _resp(404, {'error': 'not found'})
    except Exception as e:
        print(f"[history-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
