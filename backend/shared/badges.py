"""
Badges — shared awarding module.

Owns the badge catalog (single source of truth) and the only path that ever
WRITES to claudiu-badges. Imported by Lambdas that already see the right
match-time signals (event-processor for goal events; can be extended later
to rooms/service.py for mini-game / match-end signals).

Design rules:
    1. NEVER raise. The badge layer is additive — a failure here must not
       break scoring or any other match flow. All public functions wrap
       their I/O in try/except and just print on failure.
    2. Idempotent at the storage layer. award() uses a conditional
       PutItem (attribute_not_exists(badgeId)). Re-awards are silent
       no-ops. This is the only safe way given multiple events could
       observe an earnable signal.
    3. WS broadcast happens ONLY on a successful new write. If a user
       already owns the badge, no popup re-fires.

Storage shape (claudiu-badges):
    PK userId   (S)
    SK badgeId  (S)
    earnedAt    (S, ISO)
    matchId     (S, optional)
    context     (M, optional small dict for FE display)

Channel:
    user#{userId}        — same channel friends-invites already use; the
                           frontend BadgeListener mounts globally and
                           picks up the {type: 'badge_earned'} payload.
"""

import os
import time
import boto3
from botocore.exceptions import ClientError

# ws.py is bundled into each Lambda's zip alongside this file (see
# .github/workflows/deploy-event-processor.yml). Import is lazy-friendly:
# a missing ws module would still let award() write the row, the WS push
# just becomes a no-op.
try:
    import ws as _ws
except Exception:
    _ws = None


_dynamodb = boto3.resource('dynamodb')
_BADGES_TABLE_NAME = os.environ.get('BADGES_TABLE', 'claudiu-badges')
_badges_table = _dynamodb.Table(_BADGES_TABLE_NAME)


# --------------------------------------------------------------------------
# Catalog
# --------------------------------------------------------------------------
# This is the canonical list. Frontend has its own display catalog with
# matching ids in `frontend/src/utils/badges.js` — keep ids in sync.
#
# `image` paths are public assets served from the CloudFront frontend, so
# the FE can reference them directly. The backend only echoes the path on
# the badge_earned WS payload so the popup can render before /badges/catalog
# has been fetched.

BADGE_CATALOG = {
    'striker_1': {
        'id':          'striker_1',
        'title':       'First Strike',
        'description': 'A player from your squad scored their first goal.',
        'image':       '/badge-striker-1.png',
        'tier':        'bronze',
    },
    # Future: striker_10, striker_100 — same trigger, different threshold.
}


def get_catalog():
    """Public catalog — list form, ordered by insertion."""
    return list(BADGE_CATALOG.values())


# --------------------------------------------------------------------------
# Award primitive
# --------------------------------------------------------------------------

def award(user_id: str, badge_id: str, match_id: str = '', context: dict | None = None) -> bool:
    """Attempt to award `badge_id` to `user_id`. Returns True only if this
    call actually wrote a NEW row (i.e. the user did not already own it).

    Never raises. On any error returns False so callers can keep going.
    """
    if not user_id or badge_id not in BADGE_CATALOG:
        return False

    item = {
        'userId':   user_id,
        'badgeId':  badge_id,
        'earnedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    if match_id:
        item['matchId'] = match_id
    if context:
        # DDB doesn't accept empty strings inside the map; strip them.
        clean = {k: v for k, v in context.items() if v not in (None, '')}
        if clean:
            item['context'] = clean

    try:
        _badges_table.put_item(
            Item=item,
            ConditionExpression='attribute_not_exists(badgeId)',
        )
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            # User already owns it — silent no-op.
            return False
        print(f"[badges] award put_item failed for {user_id}/{badge_id}: {e}")
        return False
    except Exception as e:
        print(f"[badges] unexpected award error for {user_id}/{badge_id}: {e}")
        return False

    # Successful new write — push the popup.
    _push_badge_earned(user_id, badge_id, item)
    print(f"[badges] awarded {badge_id} to {user_id} (match={match_id or '-'})")
    return True


def _push_badge_earned(user_id: str, badge_id: str, item: dict) -> None:
    if _ws is None:
        return
    catalog_entry = BADGE_CATALOG.get(badge_id) or {}
    payload = {
        'type':  'badge_earned',
        'badge': {
            'badgeId':     badge_id,
            'title':       catalog_entry.get('title', badge_id),
            'description': catalog_entry.get('description', ''),
            'image':       catalog_entry.get('image', ''),
            'tier':        catalog_entry.get('tier', 'bronze'),
            'earnedAt':    item.get('earnedAt'),
            'matchId':     item.get('matchId') or '',
            'context':     item.get('context') or {},
        },
    }
    try:
        _ws.push_to_channel(f"user#{user_id}", payload)
    except Exception as e:
        # Connection might be gone, channel empty, etc. The row is written;
        # the FE will see the badge on next /badges fetch regardless.
        print(f"[badges] ws push failed for {user_id}/{badge_id}: {e}")


# --------------------------------------------------------------------------
# Rule entry points
# --------------------------------------------------------------------------
# Each evaluator is called from one well-defined integration point. The
# event-processor only invokes evaluate_score_changes today; the others
# are stubs reserved for future badges so the file shape doesn't need to
# change when we add them.

def evaluate_score_changes(
    room: dict,
    score_changes: list,
    event_type: str,
    match_id: str,
    event_data: dict | None = None,
) -> None:
    """Called from event-processor after a goal/card/save has been scored.

    `score_changes` is the same list already broadcast in `score_update`
    over the room channel — every entry includes `userId`, `delta`,
    `eventType`, `reason`, `playerName`. We only need to read it; we never
    mutate scoring.

    For striker_1: any score_change with eventType='goal' and
    reason='scored for your squad' means a player THIS user drafted just
    scored. Award the badge (idempotent — re-awarding is a silent no-op).
    """
    if event_type != 'goal' or not score_changes:
        return
    event_data = event_data or {}
    for change in score_changes:
        if change.get('eventType') != 'goal':
            continue
        if change.get('reason') != 'scored for your squad':
            continue
        user_id = change.get('userId')
        if not user_id:
            continue
        try:
            award(
                user_id=user_id,
                badge_id='striker_1',
                match_id=match_id,
                context={
                    'playerName': change.get('playerName') or '',
                    'eventId':    change.get('sourceEventId') or '',
                },
            )
        except Exception as e:
            # Belt-and-braces: award() already swallows everything, but
            # belt-and-braces this loop too so one bad row can't block
            # the next user's award.
            print(f"[badges] evaluate_score_changes inner error: {e}")


# Reserved for future badges; kept here so the contract is visible.
def evaluate_minigame(*args, **kwargs) -> None:  # noqa: D401
    """Future: mini-game-driven badges (perfect reflex, quiz streak, ...)."""
    return None


def evaluate_match_end(*args, **kwargs) -> None:  # noqa: D401
    """Future: end-of-match badges (winner, comeback_kid, first_match, ...)."""
    return None


# --------------------------------------------------------------------------
# Read API helper (used by the badges Lambda)
# --------------------------------------------------------------------------

def list_user_badges(user_id: str) -> list:
    """Return all badges the user has earned, newest first."""
    if not user_id:
        return []
    try:
        from boto3.dynamodb.conditions import Key
        response = _badges_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
        )
        items = response.get('Items', [])
        # earnedAt is ISO so lexicographic sort == chronological sort.
        items.sort(key=lambda it: it.get('earnedAt', ''), reverse=True)
        return items
    except Exception as e:
        print(f"[badges] list_user_badges failed for {user_id}: {e}")
        return []
