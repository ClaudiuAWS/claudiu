"""
Service layer for the badges read API + buy path.

Thin wrapper around `shared/badges.py` — the same module the writer
Lambdas use. The deploy workflow copies that file into this Lambda's zip
under the name `badges_shared.py` so we have one canonical catalog.
"""

import os
import time

import boto3
from botocore.exceptions import ClientError

import badges_shared

_dynamodb = boto3.resource('dynamodb')
_BADGES_TABLE_NAME  = os.environ.get('BADGES_TABLE', 'claudiu-badges')
_CREDITS_TABLE_NAME = os.environ.get('CREDITS_TABLE', 'claudiu-credits')
# The TransactWriteItems API is on the LOW-LEVEL boto3 client, not the
# Resource — keep one handy for the cross-table transaction in buy_badge.
_dynamodb_client = boto3.client('dynamodb')


def get_catalog() -> list:
    return badges_shared.get_catalog()


def list_user_badges(user_id: str) -> list:
    return badges_shared.list_user_badges(user_id)


def buy_badge(user_id: str, badge_id: str) -> tuple[int, dict]:
    """Atomic debit + badge-row insert.

    Returns (http_status, response_body):
      404 — badge_id not in catalog OR tier has no price
      409 — user already owns this badge
      402 — insufficient brezn balance
      200 — bought; body contains the new balance + badge metadata
      500 — internal / unexpected
    """
    catalog_entry = badges_shared.BADGE_CATALOG.get(badge_id)
    if not catalog_entry:
        return (404, {'error': 'unknown badge', 'badgeId': badge_id})

    tier = (catalog_entry.get('tier') or '').lower()
    price = catalog_entry.get('buyPrice') or badges_shared.BADGE_BUY_PRICES.get(tier)
    if not price or price <= 0:
        return (404, {'error': 'tier has no buy price', 'tier': tier})

    earned_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    reason = f'badge buy: {badge_id}'

    # TransactWriteItems = atomic across both tables. If EITHER condition
    # fails (already owned OR insufficient balance), the whole transaction
    # is rolled back. No partial state where the badge writes but credits
    # don't debit (or vice versa).
    try:
        _dynamodb_client.transact_write_items(
            TransactItems=[
                {
                    'Put': {
                        'TableName': _BADGES_TABLE_NAME,
                        'Item': {
                            'userId':   {'S': user_id},
                            'badgeId':  {'S': badge_id},
                            'earnedAt': {'S': earned_at},
                            'source':   {'S': 'purchased'},
                        },
                        # The badges table key is (userId, badgeId). Refuse
                        # to overwrite an existing row — that's the
                        # "already owned" gate.
                        'ConditionExpression': 'attribute_not_exists(badgeId)',
                    }
                },
                {
                    'Update': {
                        'TableName': _CREDITS_TABLE_NAME,
                        'Key': {'userId': {'S': user_id}},
                        'UpdateExpression': (
                            'ADD balance :neg, totalSpent :pos '
                            'SET updatedAt = :ts, lastReason = :reason'
                        ),
                        # Insufficient balance OR missing row → transaction
                        # cancels. attribute_exists(balance) guards against
                        # users with no credits row yet.
                        'ConditionExpression': 'attribute_exists(balance) AND balance >= :pos',
                        'ExpressionAttributeValues': {
                            ':neg':    {'N': str(-price)},
                            ':pos':    {'N': str(price)},
                            ':ts':     {'S': earned_at},
                            ':reason': {'S': reason},
                        },
                    }
                },
            ],
        )
    except ClientError as e:
        code = e.response.get('Error', {}).get('Code')
        if code == 'TransactionCanceledException':
            return _disambiguate_failure(user_id, badge_id, price)
        print(f"[badges] buy transaction failed for {user_id}/{badge_id}: {e}")
        return (500, {'error': 'internal error'})
    except Exception as e:
        print(f"[badges] unexpected buy error for {user_id}/{badge_id}: {e}")
        return (500, {'error': 'internal error'})

    # Success — fan out the badge_earned WS broadcast so the user's tabs
    # surface the badge in real time (same shape the award() path uses).
    try:
        badges_shared._push_badge_earned(
            user_id,
            badge_id,
            {'earnedAt': earned_at, 'matchId': '', 'context': {'source': 'purchased'}},
        )
    except Exception as e:  # never block success on WS
        print(f"[badges] ws push after buy failed for {user_id}/{badge_id}: {e}")

    new_balance = _read_balance(user_id)
    print(f"[badges] bought {badge_id} for {user_id} (tier={tier}, cost={price})")
    return (200, {
        'ok':       True,
        'badgeId':  badge_id,
        'tier':     tier,
        'cost':     price,
        'balance':  new_balance,
        'earnedAt': earned_at,
        'badge': {
            'badgeId':     badge_id,
            'title':       catalog_entry.get('title', badge_id),
            'description': catalog_entry.get('description', ''),
            'image':       catalog_entry.get('image', ''),
            'tier':        tier or 'bronze',
            'earnedAt':    earned_at,
            'matchId':     '',
        },
    })


def _disambiguate_failure(user_id: str, badge_id: str, price: int) -> tuple[int, dict]:
    """The transaction cancelled — figure out WHY so the FE can render a
    helpful message. Reads state (badge ownership + balance) and picks
    the most likely cause.
    """
    badges_table  = _dynamodb.Table(_BADGES_TABLE_NAME)
    try:
        existing = badges_table.get_item(
            Key={'userId': user_id, 'badgeId': badge_id},
            ConsistentRead=True,
        ).get('Item')
    except Exception:
        existing = None

    if existing:
        return (409, {'error': 'already owned', 'badgeId': badge_id})

    balance = _read_balance(user_id)
    if balance < price:
        return (402, {
            'error':   'insufficient balance',
            'balance': balance,
            'cost':    price,
        })

    return (409, {'error': 'buy conflict'})


def _read_balance(user_id: str) -> int:
    credits_table = _dynamodb.Table(_CREDITS_TABLE_NAME)
    try:
        item = credits_table.get_item(
            Key={'userId': user_id},
            ConsistentRead=True,
        ).get('Item') or {}
        return int(item.get('balance') or 0)
    except Exception as e:
        print(f"[badges] balance read failed for {user_id}: {e}")
        return 0
