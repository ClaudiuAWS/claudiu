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

# credits.py is bundled the same way. A successful badge earn pays out
# brand-coherent brezn (tier-scaled) so badges feel like real rewards.
# Lazy import; missing module = badges still write, no payout.
try:
    import credits as _credits
except Exception:
    _credits = None


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
    # ---- Scoring badges --------------------------------------------------
    'striker_1': {
        'id':          'striker_1',
        'title':       'First Strike',
        'description': 'A player from your squad scored their first goal.',
        'image':       '/badge-striker-1.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },
    'hattrick': {
        'id':          'hattrick',
        'title':       'Hat Trick Hero',
        'description': 'Three goals from your squad in a single match.',
        'image':       '/badge-hattrick.png?v=4',
        'tier':        'gold',
        'discReward':  'pitbull-we-are-one',
        'buyPrice':    2500,            # disc-granting premium over tier 2000
    },
    'golden_boot': {
        'id':          'golden_boot',
        'title':       'Golden Boot',
        'description': 'Top scorer across five consecutive matches.',
        'image':       '/badge-golden-boot.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'goal_machine': {
        'id':          'goal_machine',
        'title':       'Goal Machine',
        'description': 'Your squad has scored 100 career goals.',
        'image':       '/badge-goal-machine.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'playmaker': {
        'id':          'playmaker',
        'title':       'Playmaker',
        'description': 'Goals from five different squad players.',
        'image':       '/badge-playmaker.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'comeback_goal': {
        'id':          'comeback_goal',
        'title':       'Comeback Strike',
        'description': 'Squad scored after trailing by two goals.',
        'image':       '/badge-comeback-goal.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'late_winner': {
        'id':          'late_winner',
        'title':       'Last-Gasp Hero',
        'description': 'Squad scored in the 89th minute or later.',
        'image':       '/badge-late-winner.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'penalty_king': {
        'id':          'penalty_king',
        'title':       'Spot-Kick King',
        'description': 'Score from five penalties total.',
        'image':       '/badge-penalty-king.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'defender_goal': {
        'id':          'defender_goal',
        'title':       "Defender's Dream",
        'description': 'A defender from your squad found the net.',
        'image':       '/badge-defender-goal.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },

    # ---- Defensive badges ------------------------------------------------
    'clean_sheet': {
        'id':          'clean_sheet',
        'title':       'Iron Defense',
        'description': 'Match ended with zero goals conceded.',
        'image':       '/badge-clean-sheet.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'clean_sheet_streak': {
        'id':          'clean_sheet_streak',
        'title':       'Fortress',
        'description': 'Three consecutive clean sheets.',
        'image':       '/badge-clean-sheet-streak.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'keeper_hero': {
        'id':          'keeper_hero',
        'title':       'Keeper Hero',
        'description': 'Multiple decisive saves in a single match.',
        'image':       '/badge-keeper-hero.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },

    # ---- Win badges ------------------------------------------------------
    'first_win': {
        'id':          'first_win',
        'title':       'Maiden Victory',
        'description': 'Won your first match.',
        'image':       '/badge-first-win.png?v=4',
        'tier':        'bronze',
        'discReward':  'shakira-waka-waka',
        'buyPrice':    2000,            # disc-granting premium over tier 300
    },
    'comeback_win': {
        'id':          'comeback_win',
        'title':       'Phoenix',
        'description': 'Won after trailing at halftime.',
        'image':       '/badge-comeback-win.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'win_streak_3': {
        'id':          'win_streak_3',
        'title':       'Triple Crown',
        'description': 'Three consecutive match wins.',
        'image':       '/badge-win-streak-3.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'win_streak_5': {
        'id':          'win_streak_5',
        'title':       'Dynasty',
        'description': 'Five consecutive match wins.',
        'image':       '/badge-win-streak-5.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'dominant_win': {
        'id':          'dominant_win',
        'title':       'Demolition',
        'description': 'Won by a three-goal margin or more.',
        'image':       '/badge-dominant-win.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    # NOTE: derby_winner + underdog_win removed — the engine has no derby
    # concept and no opponent-rating system, so these would never trigger.
    'perfect_match': {
        'id':          'perfect_match',
        'title':       'Flawless',
        'description': 'Won a match without conceding a single goal.',
        'image':       '/badge-perfect-match.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },

    # ---- Mini-game badges ------------------------------------------------
    'quiz_master': {
        'id':          'quiz_master',
        'title':       'Quiz Master',
        'description': 'Perfect score on a Halftime Quiz mini-game.',
        'image':       '/badge-quiz-master.png?v=4',
        'tier':        'silver',
        'discReward':  'kwabs-walk',
        'buyPrice':    2000,            # disc-granting premium over tier 800
    },
    'quiz_perfect_5': {
        'id':          'quiz_perfect_5',
        'title':       'Mind Champion',
        'description': 'Perfect score on five quiz mini-games.',
        'image':       '/badge-quiz-perfect-5.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'reflex_master': {
        'id':          'reflex_master',
        'title':       'Lightning Reflex',
        'description': 'Top tier on a Reflex mini-game.',
        'image':       '/badge-reflex-master.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },

    # ---- Progression badges ----------------------------------------------
    'first_match': {
        'id':          'first_match',
        'title':       'First Kick-Off',
        'description': 'Played your very first match.',
        'image':       '/badge-first-match.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },
    'team_builder': {
        'id':          'team_builder',
        'title':       'Team Builder',
        'description': 'Drafted your first full squad.',
        'image':       '/badge-team-builder.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },
    'weekend_warrior': {
        'id':          'weekend_warrior',
        'title':       'Weekend Warrior',
        'description': 'Played a Saturday or Sunday match.',
        'image':       '/badge-weekend-warrior.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'veteran_10': {
        'id':          'veteran_10',
        'title':       'Veteran X',
        'description': 'Played ten matches.',
        'image':       '/badge-veteran-10.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'veteran_50': {
        'id':          'veteran_50',
        'title':       'Living Legend',
        'description': 'Played fifty matches.',
        'image':       '/badge-veteran-50.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },
    'centurion': {
        'id':          'centurion',
        'title':       'Centurion',
        'description': 'Played one hundred matches.',
        'image':       '/badge-centurion.png?v=4',
        'tier':        'gold',
        'discReward':  None,
    },

    # ---- Social badges ---------------------------------------------------
    'social_butterfly': {
        'id':          'social_butterfly',
        'title':       'Connected',
        'description': 'Added three friends to your network.',
        'image':       '/badge-social-butterfly.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },

    # ---- Cumulative counter badges (earned via atomic counters) ----------
    'striker_5': {
        'id':          'striker_5',
        'title':       'Sharp Shooter',
        'description': 'Your squad scored 5 goals total.',
        'image':       '/badge-striker-5.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'goalkeeper_1': {
        'id':          'goalkeeper_1',
        'title':       'Safe Hands',
        'description': 'Your goalkeeper made their first save.',
        'image':       '/badge-goalkeeper-1.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },
    'goalkeeper_5': {
        'id':          'goalkeeper_5',
        'title':       'The Wall',
        'description': 'Your goalkeeper made 5 saves.',
        'image':       '/badge-goalkeeper-5.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
    'penalty_1': {
        'id':          'penalty_1',
        'title':       'From the Spot',
        'description': 'Your squad scored their first penalty.',
        'image':       '/badge-penalty-1.png?v=4',
        'tier':        'bronze',
        'discReward':  None,
    },
    'penalty_5': {
        'id':          'penalty_5',
        'title':       'Penalty Expert',
        'description': 'Your squad scored 5 penalties.',
        'image':       '/badge-penalty-5.png?v=4',
        'tier':        'silver',
        'discReward':  None,
    },
}


# Purchase price (credits) per badge tier. Mirror of frontend
# `TIER_PRICES` in utils/badges.js — kept in sync by convention.
# Earning in-match is always free; this is the credit-grind path.
TIER_PRICES = {
    'bronze': 200,
    'silver': 500,
    'gold':   1500,
}


def get_price(badge_id: str) -> int:
    entry = BADGE_CATALOG.get(badge_id) or {}
    return TIER_PRICES.get(entry.get('tier'), 0)


def get_catalog():
    """Public catalog — list form, ordered by insertion. Each row gets
    the tier price stamped on it so the frontend doesn't have to keep
    a parallel copy of the price table."""
    out = []
    for entry in BADGE_CATALOG.values():
        row = dict(entry)
        row['creditPrice'] = TIER_PRICES.get(entry.get('tier'), 0)
        out.append(row)
    return out


# --------------------------------------------------------------------------
# Counter thresholds — maps counter SK to badge thresholds
# --------------------------------------------------------------------------
# Ordered ascending. After each atomic increment, we check all thresholds
# and attempt to award any that are now met. award() is idempotent so
# re-checking already-crossed thresholds is a harmless no-op.
_COUNTER_BADGES = {
    'counter#goals':     [(1, 'striker_1'), (5, 'striker_5'), (100, 'goal_machine')],
    'counter#saves':     [(1, 'goalkeeper_1'), (5, 'goalkeeper_5')],
    'counter#penalties': [(1, 'penalty_1'), (5, 'penalty_5')],
}


# Retail price (brezn) to buy a specific badge of the given tier from the
# shop. Mirrors the frontend TIER_PRICES in frontend/src/utils/badges.js
# and the BADGE_EARN_PAYOUT amounts in shared/credits.py — earning and
# buying cost the same; the difference is just whether you grind a
# specific badge in-match or pay to claim one.
BADGE_BUY_PRICES = {
    'bronze': 300,
    'silver': 800,
    'gold':   2000,
}


def _increment_counter(user_id: str, counter_key: str, match_id: str = '', context: dict | None = None) -> None:
    """Atomically increment a counter and award badges whose threshold is met.

    Uses UpdateItem ADD — atomic, no race conditions between concurrent
    Lambda invocations. ReturnValues gives us the new count without a
    separate read.
    """
    try:
        response = _badges_table.update_item(
            Key={'userId': user_id, 'badgeId': counter_key},
            UpdateExpression='ADD #c :inc',
            ExpressionAttributeNames={'#c': 'count'},
            ExpressionAttributeValues={':inc': 1},
            ReturnValues='UPDATED_NEW',
        )
        new_count = int(response['Attributes']['count'])
    except Exception as e:
        print(f"[badges] counter increment failed {user_id}/{counter_key}: {e}")
        return

    thresholds = _COUNTER_BADGES.get(counter_key, [])
    for threshold, badge_id in thresholds:
        if new_count >= threshold:
            award(user_id, badge_id, match_id=match_id, context=context)


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

    # Successful new write — push the popup AND pay the brezn bonus.
    _push_badge_earned(user_id, badge_id, item)
    if _credits is not None:
        try:
            tier = (BADGE_CATALOG.get(badge_id) or {}).get('tier') or 'bronze'
            _credits.award_badge_earned(user_id=user_id, tier=tier, badge_id=badge_id)
        except Exception as _e:  # pragma: no cover
            print(f"[credits] badge-earn payout failed for {user_id}/{badge_id}: {_e}")
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

    Handles:
      - Goals (event_type='goal', reason='scored for your squad')
        → increments counter#goals
        → if isPenalty in event_data, also increments counter#penalties
      - Saves (event_type='saved_shot', reason='made a save')
        → increments counter#saves

    All counters are atomic (DDB ADD). Threshold checks happen inline.
    award() is idempotent so re-checking is safe.
    """
    if not score_changes:
        return
    event_data = event_data or {}

    for change in score_changes:
        user_id = change.get('userId')
        if not user_id:
            continue
        reason = change.get('reason') or ''
        ctx = {'playerName': change.get('playerName') or ''}

        try:
            if event_type == 'goal' and reason == 'scored for your squad':
                _increment_counter(user_id, 'counter#goals', match_id=match_id, context=ctx)
                if event_data.get('isPenalty'):
                    _increment_counter(user_id, 'counter#penalties', match_id=match_id, context=ctx)

            elif event_type == 'saved_shot' and reason == 'made a save':
                _increment_counter(user_id, 'counter#saves', match_id=match_id, context=ctx)

        except Exception as e:
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
    """Return all badges the user has earned, newest first.
    Filters out counter rows (SK starts with 'counter#')."""
    if not user_id:
        return []
    try:
        from boto3.dynamodb.conditions import Key
        response = _badges_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
        )
        items = response.get('Items', [])
        # Filter out counter rows — they share the table but aren't badges
        badges = [it for it in items if not it.get('badgeId', '').startswith('counter#')]
        badges.sort(key=lambda it: it.get('earnedAt', ''), reverse=True)
        return badges
    except Exception as e:
        print(f"[badges] list_user_badges failed for {user_id}: {e}")
        return []
