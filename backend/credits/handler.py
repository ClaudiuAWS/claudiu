"""
Credits Lambda — read-only API for the in-game currency.

Routes:
    GET  /credits              — current user's balance (+ lifetime stats)
    GET  /credits/friends      — friend leaderboard (balances joined with
                                 the user's accepted friends from the
                                 friends table)

Writes are NEVER served from here. The only writers are
`backend/shared/credits.py` callers (event-processor on scoring events,
future inventory Lambda on purchases). Keeping reads dumb means the FE
can never self-credit.
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key

import credits_shared as _credits

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

_dynamodb = boto3.resource('dynamodb')
_friends_table = _dynamodb.Table(os.environ.get('FRIENDS_TABLE', 'claudiu-friends'))


def _resp(status: int, body) -> dict:
    return {
        'statusCode': status,
        'headers':    {**CORS, 'Content-Type': 'application/json'},
        'body':       json.dumps(body, default=str),
    }


def _list_friend_dtos(user_id: str) -> list:
    """Read the user's accepted friend rows from claudiu-friends, return
    minimal DTOs that the leaderboard renderer needs. Same shape the
    FriendsPage already consumes plus `credits`.
    """
    try:
        response = _friends_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
            FilterExpression='#s = :accepted',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':accepted': 'accepted'},
        )
    except Exception as e:
        print(f"[credits] friends query failed: {e}")
        return []
    return [
        {
            'friendId':    item.get('friendId'),
            'email':       item.get('email'),
            'displayName': item.get('displayName'),
            'avatarUrl':   item.get('avatarUrl'),
        }
        for item in response.get('Items', [])
    ]


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
        if method == 'GET' and path.endswith('/credits/friends'):
            friends = _list_friend_dtos(user_id)
            balances = _credits.get_balances([f['friendId'] for f in friends])
            me = _credits.get_balance(user_id)
            rows = [{**f, 'credits': balances.get(f['friendId'], 0)} for f in friends]
            rows.sort(key=lambda r: r['credits'], reverse=True)
            return _resp(200, {
                'me':      {'userId': user_id, 'credits': me['balance']},
                'friends': rows,
            })

        if method == 'GET' and path.endswith('/credits'):
            return _resp(200, _credits.get_balance(user_id))

        return _resp(404, {'error': 'not found'})

    except Exception as e:
        print(f"[credits-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
