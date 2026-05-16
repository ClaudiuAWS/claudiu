"""
Match history — shared writer module.

Writes one permanent row per user per match into claudiu-match-history.
Called from event-processor's `_end_rooms` after the match ends.

Design rules (same as badges.py):
    1. NEVER raise. The history layer is additive — a failure here must
       not break match-end flow.
    2. Idempotent. Conditional PutItem so a re-run can't create duplicates.
    3. Reads team names from claudiu-matches (event-processor already has
       read permission on that table).
"""

import os
import time
import boto3
from botocore.exceptions import ClientError


_dynamodb = boto3.resource('dynamodb')
_HISTORY_TABLE_NAME = os.environ.get('MATCH_HISTORY_TABLE', 'claudiu-match-history')
_history_table = _dynamodb.Table(_HISTORY_TABLE_NAME)
_MATCHES_TABLE_NAME = os.environ.get('MATCHES_TABLE', 'claudiu-matches')
_matches_table = _dynamodb.Table(_MATCHES_TABLE_NAME)

# Leaderboard integration — bundled by the deploy workflow alongside this
# module. Wrapped in try/except so a missing module (older deploy) cannot
# break match-history writing.
try:
    import leaderboard as _leaderboard  # type: ignore
except Exception as _e:  # pragma: no cover
    _leaderboard = None
    print(f"[history] leaderboard module import skipped: {_e}")


def _get_team_names(match_id: str) -> tuple:
    """Return (homeTeamName, awayTeamName) for the match. Falls back to
    empty strings on any error so we still write the row."""
    try:
        match = _matches_table.get_item(Key={'matchId': match_id}).get('Item')
        if not match:
            return '', ''
        return (
            match.get('homeTeamName') or '',
            match.get('awayTeamName') or '',
        )
    except Exception as e:
        print(f"[history] team names lookup failed for {match_id}: {e}")
        return '', ''


def record_match_end(room: dict, final_result: str) -> None:
    """Write one history row per user in the room.

    Called from event-processor `_end_rooms` after the match-ended broadcast.
    Wrapped at every level so any failure is logged but never raised.
    """
    if not room or not isinstance(room, dict):
        return

    members = room.get('members') or []
    if not members:
        return

    match_id = room.get('matchId') or ''
    room_code = room.get('roomCode') or ''
    ended_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    # Sort once to determine ranks
    sorted_members = sorted(
        members,
        key=lambda m: int(m.get('score') or 0),
        reverse=True,
    )

    home_team, away_team = _get_team_names(match_id)

    for rank, member in enumerate(sorted_members, start=1):
        user_id = member.get('userId')
        if not user_id:
            continue
        try:
            score = int(member.get('score') or 0)
        except (TypeError, ValueError):
            score = 0

        item = {
            'userId':       user_id,
            'endedAt':      ended_at,
            'matchId':      match_id,
            'roomCode':     room_code,
            'homeTeamName': home_team,
            'awayTeamName': away_team,
            'finalResult':  final_result or '',
            'userScore':    score,
            'rank':         rank,
            'members':      len(sorted_members),
            'won':          rank == 1 and len(sorted_members) > 1,
        }

        try:
            _history_table.put_item(
                Item=item,
                # Idempotent: same (userId, endedAt) pair won't double-write.
                # Two end-of-match invocations within the same second on the
                # same room could theoretically collide on endedAt; the
                # conditional makes the second one a no-op.
                ConditionExpression='attribute_not_exists(userId) AND attribute_not_exists(endedAt)',
            )
            print(f"[history] recorded {user_id} in match {match_id} (rank={rank}, score={score})")
        except ClientError as e:
            code = e.response.get('Error', {}).get('Code')
            if code == 'ConditionalCheckFailedException':
                # Already recorded for this exact (userId, endedAt). No-op.
                # Skip leaderboard update too — it's already been applied.
                continue
            print(f"[history] put_item failed for {user_id}/{match_id}: {e}")
            # Do not apply leaderboard update if the canonical history
            # row failed to land — keeps the two stores in sync.
            continue
        except Exception as e:
            print(f"[history] unexpected error for {user_id}/{match_id}: {e}")
            continue

        # Leaderboard update — only reached when the history row was a NEW
        # write (not a duplicate, not a failure). Wrapped so a leaderboard
        # failure can't block the rest of the loop.
        if _leaderboard is not None:
            try:
                _leaderboard.apply_member_match_result(
                    member=member,
                    score=score,
                    won=item['won'],
                )
            except Exception as e:
                print(f"[history] leaderboard apply failed for {user_id}: {e}")


# --------------------------------------------------------------------------
# Read API helper (used by the history Lambda)
# --------------------------------------------------------------------------

def list_user_history(user_id: str, limit: int = 50) -> list:
    """Return the user's match history, newest first."""
    if not user_id:
        return []
    try:
        from boto3.dynamodb.conditions import Key
        response = _history_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
            ScanIndexForward=False,  # newest first (endedAt is ISO)
            Limit=max(1, min(int(limit), 200)),
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"[history] list_user_history failed for {user_id}: {e}")
        return []
