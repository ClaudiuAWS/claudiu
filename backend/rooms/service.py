import boto3
import json
import os
import time
import random
import string
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

import ws

# Bundled into the Lambda zip by deploy-rooms.yml. Lazy import so a
# stale deploy that hasn't picked up the new bundle still runs (the
# minigame payout just no-ops in that case).
try:
    import credits as _credits
except Exception:
    _credits = None

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda', region_name='eu-central-1')
rooms_table = dynamodb.Table(os.environ['ROOMS_TABLE'])
matches_table = dynamodb.Table(os.environ['MATCHES_TABLE'])
player_lookup_table = dynamodb.Table(os.environ['PLAYER_LOOKUP_TABLE'])


def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _get_user_current_room(user_id: str):
    response = rooms_table.scan(
        FilterExpression=Attr('members').contains({'userId': user_id}) & Attr('status').ne('ended')
    )
    rooms = response.get('Items', [])
    return rooms[0] if rooms else None


def create_room(match_id: str, user_id: str, display_name: str, avatar_url: str = '') -> dict:
    existing_room = _get_user_current_room(user_id)
    if existing_room:
        raise ValueError('You are already in a room. Leave it first.')

    match = matches_table.get_item(Key={'matchId': match_id}).get('Item')
    if not match:
        raise ValueError('Match not found')

    for _ in range(5):
        room_code = generate_room_code()
        if not rooms_table.get_item(Key={'roomCode': room_code}).get('Item'):
            break
    else:
        raise RuntimeError('Failed to generate unique room code')

    room = {
        'roomCode': room_code,
        'matchId': match_id,
        'hostUserId': user_id,
        'members': [{
            'userId': user_id,
            'displayName': display_name,
            'avatarUrl': avatar_url or '',
            'score': 0
        }],
        'status': 'waiting',
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'TTL': int(time.time()) + 86400
    }

    rooms_table.put_item(Item=room)
    return room


def join_room(room_code: str, user_id: str, display_name: str, avatar_url: str = '') -> dict:
    existing_room = _get_user_current_room(user_id)
    if existing_room and existing_room['roomCode'] != room_code:
        raise ValueError('You are already in another room. Leave it first.')

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    if room['status'] != 'waiting':
        raise ValueError('Room is no longer accepting players')

    members = room.get('members', [])
    existing_idx = next((i for i, m in enumerate(members) if m['userId'] == user_id), -1)
    if existing_idx >= 0:
        # Idempotent rejoin — refresh avatarUrl + displayName in case the
        # user updated their profile between sessions. Preserves score
        # and team selection. Skip the DDB write if nothing changed.
        existing = members[existing_idx]
        if (existing.get('avatarUrl') or '') != (avatar_url or '') or existing.get('displayName') != display_name:
            existing['avatarUrl']  = avatar_url or ''
            existing['displayName'] = display_name
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='SET members = :members',
                ExpressionAttributeValues={':members': members}
            )
            room['members'] = members
            _push_room_update(room)
        return room

    members.append({
        'userId': user_id,
        'displayName': display_name,
        'avatarUrl': avatar_url or '',
        'score': 0
    })

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )

    room['members'] = members
    _push_room_update(room)
    return room


def leave_room(room_code: str, user_id: str) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    if room['hostUserId'] == user_id:
        rooms_table.delete_item(Key={'roomCode': room_code})
        ws.push_to_channel(f"room#{room_code}", {'type': 'room_closed'})
        return {'roomCode': room_code, 'deleted': True}

    members = [m for m in room.get('members', []) if m['userId'] != user_id]

    if not members:
        rooms_table.delete_item(Key={'roomCode': room_code})
        ws.push_to_channel(f"room#{room_code}", {'type': 'room_closed'})
        return {'roomCode': room_code, 'deleted': True}

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )

    room['members'] = members
    _push_room_update(room)
    return {'roomCode': room_code, 'deleted': False}


def get_room(room_code: str) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    return room


def send_message(room_code: str, user_id: str, display_name: str, text: str) -> None:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    ws.push_to_channel(f"room#{room_code}", {
        'type':        'chat_message',
        'userId':      user_id,
        'displayName': display_name,
        'text':        text,
        'ts':          int(time.time() * 1000),
    })


# Free-form floating reactions. Allow-list keeps the floater overlay
# focused, prevents arbitrary user-controlled strings from being broadcast
# to the whole party, and gives the design a defined palette.
# Base 7 + premium German football pack (unlocked via the reaction-pack
# shop perk). Keep in lockstep with BASE_EMOJIS + PREMIUM_EMOJIS in
# frontend/src/components/match/ReactionsButton.jsx — sender's optimistic
# floater fires regardless, but cross-user fanout requires backend
# accept here (else broadcast raises "Unsupported emoji" and the WS
# payload never goes out).
CHEER_EMOJI_ALLOWLIST = {
    # Base — everyone has these
    '⚽', '🔥', '🤣', '😱', '🙌', '💀', '🥨',
    # Premium reactions pack (German football themed)
    '🍺', '🌭', '👑', '🐐', '🎺', '🏆',
}


def set_captain(room_code: str, user_id: str, player_id: str) -> dict:
    """Designate `player_id` as `user_id`'s captain for this room.

    The captain's delta is doubled on scoring events in
    `event-processor/_calculate_member_changes`. Validates the player
    is actually in the user's `teamSelection` (can't captain someone
    you didn't draft). Idempotent — calling again with the same
    player_id is a no-op; with a different player_id, swaps. Pass an
    empty string to clear.

    Returns the updated room snapshot.
    """
    room = rooms_table.get_item(Key={'roomCode': room_code}, ConsistentRead=True).get('Item')
    if not room:
        raise ValueError('Room not found')

    members = room.get('members', [])
    me = next((m for m in members if m.get('userId') == user_id), None)
    if not me:
        raise ValueError('You are not in this room')

    if player_id and player_id not in (me.get('teamSelection') or []):
        raise ValueError('Player not in your squad')

    me['captainPlayerId'] = player_id or ''

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :m',
        ExpressionAttributeValues={':m': members},
    )

    ws.push_to_channel(f"room#{room_code}", {
        'type':       'captain_update',
        'userId':     user_id,
        'playerId':   player_id or '',
    })

    return room


def cheer(room_code: str, user_id: str, display_name: str, avatar_url: str, emoji: str) -> dict:
    """Broadcast a floating-reaction emoji to everyone in the room.

    Separate from `claim_reaction` (the event-tied +2 scoring bonus).
    Pure pub/sub — no DDB write, no scoring effect, just a WS push that
    the ReactionsOverlay on each client animates as a floater. Caller
    must be a member of the room; emoji must be in the allow-list.
    """
    if emoji not in CHEER_EMOJI_ALLOWLIST:
        raise ValueError('Unsupported emoji')

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    ws.push_to_channel(f"room#{room_code}", {
        'type':        'cheer',
        'userId':      user_id,
        'displayName': display_name,
        'avatarUrl':   avatar_url or '',
        'emoji':       emoji,
        'ts':          int(time.time() * 1000),
    })
    return {'ok': True}


def apply_minigame_score(room_code: str, submitter_user_id: str, game_id: str, game_type: str, deltas: list, result: dict, phase: str = 'final') -> dict:
    """Resolve a mini-game's score deltas onto the room's leaderboard.

    Mini-games run client-side for v1 (timing UI + bot all in browser). Each
    user posts only their OWN tap result here; backend applies just that
    user's delta and broadcasts. Other clients receive each user's broadcast
    and accumulate the panel locally.

    Idempotent per (gameId, userId): a single user can only score once for a
    given game (retries are no-ops), but multiple users in the same game
    each get their own resolution + broadcast.

    Strong-consistent read: members are SET as a whole list below, so a stale
    eventual-consistent read here would regress every other user's score
    back to a stale snapshot. The cost is one extra millisecond.
    """
    room = rooms_table.get_item(Key={'roomCode': room_code}, ConsistentRead=True).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == submitter_user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    # Penalty announce-only POST: shooter or keeper broadcasting their pick
    # before the outcome is computed. Skip idempotency / DDB writes / score
    # updates — this is purely a pub/sub of `result.pick` so the opponent's
    # client knows which corner was chosen. The follow-up `phase: 'final'`
    # POST from `_resolveBoth` carries the real deltas and goes through the
    # normal path below.
    if phase == 'announce':
        ws.push_to_channel(f"room#{room_code}", {
            'type':     'minigame_result',
            'gameId':   game_id,
            'gameType': game_type,
            'result':   result,
            'deltas':   [],
        })
        return {'ok': True, 'announce': True}

    resolved = set(room.get('resolvedMinigames') or [])
    submitter_key = f"{game_id}:{submitter_user_id}" if game_id else None
    if submitter_key and submitter_key in resolved:
        return {'ok': True, 'duplicate': True}

    members = room.get('members', [])
    # Apply ONLY the submitter's delta. Trust the submitter to score themselves
    # but never to score other users — that prevents one client from inflating
    # a roommate's score.
    submitter_delta = next((d for d in deltas if d.get('userId') == submitter_user_id), None)
    raw_delta = int(submitter_delta.get('delta') or 0) if submitter_delta else 0
    score_changes = []
    new_score = None

    if submitter_delta:
        for m in members:
            if m['userId'] != submitter_user_id:
                continue
            new_score = int(m.get('score', 0)) + raw_delta
            if raw_delta != 0:
                m['score'] = new_score
            # Always emit a score_change row, even when delta is 0. The
            # minigame_result merge on the frontend uses this so each user's
            # modal can show every participant's result — including their own
            # 0-point tap and the opponent's positive tap on the same modal,
            # rather than the "No points awarded this round" empty fallback.
            score_changes.append({
                'userId':        submitter_user_id,
                'displayName':   m.get('displayName'),
                'delta':         raw_delta,
                'newScore':      new_score,
                'eventType':     game_type or 'minigame',
                'reason':        submitter_delta.get('reason') or game_type,
                # Lets the frontend score_update handler suppress its toast
                # for mini-game deltas — the modal's result panel already
                # surfaces these.
                'source':        'minigame',
                # Stable id used by the frontend dedup. Each game has a
                # unique id, so a duplicate WS delivery (or a re-broadcast
                # on retry) won't double-count in the leaderboard timeline.
                'sourceEventId': game_id or '',
            })
            break

    update_kwargs = {
        'Key': {'roomCode': room_code},
    }
    # Skip the DDB members write when the delta is 0 — nothing changed in the
    # member list. Always record idempotency on resolvedMinigames so retries
    # are no-ops regardless of score outcome.
    if raw_delta != 0:
        update_kwargs['UpdateExpression'] = 'SET members = :members'
        update_kwargs['ExpressionAttributeValues'] = {':members': members}
    if submitter_key:
        if 'UpdateExpression' in update_kwargs:
            update_kwargs['UpdateExpression'] += ' ADD resolvedMinigames :gid'
            update_kwargs['ExpressionAttributeValues'][':gid'] = {submitter_key}
        else:
            update_kwargs['UpdateExpression'] = 'ADD resolvedMinigames :gid'
            update_kwargs['ExpressionAttributeValues'] = {':gid': {submitter_key}}
    if 'UpdateExpression' in update_kwargs:
        rooms_table.update_item(**update_kwargs)

    # Only broadcast a score_update when there's an actual scoreboard change.
    # 0-delta participation flows through minigame_result (below) only.
    if raw_delta != 0:
        leaderboard = sorted(
            [{'userId': m['userId'], 'displayName': m['displayName'], 'score': int(m.get('score', 0))} for m in members],
            key=lambda x: x['score'],
            reverse=True,
        )
        ws.push_to_channel(f"room#{room_code}", {
            'type':        'score_update',
            'leaderboard': leaderboard,
            'changes':     score_changes,
        })

    # Inform clients about the resolution itself so the modal can show the
    # full result panel (own delta + opponent deltas, reason text, etc).
    ws.push_to_channel(f"room#{room_code}", {
        'type':     'minigame_result',
        'gameId':   game_id,
        'gameType': game_type,
        'result':   result,
        'deltas':   score_changes,
    })

    # Credit payout for the mini-game win. Same rate as event scoring
    # (delta × CREDITS_PER_POINT) so the economy stays coherent across
    # event types. Wrapped so a credits failure can't break the modal
    # broadcast above.
    if _credits is not None and raw_delta > 0:
        try:
            _credits.award(
                user_id=submitter_user_id,
                amount=raw_delta * _credits.CREDITS_PER_POINT,
                reason=f"minigame · {game_type or 'event'}",
            )
        except Exception as _e:
            print(f"[credits] minigame payout failed for {submitter_user_id}: {_e}")

    return {'ok': True, 'changes': score_changes}


# ─── Reaction taps (nutmeg / spectacular_play bonus) ──────────────────────────
#
# Match feed surfaces a 1.5s tappable badge on nutmeg / spectacular_play events.
# First-tap-per-(eventId,userId) wins +2. Idempotent via a string-set field on
# the room: any subsequent tap returns ok+duplicate without bumping the score.
# No window enforcement server-side — the frontend owns the timing and just
# stops sending taps once the window closes; that's fine because the only cost
# of a late-tap accept is a +2 the user has earned by being clicky.

REACTION_BONUS = 2


def claim_reaction(room_code: str, user_id: str, event_id: str, reaction_type: str) -> dict:
    if not event_id:
        raise ValueError('eventId is required')

    # Strong-consistent read: same regression risk as apply_minigame_score
    # — we SET members as a whole list, so a stale read would clobber other
    # users' accumulated scores back to whatever was in the stale snapshot.
    room = rooms_table.get_item(Key={'roomCode': room_code}, ConsistentRead=True).get('Item')
    if not room:
        raise ValueError('Room not found')
    member = next((m for m in room.get('members', []) if m['userId'] == user_id), None)
    if not member:
        raise ValueError('You are not in this room')

    claim_key = f"{event_id}:{user_id}"
    claimed = set(room.get('reactionsClaimed') or [])
    if claim_key in claimed:
        return {'ok': True, 'duplicate': True}

    members = room.get('members', [])
    new_score = int(member.get('score', 0)) + REACTION_BONUS
    for m in members:
        if m['userId'] == user_id:
            m['score'] = new_score
            break

    # Atomic claim — without ConditionExpression, two near-simultaneous
    # POSTs from the same user could both pass the in-memory `claim_key
    # in claimed` check above (read-then-write race), both `update_item`
    # the score, and both broadcast a `score_update`, producing two
    # REACTED TO NUTMEG rows even though backend idempotency was the
    # whole point of the claim set. The condition tells DDB "only
    # succeed if this claim_key isn't already in the set"; the second
    # request gets ConditionalCheckFailedException and we surface it as
    # the existing `duplicate` response.
    try:
        rooms_table.update_item(
            Key={'roomCode': room_code},
            UpdateExpression='SET members = :m ADD reactionsClaimed :v',
            ConditionExpression='attribute_not_exists(reactionsClaimed) OR NOT contains(reactionsClaimed, :claim_str)',
            ExpressionAttributeValues={
                ':m':         members,
                ':v':         {claim_key},
                ':claim_str': claim_key,
            },
        )
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return {'ok': True, 'duplicate': True}
        raise

    label = 'nutmeg' if reaction_type == 'nutmeg' else 'spectacular play'
    score_changes = [{
        'userId':        user_id,
        'delta':         REACTION_BONUS,
        'newScore':      new_score,
        'eventType':     reaction_type or 'reaction',
        'reason':        f'reacted to {label}',
        'playerName':    member.get('displayName') or '',
        # Stable id for frontend dedup against handleReactTap's
        # optimistic HTTP-driven append (see applyAuthoritativeScoreChange
        # in useRoom.js).
        'sourceEventId': event_id,
    }]

    leaderboard = sorted(
        [{'userId': m['userId'], 'displayName': m['displayName'], 'score': int(m.get('score', 0))} for m in members],
        key=lambda x: x['score'],
        reverse=True,
    )
    ws.push_to_channel(f"room#{room_code}", {
        'type':        'score_update',
        'leaderboard': leaderboard,
        'changes':     score_changes,
    })

    return {'ok': True, 'changes': score_changes}


# ─── Coordinated Draft (2-user simultaneous-pick mode) ────────────────────────
#
# When two humans share a room, the draft runs server-side:
#   1. Both users click "Ready Up" → backend marks them ready.
#   2. Once 2 users are ready, backend generates pairs and broadcasts
#      `draft_started`. The pair generation mirrors the frontend's solo logic
#      (zone-based pairing) but runs on a single source of truth.
#   3. For each pair: both users privately submit a pick. Backend waits for
#      both, then resolves:
#        - Different picks: each user gets the player they picked.
#        - Same pick:       random tiebreak — winner gets the picked player,
#                           loser gets the other.
#      Broadcasts `draft_pair_resolved` with both picks and tiebreak info.
#   4. After the last pair, broadcasts `draft_complete` with both rosters.
#
# Solo (1-user) rooms keep the existing client-only simulation in
# TeamSelectionModal.jsx — backend is bypassed entirely. The branch is
# `room.members.length` on the frontend.

# German position code → English type → draft zone. Mirrors the frontend's
# POS_TO_TYPE × TYPE_TO_DRAFT_ZONE constants in TeamSelectionModal.jsx.
_POS_TO_TYPE = {
    'TW':  'GK',
    'IVZ': 'CB',  'IVL': 'CB',  'IVR': 'CB',
    'LV':  'LB',  'RV':  'RB',
    'DMZ': 'CDM', 'DML': 'CDM', 'DMR': 'CDM',
    'DLM': 'CM',  'DRM': 'CM',
    'ZO':  'CAM',
    'OLM': 'LM',  'ORM': 'RM',
    'LA':  'LW',  'RA':  'RW',
    'STZ': 'ST',
    'STL': 'CF',  'STR': 'CF',
}
_TYPE_TO_ZONE = {
    'GK':  'GK',
    'CB':  'DEF', 'LB':  'DEF', 'RB':  'DEF',
    'CDM': 'CDM', 'CM':  'CDM',
    'LM':  'WIDE', 'RM': 'WIDE', 'LW': 'WIDE', 'RW': 'WIDE',
    'CAM': 'ATK',  'CF': 'ATK',  'ST': 'ATK',
}
_ZONE_ORDER = ['GK', 'DEF', 'CDM', 'WIDE', 'ATK']


def _normalize_draft(draft: dict) -> dict:
    """Coerce DDB numeric fields to native ints before WS push.

    DynamoDB returns numbers as Decimal, which json.dumps(default=str)
    serializes as strings. mark_draft_ready builds with native ints, but
    submit_draft_pick reads back from DDB — so the wire format flip-flops
    between number and string for the same field. Frontend coerces too,
    but a clean wire format prevents debugging headaches and keeps
    React's dep comparisons type-stable.
    """
    return {
        **draft,
        'currentPairIndex': int(draft.get('currentPairIndex', 0)),
        'totalPairs':       int(draft.get('totalPairs', 0)),
    }


def _generate_draft_pairs(match_id: str) -> tuple[list, list]:
    """Build the pair list + auto-picks-for-host from the match's player roster.

    Returns (pairs, auto_picks):
      pairs: ordered list of [playerIdA, playerIdB] — these are decided pairwise.
      auto_picks: list of playerIds that get auto-assigned (when a zone has an
                  odd number of players, one is unpaired and goes to the host).

    The order is randomised within each zone, then pairs are interleaved
    across zones so users don't get a single position-type streak.
    """
    resp = player_lookup_table.query(
        KeyConditionExpression=Key('matchId').eq(match_id),
    )
    players = resp.get('Items', [])
    while resp.get('LastEvaluatedKey'):
        resp = player_lookup_table.query(
            KeyConditionExpression=Key('matchId').eq(match_id),
            ExclusiveStartKey=resp['LastEvaluatedKey'],
        )
        players.extend(resp.get('Items', []))

    # Group by zone, dropping players without a known position. Keep the full
    # player object (not just playerId) so we can prioritise starters when
    # pairing — see below.
    by_zone = {z: [] for z in _ZONE_ORDER}
    for p in players:
        t = _POS_TO_TYPE.get(p.get('position'))
        if not t:
            continue
        z = _TYPE_TO_ZONE.get(t, 'ATK')
        by_zone.setdefault(z, []).append(p)

    pairs = []
    auto_picks = []
    for zone in _ZONE_ORDER:
        zone_roster = list(by_zone.get(zone, []))
        # Within each zone: starters first (shuffled), subs after (shuffled).
        # When the zone has an odd total, the leftover ends up being the LAST
        # entry in the ordered list — i.e. a sub, never a starter. So the
        # 'best' player in a zone (Kane in ATK, Neuer in GK) can never be
        # the unpaired auto-pick. Within each tier we still shuffle for
        # variety so the pairing isn't predictable.
        starters = [p for p in zone_roster if p.get('starting')]
        subs     = [p for p in zone_roster if not p.get('starting')]
        random.shuffle(starters)
        random.shuffle(subs)
        ordered = [p['playerId'] for p in starters] + [p['playerId'] for p in subs]

        i = 0
        while i + 1 < len(ordered):
            pairs.append([ordered[i], ordered[i + 1]])
            i += 2
        if len(ordered) % 2 == 1:
            auto_picks.append(ordered[-1])  # always a sub if any sub exists

    random.shuffle(pairs)
    return pairs, auto_picks


def mark_draft_ready(room_code: str, user_id: str) -> dict:
    """Toggle the user into the draft 'ready' set. When 2 users are ready,
    generate pairs and start the draft.
    """
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    draft = room.get('draft') or {}
    if draft.get('status') in ('active', 'complete'):
        # Already past ready phase — no-op.
        return {'ok': True, 'status': draft.get('status')}

    ready = set(draft.get('readyUserIds') or [])
    if user_id in ready:
        return {'ok': True, 'alreadyReady': True}
    ready.add(user_id)

    # Arm consumable perks at the ready-up moment. Draft-time perks
    # (pick-reroll) need to be available during the draft phase — by
    # the time select_team fires it's already too late. The same call
    # at select_team is idempotent for the same match, so match-time
    # perks (captain-triple, free-hit) still get stamped on the final
    # member entry there too.
    match_id = room.get('matchId') or ''
    armed_perks = _arm_user_perks(user_id, match_id)
    if armed_perks:
        new_members = []
        for m in room.get('members', []):
            if m.get('userId') == user_id:
                existing = set(m.get('armedPerks') or [])
                existing.update(armed_perks)
                new_members.append({**m, 'armedPerks': sorted(existing)})
            else:
                new_members.append(m)
        room['members'] = new_members

    members = room.get('members', [])
    # Persist any armedPerks we just stamped above — written below in
    # the same update so the draft transition is single-write.
    members_changed = bool(armed_perks)
    if len(ready) >= 2 and len(members) >= 2:
        # Both users ready — generate pairs and start the draft.
        pairs, auto_picks = _generate_draft_pairs(room['matchId'])
        # Auto-picks come from odd-numbered zones (e.g. 7 CBs → 3 pairs + 1
        # leftover). Distribute them ALTERNATELY between the two users so the
        # final squad sizes are balanced (equal if auto-picks count is even,
        # off-by-one if odd). Shuffle first so the per-zone bias (GK auto-pick
        # always going to the same user, etc.) doesn't materialise.
        host_id = room.get('hostUserId') or members[0]['userId']
        member_ids = [m['userId'] for m in members]
        ordered = sorted(member_ids, key=lambda mid: 0 if mid == host_id else 1)
        picks_per_user = {mid: [] for mid in member_ids}
        shuffled_auto = list(auto_picks)
        random.shuffle(shuffled_auto)
        for i, pid in enumerate(shuffled_auto):
            picks_per_user[ordered[i % len(ordered)]].append(pid)

        draft = {
            'status':            'active',
            'readyUserIds':      list(ready),
            'pairs':             pairs,
            'currentPairIndex':  0,
            'pendingChoices':    {},
            'picks':             picks_per_user,
            'totalPairs':        len(pairs),
            'tiebreakWinsByUser': {mid: 0 for mid in member_ids},
            'startedAt':         int(time.time() * 1000),
            # Per-pick timer: clients render a countdown from pairStartedAtMs,
            # and auto-pick a random card from the current pair when the
            # deadline passes. pickTimerMs lives on the draft state so we can
            # bump the value server-side without touching the FE. The stamp
            # is refreshed every time currentPairIndex advances (see the
            # resolve branch in submit_draft_pick).
            'pairStartedAtMs':   int(time.time() * 1000),
            'pickTimerMs':       15000,
        }
        if members_changed:
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='SET draft = :d, members = :m',
                ExpressionAttributeValues={':d': draft, ':m': members},
            )
        else:
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='SET draft = :d',
                ExpressionAttributeValues={':d': draft},
            )
        ws.push_to_channel(f"room#{room_code}", {
            'type':  'draft_started',
            'draft': _normalize_draft(draft),
        })
        return {'ok': True, 'status': 'active'}

    # Just one user ready — broadcast state so the other client updates UI.
    draft = {
        **draft,
        'status':       'waiting',
        'readyUserIds': list(ready),
    }
    if members_changed:
        rooms_table.update_item(
            Key={'roomCode': room_code},
            UpdateExpression='SET draft = :d, members = :m',
            ExpressionAttributeValues={':d': draft, ':m': members},
        )
    else:
        rooms_table.update_item(
            Key={'roomCode': room_code},
            UpdateExpression='SET draft = :d',
            ExpressionAttributeValues={':d': draft},
        )
    ws.push_to_channel(f"room#{room_code}", {
        'type':  'draft_state_update',
        'draft': _normalize_draft(draft),
    })
    return {'ok': True, 'status': 'waiting'}


def submit_draft_pick(room_code: str, user_id: str, pair_index: int, player_id: str) -> dict:
    """Record a user's pick for the current pair. When both users have submitted,
    resolve the pair (with random tiebreak on conflict) and advance.

    Concurrency note: two near-simultaneous submits from both users used to race
    on the read-modify-write — both Lambdas read an empty `pendingChoices`, both
    wrote their own pending, and the second write clobbered the first. Both
    users then froze "waiting for opponent" because one pending was lost.

    Fix: CAS retry loop with strongly-consistent reads. The conditional update
    rejects the write unless the draft's `pendingChoices` and `currentPairIndex`
    are still exactly what we read. On conflict, retry — the loser of the race
    now sees both pending choices on its next read and runs the resolve path.
    """
    pair = None         # captured in the loop for the broadcast below
    tiebreak = None
    resolved = None
    new_draft = None
    cur_idx = None
    is_last = False
    is_waiting = True

    for attempt in range(5):
        room = rooms_table.get_item(
            Key={'roomCode': room_code},
            ConsistentRead=True,
        ).get('Item')
        if not room:
            raise ValueError('Room not found')
        if not any(m['userId'] == user_id for m in room.get('members', [])):
            raise ValueError('You are not in this room')

        draft = room.get('draft') or {}
        if draft.get('status') != 'active':
            raise ValueError('Draft is not active')

        cur_idx = int(draft.get('currentPairIndex', 0))
        if int(pair_index) != cur_idx:
            # Benign two-user race: the opponent's pick + auto-advance
            # resolved this pair before our request landed. The next
            # room_update WS broadcast will sync this user's UI to the
            # new currentPairIndex. Return a soft acknowledgement with a
            # `stale` flag so the FE clears its optimistic `chosen` lock
            # — NOT an exception, which the FE would render as a red
            # error toast even though the user did nothing wrong.
            print(
                f"draft pick: stale pair {pair_index} (current {cur_idx}) "
                f"for user {user_id} in room {room_code} — acknowledging silently"
            )
            return {'ok': True, 'stale': True, 'currentPairIndex': cur_idx}

        pairs = draft.get('pairs') or []
        if cur_idx >= len(pairs):
            raise ValueError('No more pairs')
        pair = pairs[cur_idx]
        if player_id not in pair:
            raise ValueError('Player is not in the current pair')

        old_pending = dict(draft.get('pendingChoices') or {})
        if user_id in old_pending:
            # Disconnect-freeze design: no second-guessing once submitted.
            return {'ok': True, 'lockedTo': old_pending[user_id]}
        pending = dict(old_pending)
        pending[user_id] = player_id

        members = room.get('members', [])
        member_ids = [m['userId'] for m in members]
        other_ids = [uid for uid in member_ids if uid != user_id]

        # Compute the post-write draft state.
        if not other_ids or other_ids[0] not in pending:
            # Still waiting for the other user.
            new_draft = {**draft, 'pendingChoices': pending}
            tiebreak = None
            resolved = None
            is_last = False
            is_waiting = True
        else:
            # Both have picked — resolve.
            other_id = other_ids[0]
            my_pick = pending[user_id]
            other_pick = pending[other_id]

            tiebreak = None
            if my_pick == other_pick:
                host_id = room.get('hostUserId') or members[0]['userId']
                ordered = sorted(member_ids, key=lambda mid: 0 if mid == host_id else 1)
                ties_won = dict(draft.get('tiebreakWinsByUser') or {})
                wins_a = int(ties_won.get(ordered[0], 0))
                wins_b = int(ties_won.get(ordered[1], 0))
                forced = None
                if wins_a - wins_b >= 1:
                    winner_id = ordered[1]
                    forced = 'capped'
                elif wins_b - wins_a >= 1:
                    winner_id = ordered[0]
                    forced = 'capped'
                else:
                    winner_id = random.choice([ordered[0], ordered[1]])
                loser_id = ordered[1] if winner_id == ordered[0] else ordered[0]

                other_player = pair[0] if pair[1] == my_pick else pair[1]
                tiebreak = {
                    'winnerUserId':       winner_id,
                    'contestedPlayerId':  my_pick,
                    'capped':             forced == 'capped',
                }
                resolved = {winner_id: my_pick, loser_id: other_player}
                ties_won[winner_id] = int(ties_won.get(winner_id, 0)) + 1
                draft_with_ties = {**draft, 'tiebreakWinsByUser': ties_won}
            else:
                resolved = {user_id: my_pick, other_id: other_pick}
                draft_with_ties = draft

            picks_per_user = {uid: list(plist) for uid, plist in (draft_with_ties.get('picks') or {}).items()}
            for uid, pid in resolved.items():
                picks_per_user.setdefault(uid, []).append(pid)

            next_idx = cur_idx + 1
            is_last = next_idx >= len(pairs)
            new_status = 'complete' if is_last else 'active'

            new_draft = {
                **draft_with_ties,
                'currentPairIndex': next_idx,
                'pendingChoices':   {},
                'picks':            picks_per_user,
                'status':           new_status,
                # Reset the per-pick deadline so the NEXT pair's countdown
                # starts from "now" on every client. (No-op cosmetically
                # when this is the last pair — the FE doesn't render the
                # countdown after draft_complete.)
                'pairStartedAtMs':  int(time.time() * 1000),
                **({'completedAt': int(time.time() * 1000)} if is_last else {}),
            }
            is_waiting = False

        # Conditional write — only succeed if no one else has changed the draft
        # between our read and this write. `pendingChoices` and
        # `currentPairIndex` together are sufficient to detect any racing
        # update from the other user.
        try:
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='SET draft = :new_draft',
                ConditionExpression='draft.currentPairIndex = :expected_idx AND draft.pendingChoices = :expected_pending',
                ExpressionAttributeValues={
                    ':new_draft':        new_draft,
                    ':expected_idx':     cur_idx,
                    ':expected_pending': old_pending,
                },
            )
            break  # write landed cleanly
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                # Race lost — the other user's Lambda landed first. Sleep
                # briefly (jittered backoff) and retry; our next read will
                # see the updated state.
                time.sleep(0.04 * (attempt + 1) + random.random() * 0.02)
                continue
            raise
    else:
        # Exhausted retries — fail loud so the client can surface an error
        # rather than silently freeze.
        raise ValueError('Pick failed: too much contention, please try again')

    # Broadcast the resulting state. Both branches publish a state_update;
    # the resolve branch ALSO publishes pair_resolved (and draft_complete on
    # the final pair).
    if is_waiting:
        ws.push_to_channel(f"room#{room_code}", {
            'type':  'draft_state_update',
            'draft': _normalize_draft(new_draft),
        })
        return {'ok': True, 'waiting': True}

    ws.push_to_channel(f"room#{room_code}", {
        'type':      'draft_pair_resolved',
        'pairIndex': cur_idx,
        'pair':      pair,
        'resolved':  resolved,
        'tiebreak':  tiebreak,
        'draft':     _normalize_draft(new_draft),
    })
    if is_last:
        ws.push_to_channel(f"room#{room_code}", {
            'type':  'draft_complete',
            'draft': _normalize_draft(new_draft),
        })

    return {'ok': True, 'resolved': resolved, 'tiebreak': tiebreak}


# German-code → bucket mapping. Mirrors POS_TO_GROUP on the frontend
# (utils/formationPositions). Used by the free-hit swap to confirm the
# in-coming player is in the same bucket as the out-going one.
_POS_BUCKET = {
    'TW':  'GK',
    'IVL': 'DEF', 'IVR': 'DEF', 'IVZ': 'DEF', 'IV': 'DEF',
    'LV':  'DEF', 'RV':  'DEF',
    'DMZ': 'MID', 'DML': 'MID', 'DMR': 'MID', 'DLM': 'MID', 'DRM': 'MID',
    'ZO':  'MID', 'OLM': 'MID', 'ORM': 'MID',
    'LA':  'FWD', 'RA':  'FWD', 'STZ': 'FWD', 'STL': 'FWD', 'STR': 'FWD',
}


def free_hit_swap(room_code: str, user_id: str, out_player_id: str, in_player_id: str) -> dict:
    """Consume the 'free-hit' perk: replace out_player_id with
    in_player_id on the user's teamSelection, provided both are in
    the same position bucket and the incoming player isn't already
    drafted by another user.
    """
    room = rooms_table.get_item(Key={'roomCode': room_code}, ConsistentRead=True).get('Item')
    if not room:
        raise ValueError('Room not found')

    member = next((m for m in room.get('members', []) if m.get('userId') == user_id), None)
    if not member:
        raise ValueError('You are not in this room')
    if 'free-hit' not in (member.get('armedPerks') or []):
        raise ValueError('Free-hit perk not armed for this match')
    if member.get('usedFreeHit'):
        raise ValueError('Free-hit already used this match')

    selection = list(member.get('teamSelection') or [])
    if out_player_id not in selection:
        raise ValueError('The player you want to swap out is not in your squad')
    if in_player_id in selection:
        raise ValueError('Incoming player is already in your squad')

    # Other members' rosters can't contain the incoming player either.
    for m in room.get('members', []):
        if m.get('userId') == user_id:
            continue
        if in_player_id in (m.get('teamSelection') or []):
            raise ValueError('That player is already on another squad')

    # Look up both players + confirm same bucket.
    match_id = room.get('matchId') or ''
    keys = [
        {'matchId': match_id, 'playerId': out_player_id},
        {'matchId': match_id, 'playerId': in_player_id},
    ]
    resp = dynamodb.batch_get_item(
        RequestItems={os.environ['PLAYER_LOOKUP_TABLE']: {'Keys': keys}}
    )
    fetched = {p['playerId']: p for p in resp['Responses'].get(os.environ['PLAYER_LOOKUP_TABLE'], [])}
    out_player = fetched.get(out_player_id)
    in_player  = fetched.get(in_player_id)
    if not out_player or not in_player:
        raise ValueError('Player not found in this match')
    out_bucket = _POS_BUCKET.get(out_player.get('position'), 'MID')
    in_bucket  = _POS_BUCKET.get(in_player.get('position'),  'MID')
    if out_bucket != in_bucket:
        raise ValueError(f"Bucket mismatch — {out_bucket} cannot be swapped for {in_bucket}")

    # Apply the swap.
    new_selection = [in_player_id if pid == out_player_id else pid for pid in selection]
    new_details = []
    for d in (member.get('teamSelectionDetails') or []):
        if d.get('playerId') == out_player_id:
            new_details.append({
                'playerId':    in_player_id,
                'position':    in_player.get('position', ''),
                'teamRole':    in_player.get('teamRole', ''),
                'shirtNumber': in_player.get('shirtNumber', ''),
                'displayName': in_player.get('displayName', ''),
                'imageUrl':    in_player.get('imageUrl', ''),
            })
        else:
            new_details.append(d)

    new_members = []
    for m in room.get('members', []):
        if m.get('userId') == user_id:
            captain_now = member.get('captainPlayerId') or ''
            # If the captain was the swapped-out player, clear it — the
            # client will re-pick a captain on the new squad.
            new_captain = '' if captain_now == out_player_id else captain_now
            new_members.append({
                **m,
                'teamSelection':        new_selection,
                'teamSelectionDetails': new_details,
                'captainPlayerId':      new_captain,
                'usedFreeHit':          True,
            })
        else:
            new_members.append(m)

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :m',
        ExpressionAttributeValues={':m': new_members},
    )
    room['members'] = new_members
    _push_room_update(room)
    return {'ok': True, 'swapped': {'out': out_player_id, 'in': in_player_id}}


def reroll_draft_pair(room_code: str, user_id: str) -> dict:
    """Consume the 'pick-reroll' perk for this user, swap the current
    draft pair with a randomly-picked upcoming pair, clear any pending
    choices for the now-stale pair, and broadcast the new state.

    Validation:
      • User must be in the room.
      • Draft must be active.
      • User must have 'pick-reroll' in their member.armedPerks
        AND not have used it yet (member.usedDraftReroll falsy).
      • At least one upcoming pair must exist (otherwise nothing to
        swap with).
    """
    for attempt in range(5):
        room = rooms_table.get_item(
            Key={'roomCode': room_code},
            ConsistentRead=True,
        ).get('Item')
        if not room:
            raise ValueError('Room not found')

        member = next((m for m in room.get('members', []) if m.get('userId') == user_id), None)
        if not member:
            raise ValueError('You are not in this room')
        if 'pick-reroll' not in (member.get('armedPerks') or []):
            raise ValueError('Re-roll perk not armed for this match')
        if member.get('usedDraftReroll'):
            raise ValueError('Re-roll already used this match')

        draft = room.get('draft') or {}
        if draft.get('status') != 'active':
            raise ValueError('Draft is not active')

        cur_idx = int(draft.get('currentPairIndex', 0))
        pairs = list(draft.get('pairs') or [])
        upcoming = list(range(cur_idx + 1, len(pairs)))
        if not upcoming:
            raise ValueError('No upcoming pair to swap with')

        # Pick a random upcoming pair, swap it with the current one.
        # The "skipped" pair now sits at the chosen index — it'll come
        # back later. The fresh pair becomes the current one.
        swap_idx = random.choice(upcoming)
        pairs[cur_idx], pairs[swap_idx] = pairs[swap_idx], pairs[cur_idx]

        new_draft = {
            **draft,
            'pairs':          pairs,
            'pendingChoices': {},
        }
        new_members = []
        for m in room.get('members', []):
            if m.get('userId') == user_id:
                new_members.append({**m, 'usedDraftReroll': True})
            else:
                new_members.append(m)

        try:
            rooms_table.update_item(
                Key={'roomCode': room_code},
                UpdateExpression='SET draft = :d, members = :m',
                ConditionExpression='draft.currentPairIndex = :cur_idx AND draft.#status = :active',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':d':       new_draft,
                    ':m':       new_members,
                    ':cur_idx': cur_idx,
                    ':active':  'active',
                },
            )
            break
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                time.sleep(0.04 * (attempt + 1) + random.random() * 0.02)
                continue
            raise
    else:
        raise ValueError('Re-roll failed: too much contention')

    ws.push_to_channel(f"room#{room_code}", {
        'type':  'draft_state_update',
        'draft': _normalize_draft(new_draft),
    })
    return {'ok': True, 'currentPairIndex': cur_idx}


def select_team(room_code: str, user_id: str, player_ids: list) -> dict:
    if len(player_ids) != 11:
        raise ValueError('You must select exactly 11 players')
    if len(set(player_ids)) != 11:
        raise ValueError('Duplicate players are not allowed')

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    match_id = room['matchId']
    keys = [{'matchId': match_id, 'playerId': pid} for pid in player_ids]
    resp = dynamodb.batch_get_item(
        RequestItems={os.environ['PLAYER_LOOKUP_TABLE']: {'Keys': keys}}
    )
    fetched = {p['playerId']: p for p in resp['Responses'].get(os.environ['PLAYER_LOOKUP_TABLE'], [])}
    if len(fetched) != 11:
        raise ValueError('One or more player IDs are invalid for this match')

    selection_details = [
        {
            'playerId':    pid,
            'position':    fetched[pid].get('position', ''),
            'teamRole':    fetched[pid].get('teamRole', ''),
            'shirtNumber': fetched[pid].get('shirtNumber', ''),
            # Persist displayName so downstream scoring can name the owner
            # of a card / conceded penalty without a second DDB hop. Older
            # rooms without this field still work — callers default to a
            # generic "your keeper" label.
            'displayName': fetched[pid].get('displayName', ''),
            'imageUrl':    fetched[pid].get('imageUrl', ''),
        }
        for pid in player_ids
    ]

    # Snapshot any owned consumable perks at squad-lock time. Perks
    # are "armed" for this match — committed atomically so the user
    # can't double-spend (e.g. arm twice on two concurrent
    # team-selection calls). Marked as `consumedForMatch` on the
    # credits row so they can't be applied to a different match.
    armed_perks = _arm_user_perks(user_id, match_id)

    members = room.get('members', [])
    updated = False
    for m in members:
        if m['userId'] == user_id:
            m['teamSelection'] = player_ids
            m['teamSelectionDetails'] = selection_details
            if armed_perks:
                # Merge with any perks already stamped at draft-ready
                # time (e.g. pick-reroll). The new perks list is the
                # union so nothing armed earlier gets dropped.
                existing = set(m.get('armedPerks') or [])
                existing.update(armed_perks)
                m['armedPerks'] = sorted(existing)
            updated = True
            break
    if not updated:
        raise ValueError('You are not in this room')

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )
    room['members'] = members
    _push_room_update(room)
    return {'ok': True, 'playerCount': 11, 'armedPerks': armed_perks}


# ── Match-perk consumption helpers ───────────────────────────────────

# Subset of breznCatalog item ids that are consumable match perks.
# Mirrored here so we can keep this Lambda's deps small (we don't
# want to bundle the whole catalog) — keep in sync with
# backend/shared/breznCatalog.py.
_CONSUMABLE_PERK_IDS = {
    'captain-triple',
    'pick-reroll',
    'free-hit',
}


def _arm_user_perks(user_id: str, match_id: str) -> list:
    """Read the user's inventory; for each owned consumable perk, mark
    it `consumedForMatch = match_id` via a conditional UpdateItem.
    Idempotent for the SAME match (called from both mark_draft_ready and
    select_team; the second call sees already-armed entries and includes
    them in the result without rewriting).

    Returns: list of perk ids armed for THIS match.

    Never raises — armed perks are additive (no perk = baseline gameplay).
    """
    if not user_id or not match_id or _credits is None:
        return []

    try:
        item = _credits._table.get_item(
            Key={'userId': user_id},
            ConsistentRead=True,
        ).get('Item') or {}
    except Exception as e:
        print(f"[perks] inventory read failed for {user_id}: {e}")
        return []

    inventory = item.get('inventory') or {}
    armed = []
    for item_id in _CONSUMABLE_PERK_IDS:
        entry = inventory.get(item_id)
        if not entry:
            continue
        consumed = entry.get('consumedForMatch')
        if consumed == match_id:
            # Already armed for THIS match — return it but skip the write.
            armed.append(item_id)
            continue
        if consumed:
            # Bound to a DIFFERENT match — skip entirely.
            continue
        try:
            _credits._table.update_item(
                Key={'userId': user_id},
                UpdateExpression='SET inventory.#item.consumedForMatch = :match',
                ConditionExpression='attribute_exists(inventory.#item) AND (attribute_not_exists(inventory.#item.consumedForMatch) OR inventory.#item.consumedForMatch = :empty)',
                ExpressionAttributeNames={'#item': item_id},
                ExpressionAttributeValues={':match': match_id, ':empty': ''},
            )
            armed.append(item_id)
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                continue
            print(f"[perks] arm failed for {user_id}/{item_id}: {e}")
        except Exception as e:
            print(f"[perks] arm unexpected error for {user_id}/{item_id}: {e}")
    return armed


def start_match_for_room(room_code: str, user_id: str, speed_multiplier: float = 5.0) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if room.get('hostUserId') != user_id:
        raise ValueError('Only the host can start the match')
    members = room.get('members', [])
    if len(members) < 1:  # DEV: solo testing allowed; restore to < 2 for production
        raise ValueError('At least 1 player is required to start the match')

    match_id = room['matchId']
    payload = json.dumps({
        'pathParameters': {'matchId': match_id},
        'body': json.dumps({'speedMultiplier': speed_multiplier}),
    })
    response = lambda_client.invoke(
        FunctionName=os.environ['REPLAY_EMITTER_FUNCTION'],
        InvocationType='RequestResponse',
        Payload=payload,
    )
    result = json.loads(response['Payload'].read())
    if result.get('statusCode', 200) >= 400:
        body = json.loads(result.get('body', '{}'))
        raise ValueError(body.get('error', 'Failed to start match'))
    # Push to the room's WS channel so every member navigates to /match in
    # lockstep with the host — no waiting on the next match-status poll.
    # Scoped: only subscribers of `room#<code>` receive the push.
    ws.push_to_channel(f"room#{room_code}", {
        'type':    'match_started',
        'matchId': match_id,
    })
    return {'ok': True, 'matchId': match_id}


def _push_room_update(room: dict) -> None:
    ws.push_to_channel(f"room#{room['roomCode']}", {
        'type': 'room_update',
        'room': room,
    })
