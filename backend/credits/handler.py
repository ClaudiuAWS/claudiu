"""
Credits Lambda — wallet read API + purchase / inventory write paths.

Routes:
    GET  /credits              — current user's balance (+ lifetime stats)
    GET  /credits/friends      — friend leaderboard (balances joined with
                                 the user's accepted friends from the
                                 friends table)
    GET  /credits/inventory    — current user's owned items (cosmetics,
                                 discs, armed consumables)
    POST /credits/purchase     — atomic debit + inventory insert. Body:
                                 {itemId: '<id from breznCatalog>'}.

Score-bound writes (the per-event award path) still happen elsewhere
via the shared `credits.py` helpers. This Lambda only owns the
purchase write — a single user paying for a known SKU.
"""

import json
import os
import time
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

import credits_shared as _credits
import breznCatalog as _catalog

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

_dynamodb = boto3.resource('dynamodb')
_TABLE_NAME = os.environ.get('CREDITS_TABLE', 'claudiu-credits')
_table = _dynamodb.Table(_TABLE_NAME)
_friends_table = _dynamodb.Table(os.environ.get('FRIENDS_TABLE', 'claudiu-friends'))


def _resp(status: int, body) -> dict:
    return {
        'statusCode': status,
        'headers':    {**CORS, 'Content-Type': 'application/json'},
        'body':       json.dumps(body, default=str),
    }


def _list_friend_dtos(user_id: str) -> list:
    """Read the user's accepted friend rows from claudiu-friends, return
    minimal DTOs that the leaderboard renderer needs.
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


def _get_inventory(user_id: str) -> dict:
    """Read the inventory map off the credits row. Missing row / field
    returns an empty dict — every user implicitly starts with no items.
    """
    try:
        item = _table.get_item(Key={'userId': user_id}, ConsistentRead=True).get('Item') or {}
        inv = item.get('inventory') or {}
        # DynamoDB returns numeric fields as Decimal — JSON-safe via
        # default=str on the response handler, but normalize to a plain
        # dict here in case downstream consumers prefer plain types.
        return {k: dict(v) for k, v in inv.items()}
    except Exception as e:
        print(f"[credits] inventory read failed for {user_id}: {e}")
        return {}


def _purchase(user_id: str, item_id: str) -> dict:
    """Atomic debit + inventory insert.

    Returns: (status_code, body_dict).

    Validation flow:
      1. Item exists in canonical catalog.
      2. For permanent items, user doesn't already own it (409).
      3. For consumables, user doesn't already have one armed (409).
      4. Conditional UpdateItem: balance >= cost AND (per #2/#3) the
         inventory entry isn't already there. Single DDB call — no
         race possible between balance check and insert.
    """
    item = _catalog.get_item(item_id)
    if not item:
        return (404, {'error': 'unknown item'})

    cost = int(item.get('cost') or 0)
    if cost <= 0:
        return (500, {'error': 'item misconfigured'})

    entry = {
        'acquiredAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'kind':       item['kind'],
        'category':   item.get('category') or '',
    }
    if item['kind'] == 'consumable':
        # Armed for the next match. The match-end / use path resets this.
        entry['armedForMatchId'] = ''
        entry['usedAt']          = ''

    try:
        _table.update_item(
            Key={'userId': user_id},
            UpdateExpression=(
                'ADD balance :neg, totalSpent :pos '
                'SET inventory.#item = :entry, '
                '    updatedAt = :ts, '
                '    lastReason = :reason'
            ),
            # `attribute_exists(balance)` enforces that the row exists
            # (every user has a row after their first earn) AND that
            # the inventory entry hasn't already been bought — prevents
            # double-purchase races for permanent items.
            ConditionExpression='attribute_exists(balance) AND balance >= :pos AND attribute_not_exists(inventory.#item)',
            ExpressionAttributeNames={'#item': item_id},
            ExpressionAttributeValues={
                ':neg':    -cost,
                ':pos':    cost,
                ':entry':  entry,
                ':ts':     time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                ':reason': f'purchase: {item_id}',
            },
            ReturnValues='ALL_NEW',
        )
    except ClientError as e:
        code = e.response.get('Error', {}).get('Code')
        if code == 'ConditionalCheckFailedException':
            # Either insufficient balance OR already owned. Disambiguate
            # by reading state — separate error codes help the FE render
            # the right message.
            bal = _credits.get_balance(user_id).get('balance', 0)
            inv = _get_inventory(user_id)
            if item_id in inv:
                return (409, {'error': 'already owned', 'itemId': item_id})
            if bal < cost:
                return (402, {'error': 'insufficient balance', 'balance': bal, 'cost': cost})
            return (409, {'error': 'purchase conflict'})
        print(f"[credits] purchase failed for {user_id}/{item_id}: {e}")
        return (500, {'error': 'internal error'})
    except Exception as e:
        print(f"[credits] purchase unexpected error for {user_id}/{item_id}: {e}")
        return (500, {'error': 'internal error'})

    print(f"[credits] purchased {item_id} for {user_id} (cost {cost})")
    bal = _credits.get_balance(user_id)
    return (200, {
        'ok':       True,
        'itemId':   item_id,
        'cost':     cost,
        'balance':  bal['balance'],
    })


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

        if method == 'GET' and path.endswith('/credits/inventory'):
            return _resp(200, {'inventory': _get_inventory(user_id)})

        if method == 'POST' and path.endswith('/credits/purchase'):
            try:
                body = json.loads(event.get('body') or '{}')
            except Exception:
                return _resp(400, {'error': 'invalid body'})
            item_id = (body or {}).get('itemId')
            if not item_id or not isinstance(item_id, str):
                return _resp(400, {'error': 'itemId required'})
            status, body_resp = _purchase(user_id, item_id)
            return _resp(status, body_resp)

        if method == 'GET' and path.endswith('/credits'):
            return _resp(200, _credits.get_balance(user_id))

        return _resp(404, {'error': 'not found'})

    except Exception as e:
        print(f"[credits-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
