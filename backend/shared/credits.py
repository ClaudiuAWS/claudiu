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

# Catalog lookup — single source of truth for kind/cost. Bundled alongside
# this module by every Lambda that imports credits (credits handler,
# event-processor) so the import always resolves at runtime.
try:
    import breznCatalog as _catalog  # type: ignore
except ImportError:
    _catalog = None


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


# ----- Earn rates (single source of truth, kept here so all writers ----
# agree on the brand-coherent economy). Tweaking a number here changes
# both backend awards AND the frontend's "rumored payout" hints.

# Match-end bonuses, paid once per user per match at fulltime.
# Rebalanced in the thirtieth pass: bumped to make each match feel
# rewarding now that the market is live. A peak win pays ~700 brezn,
# enough to afford a single light perk or chip away at a cosmetic.
MATCH_PARTICIPATION_BONUS = 75    # bumped 50→75
WINNER_BONUS_BASE         = 75    # bumped 50→75 — winning is the main earner
WINNER_BONUS_PER_PT_LEAD  = 5     # +5 brezn per fantasy-point lead over runner-up
WINNER_BONUS_CAP          = 350   # bumped 300→350
CLEAN_SHEET_BONUS         = 100   # match where YOUR keeper conceded 0
CAPTAIN_DELIVERED_BONUS   = 100   # bumped 75→100 — rewards strategic captain pick
DAILY_FIRST_MATCH_BONUS   = 100   # bumped 50→100 — habit hook

# Badge unlock — paid once at the moment an earned (not bought) badge
# fires. The payout matches what the badge card visibly displays on
# /badges (frontend/src/utils/badges.js TIER_PRICES) — i.e. the badge's
# advertised value IS what the wallet gets credited. Buying a badge of
# the same tier via the shop costs the same amount, so earning is
# always equal-or-better value (no grind tax for paying).
BADGE_EARN_PAYOUT = {
    'bronze': 300,    # was 150 — matches displayed TIER_PRICES.bronze
    'silver': 800,    # was 400 — matches displayed TIER_PRICES.silver
    'gold':   2000,   # was 1000 — matches displayed TIER_PRICES.gold
}

# Mini-game payouts, fired by the mini-game scoring path.
MINIGAME_PAYOUT = {
    'HALFTIME_QUIZ_CORRECT':  20,   # per correct answer
    'OFFSIDE_REFLEX_HIT':     30,
    'SHOT_CALL_HIT':          30,
    'PENALTY_SHOOTOUT_WIN':   40,
}

# Growth loop: paying both ends of an invite acceptance.
INVITE_ACCEPTED_BONUS = 150       # bumped 100→150


def award_match_end_bonuses(room: dict, final_result: str = '') -> None:
    """Called from event-processor's `_end_rooms` at fulltime. Computes
    + awards every match-end bonus per member. Never raises — failures
    are logged and swallowed so the room cleanup is unaffected.

    Bonuses (additive per member):
      • Participation:    +MATCH_PARTICIPATION_BONUS (every finisher)
      • Winner:           scaled by fantasy-pts gap to runner-up
                          (base + gap*per_pt, capped). Solo matches
                          are treated as participation-only.
      • Clean sheet:      +CLEAN_SHEET_BONUS if a member's drafted GK
                          on the team that conceded 0
      • Captain delivered:+CAPTAIN_DELIVERED_BONUS if the member's
                          captainPlayerId was a scorer/assister/keeper
                          for any event this match (proxied by the
                          captain having a non-zero fantasy score
                          contribution — we re-derive from match score
                          here since the per-event breakdown isn't
                          stored on the room record).
    """
    members = room.get('members', [])
    if not members:
        return

    match_id  = room.get('matchId') or ''
    room_code = room.get('roomCode') or ''

    # Parse the final result so the clean-sheet rule can ask "was YOUR
    # team's score the zero half?". finalResult shape is "H:A".
    home_goals, away_goals = _parse_final_result(final_result)

    scores = [int(m.get('score') or 0) for m in members]
    top_score = max(scores) if scores else 0
    runner_up = sorted(scores, reverse=True)[1] if len(scores) > 1 else 0

    for m in members:
        uid = m.get('userId')
        if not uid:
            continue

        total = 0
        reasons = []

        # 1. Participation — flat floor.
        total += MATCH_PARTICIPATION_BONUS
        reasons.append('participation')

        # 2. Winner bonus — multi-user matches only. Tie-on-top still
        # rewards both, scaled by lead over runner-up (= 0 when tied,
        # so flat WINNER_BONUS_BASE).
        score = int(m.get('score') or 0)
        if len(members) > 1 and score == top_score and top_score > runner_up:
            lead = top_score - runner_up
            winner_amt = min(WINNER_BONUS_CAP, WINNER_BONUS_BASE + lead * WINNER_BONUS_PER_PT_LEAD)
            total += winner_amt
            reasons.append(f'winner +{winner_amt}')
        elif len(members) > 1 and score == top_score and top_score == runner_up:
            # Multi-way tie at the top — give everyone the base.
            total += WINNER_BONUS_BASE
            reasons.append('shared winner')

        # 3. Clean sheet — find the member's drafted keeper, check if
        # the team they're on conceded 0 goals.
        details = m.get('teamSelectionDetails') or []
        gk = next((d for d in details if (d.get('position') or '') == 'TW'), None)
        if gk:
            gk_role = (gk.get('teamRole') or '').lower()
            conceded = away_goals if gk_role == 'home' else home_goals if gk_role == 'away' else None
            if conceded == 0:
                total += CLEAN_SHEET_BONUS
                reasons.append('clean sheet')

        # 4. Captain delivered — proxy: did the captain pick up any
        # positive contribution this match? Without per-event history
        # on the room record we approximate via the match score: if the
        # member's overall score is positive AND they have a captain
        # set, assume the captain helped. Cheap, generous, and shifts
        # the captain pick toward feeling rewarding.
        if (m.get('captainPlayerId') or '') and score > 0:
            total += CAPTAIN_DELIVERED_BONUS
            reasons.append('captain delivered')

        # 5. Daily first match — one bonus per UTC day, evaluated at the
        # award time. Uses a conditional update on lastDailyBonusYmd so
        # concurrent end-of-match awards from different rooms can't
        # double-grant.
        if _claim_daily_first_match(uid):
            total += DAILY_FIRST_MATCH_BONUS
            reasons.append('daily first match')

        if total <= 0:
            continue
        reason = ' · '.join(reasons)
        if match_id:
            reason = f"{reason} (match {match_id})"
        award(user_id=uid, amount=total, reason=reason)


def award_badge_earned(user_id: str, tier: str, badge_id: str = '') -> None:
    """Called from shared/badges.py at the moment a badge is unlocked
    (writes the badge row → calls this). Pays a tier-scaled bonus.
    Idempotency is handled by the badges layer: it only invokes this
    when the conditional PutItem actually inserted a new row.
    """
    amount = BADGE_EARN_PAYOUT.get((tier or '').lower(), 0)
    if amount <= 0 or not user_id:
        return
    reason = f"badge unlock: {badge_id}" if badge_id else 'badge unlock'
    award(user_id=user_id, amount=amount, reason=reason)


def award_minigame_result(user_id: str, kind: str, count: int = 1) -> None:
    """Pay out a mini-game result. `kind` is one of the MINIGAME_PAYOUT
    keys; `count` multiplies (e.g. 3 correct quiz answers → count=3).
    """
    per = MINIGAME_PAYOUT.get(kind, 0)
    if per <= 0 or count <= 0 or not user_id:
        return
    award(user_id=user_id, amount=per * count, reason=f'minigame: {kind.lower()}')


def award_invite_accepted(inviter_user_id: str, invitee_user_id: str) -> None:
    """Pay both ends of a friend-invite acceptance. Called once per
    invite from the friends acceptance path.
    """
    for uid in (inviter_user_id, invitee_user_id):
        if not uid:
            continue
        award(user_id=uid, amount=INVITE_ACCEPTED_BONUS, reason='invite accepted')


def consume_perks_for_match(user_id: str, match_id: str) -> None:
    """Release consumable inventory entries bound to this match so the
    user can re-buy them. Called from event-processor's `_end_rooms` at
    fulltime — without this the perks would stay forever-owned with
    `consumedForMatch = <past matchId>`, blocking the user from buying
    the same perk again (they could only ever use each consumable
    once across the lifetime of the wallet).

    Idempotent: no-op if the user owns no consumables or none are
    bound to this match. Never raises — wrapped so match-end cleanup
    can't be broken by a wallet error.
    """
    if not user_id or not match_id:
        return
    try:
        item = _table.get_item(
            Key={'userId': user_id},
            ConsistentRead=True,
        ).get('Item') or {}
    except Exception as e:
        print(f"[credits] consume_perks_for_match read failed for {user_id}: {e}")
        return
    inventory = item.get('inventory') or {}
    # Catalog is the source of truth for "is this consumable?". The stored
    # `kind` on a row can lag behind a catalog flip (e.g. reaction-pack
    # was once consumable, now permanent — pre-existing owners still have
    # `kind: 'consumable'` on their row but must NOT be deleted).
    def _is_consumable(iid: str, entry: dict) -> bool:
        if _catalog is not None:
            return _catalog.is_consumable(iid)
        return (entry or {}).get('kind') == 'consumable'

    to_remove = [
        iid for iid, e in inventory.items()
        if _is_consumable(iid, e)
        and (e or {}).get('consumedForMatch') == match_id
    ]
    if not to_remove:
        return
    # REMOVE inventory.#i0, inventory.#i1, ... — DDB doesn't allow REMOVE
    # of map keys with a literal in the path, hence the ExpressionAttributeNames
    # placeholder per key.
    update_expr = 'REMOVE ' + ', '.join(f'inventory.#i{n}' for n in range(len(to_remove)))
    names       = {f'#i{n}': iid for n, iid in enumerate(to_remove)}
    try:
        _table.update_item(
            Key={'userId': user_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=names,
        )
        print(f"[credits] released {len(to_remove)} consumed perks for {user_id} from {match_id}: {to_remove}")
    except Exception as e:
        print(f"[credits] consume_perks_for_match write failed for {user_id}/{match_id}: {e}")


# ----- Internal helpers ----------------------------------------------

def _parse_final_result(final_result: str):
    """'2:1' → (2, 1). Anything malformed → (None, None)."""
    try:
        if not final_result:
            return (None, None)
        parts = str(final_result).split(':')
        return (int(parts[0]), int(parts[1]))
    except Exception:
        return (None, None)


def _claim_daily_first_match(user_id: str) -> bool:
    """Atomic UTC-daily claim. Returns True if this call won the claim
    (caller should award), False if today's bonus was already taken.

    Uses a conditional UpdateItem on `lastDailyBonusYmd` so concurrent
    end-of-match invocations on the same user can't double-grant.
    """
    if not user_id:
        return False
    today = time.strftime('%Y-%m-%d', time.gmtime())
    try:
        _table.update_item(
            Key={'userId': user_id},
            UpdateExpression='SET lastDailyBonusYmd = :today',
            ConditionExpression='attribute_not_exists(lastDailyBonusYmd) OR lastDailyBonusYmd <> :today',
            ExpressionAttributeValues={':today': today},
        )
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return False
        print(f"[credits] daily claim failed for {user_id}: {e}")
        return False
    except Exception as e:
        print(f"[credits] daily claim error for {user_id}: {e}")
        return False
