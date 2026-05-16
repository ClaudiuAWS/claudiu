"""
Global leaderboard — shared writer module.

Maintains the single all-time totals row per user in claudiu-leaderboard.
Called from inside `record_match_end` (history.py) so the leaderboard
stays in lockstep with match-history rows.

Design rules (same as badges.py and history.py):
    1. NEVER raise. Wrapped at the boundary so any failure logs and
       returns rather than breaking the match-end flow.
    2. Atomic via UpdateItem ADD — no race conditions between two
       concurrent matches ending at the same instant.
    3. Denormalised display fields (displayName, avatarUrl) are SET
       every write, so leaderboard UI always shows latest profile data.
"""

import os
import time
import boto3


_dynamodb = boto3.resource('dynamodb')
_LB_TABLE_NAME = os.environ.get('LEADERBOARD_TABLE', 'claudiu-leaderboard')
_lb_table = _dynamodb.Table(_LB_TABLE_NAME)


def apply_member_match_result(member: dict, score: int, won: bool) -> None:
    """Atomically increment one user's leaderboard row.

    `member` is the room member dict (has userId/displayName/avatarUrl).
    `score` and `won` are passed explicitly because history.py already
    computed them from the sorted member list.

    Never raises. Logs on failure.
    """
    user_id = member.get('userId') if isinstance(member, dict) else None
    if not user_id:
        return

    display_name = (member.get('displayName') or 'Anonymous')[:80]
    avatar_url = member.get('avatarUrl') or ''
    win_inc = 1 if won else 0

    try:
        _lb_table.update_item(
            Key={'userId': user_id},
            UpdateExpression=(
                'ADD totalPoints :pts, matchesPlayed :one, wins :w '
                'SET displayName = :name, avatarUrl = :avatar, '
                '    updatedAt = :ts, gsiPk = :gsi'
            ),
            ExpressionAttributeValues={
                ':pts':    int(score),
                ':one':    1,
                ':w':      win_inc,
                ':name':   display_name,
                ':avatar': avatar_url,
                ':ts':     time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                ':gsi':    'GLOBAL',
            },
        )
        print(f"[leaderboard] applied {user_id}: +{score} pts, +1 match, +{win_inc} wins")
    except Exception as e:
        print(f"[leaderboard] update_item failed for {user_id}: {e}")


# --------------------------------------------------------------------------
# Read API helpers (used by the leaderboard Lambda)
# --------------------------------------------------------------------------

def list_top(limit: int = 50) -> list:
    """Top-N globally via the rank GSI. Sorted by totalPoints DESC."""
    try:
        from boto3.dynamodb.conditions import Key
        response = _lb_table.query(
            IndexName='leaderboard-rank-index',
            KeyConditionExpression=Key('gsiPk').eq('GLOBAL'),
            ScanIndexForward=False,
            Limit=max(1, min(int(limit), 200)),
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"[leaderboard] list_top failed: {e}")
        return []


def get_user_stats(user_id: str) -> dict | None:
    """Return the full leaderboard row for a user, or None."""
    if not user_id:
        return None
    try:
        return _lb_table.get_item(Key={'userId': user_id}).get('Item')
    except Exception as e:
        print(f"[leaderboard] get_user_stats failed for {user_id}: {e}")
        return None


def get_user_rank(user_id: str) -> int | None:
    """Compute the user's global rank: 1 + count of users with strictly
    higher totalPoints. Cheap GSI Query with Count-only response."""
    me = get_user_stats(user_id)
    if not me:
        return None
    my_total = int(me.get('totalPoints') or 0)
    try:
        from boto3.dynamodb.conditions import Key
        response = _lb_table.query(
            IndexName='leaderboard-rank-index',
            KeyConditionExpression=(
                Key('gsiPk').eq('GLOBAL') & Key('totalPoints').gt(my_total)
            ),
            Select='COUNT',
        )
        return int(response.get('Count', 0)) + 1
    except Exception as e:
        print(f"[leaderboard] get_user_rank failed for {user_id}: {e}")
        return None
