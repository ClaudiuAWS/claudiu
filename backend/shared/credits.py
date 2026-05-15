"""
Credits — shared in-game currency module.

The single canonical writer for `claudiu-credits`. Imported by Lambdas that
observe events worth credits (event-processor on match scoring; future
inventory Lambda on purchase debits). Mirrors the structure + discipline of
`backend/shared/badges.py`:

    1. NEVER raise. Credits are additive on top of scoring — a failure here
       must not break the underlying match flow. All public functions wrap
       I/O in try/except and just print on failure.
    2. Unconditional ADD on award. Idempotency is not enforced at the row
       level today (matches the existing fantasy-points behaviour, where the
       event-processor's `_apply_member_changes` is the single throttle
       point). Real production would use a ledger table; that's out of scope.
    3. Conditional ADD on debit. Refuses to spend below zero — purchase paths
       call `debit()` and check the bool return; on False they don't write the
       inventory row.

Storage shape (claudiu-credits):
    PK userId      (S)
    balance        (N)  current spendable balance
    totalEarned    (N)  lifetime earned (for "career stats")
    totalSpent     (N)  lifetime spent
    updatedAt      (S, ISO)

Award rule the event-processor uses today: positive fantasy delta × 2 →
credits. So a +6 (defender goal) earns +12 credits; a +3 assist earns +6;
a +2 save earns +4. Negative deltas (cards) award 0 credits.
"""

import os
import time
import boto3
from botocore.exceptions import ClientError


_dynamodb = boto3.resource('dynamodb')
_TABLE_NAME = os.environ.get('CREDITS_TABLE', 'claudiu-credits')
_table = _dynamodb.Table(_TABLE_NAME)


# Translation from a positive fantasy-points delta to credits.
# Kept here so both the writer (event-processor) and any future caller
# read the same multiplier.
CREDITS_PER_POINT = 2


def award(user_id: str, amount: int, reason: str = '') -> bool:
    """Add `amount` to user's balance + totalEarned. Returns True on
    success. Never raises. Negative amounts are refused (use `debit`).
    """
    if not user_id or not isinstance(amount, int) or amount <= 0:
        return False
    try:
        _table.update_item(
            Key={'userId': user_id},
            UpdateExpression=(
                'ADD balance :a, totalEarned :a '
                'SET updatedAt = :t, lastReason = :r'
            ),
            ExpressionAttributeValues={
                ':a': amount,
                ':t': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                ':r': reason or '',
            },
        )
        print(f"[credits] +{amount} → {user_id} ({reason or '-'})")
        return True
    except Exception as e:
        print(f"[credits] award failed for {user_id}: {e}")
        return False


def debit(user_id: str, amount: int, reason: str = '') -> bool:
    """Subtract `amount` from balance, IF balance >= amount. Returns True
    on success, False if balance was insufficient or on any error.
    """
    if not user_id or not isinstance(amount, int) or amount <= 0:
        return False
    try:
        _table.update_item(
            Key={'userId': user_id},
            UpdateExpression=(
                'ADD balance :neg, totalSpent :pos '
                'SET updatedAt = :t, lastReason = :r'
            ),
            ConditionExpression='attribute_exists(balance) AND balance >= :pos',
            ExpressionAttributeValues={
                ':neg': -amount,
                ':pos': amount,
                ':t': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                ':r': reason or '',
            },
        )
        print(f"[credits] -{amount} ← {user_id} ({reason or '-'})")
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            print(f"[credits] debit refused (insufficient): {user_id} {amount}")
            return False
        print(f"[credits] debit failed for {user_id}: {e}")
        return False
    except Exception as e:
        print(f"[credits] unexpected debit error for {user_id}: {e}")
        return False


def get_balance(user_id: str) -> dict:
    """Return `{balance, totalEarned, totalSpent}` for the user. Missing
    rows return zeros (no row yet means no credits ever earned)."""
    zero = {'balance': 0, 'totalEarned': 0, 'totalSpent': 0}
    if not user_id:
        return zero
    try:
        item = _table.get_item(Key={'userId': user_id}).get('Item')
        if not item:
            return zero
        return {
            'balance':     int(item.get('balance', 0)),
            'totalEarned': int(item.get('totalEarned', 0)),
            'totalSpent':  int(item.get('totalSpent', 0)),
        }
    except Exception as e:
        print(f"[credits] get_balance failed for {user_id}: {e}")
        return zero


def get_balances(user_ids: list) -> dict:
    """BatchGet balances for many users. Returns `{userId: balance_int}`.
    Missing users default to 0. Caps at 100 ids (DDB limit) — the caller
    is responsible for pagination if needed.
    """
    if not user_ids:
        return {}
    user_ids = list(dict.fromkeys(user_ids))[:100]  # dedupe, cap
    out = {uid: 0 for uid in user_ids}
    try:
        response = _dynamodb.batch_get_item(RequestItems={
            _TABLE_NAME: {
                'Keys': [{'userId': uid} for uid in user_ids],
                'ProjectionExpression': 'userId, balance',
            }
        })
        for item in response.get('Responses', {}).get(_TABLE_NAME, []):
            out[item['userId']] = int(item.get('balance', 0))
    except Exception as e:
        print(f"[credits] get_balances batch failed: {e}")
    return out


# ----- Convenience: scoring integration --------------------------------

def award_for_score_changes(score_changes: list, match_id: str = '') -> None:
    """Called from event-processor's `_apply_member_changes` *after* it
    has computed per-member fantasy deltas. Awards credits equal to
    `delta * CREDITS_PER_POINT` for every positive delta. Negative deltas
    (cards) are skipped — players don't lose credits for in-game mishaps.

    Mirrors how badges' `evaluate_score_changes` plugs in: invoked from
    a try/except in the writer so a failure here can never break scoring.
    """
    for change in score_changes:
        user_id = change.get('userId')
        delta = change.get('delta', 0)
        if not user_id or not isinstance(delta, int) or delta <= 0:
            continue
        amount = delta * CREDITS_PER_POINT
        reason_parts = [change.get('reason') or change.get('eventType') or '']
        if change.get('playerName'):
            reason_parts.append(change['playerName'])
        reason = ' · '.join(p for p in reason_parts if p)
        if match_id:
            reason = f"{reason} (match {match_id})" if reason else f"match {match_id}"
        award(user_id=user_id, amount=amount, reason=reason)
