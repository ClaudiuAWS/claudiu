import boto3
import json
import os
import time
import random
import string
from boto3.dynamodb.conditions import Attr, Key

import ws

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


def create_room(match_id: str, user_id: str, display_name: str) -> dict:
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
            'score': 0
        }],
        'status': 'waiting',
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'TTL': int(time.time()) + 86400
    }

    rooms_table.put_item(Item=room)
    return room


def join_room(room_code: str, user_id: str, display_name: str) -> dict:
    existing_room = _get_user_current_room(user_id)
    if existing_room and existing_room['roomCode'] != room_code:
        raise ValueError('You are already in another room. Leave it first.')

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    if room['status'] != 'waiting':
        raise ValueError('Room is no longer accepting players')

    members = room.get('members', [])
    if any(m['userId'] == user_id for m in members):
        return room

    members.append({
        'userId': user_id,
        'displayName': display_name,
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
                'userId':      submitter_user_id,
                'displayName': m.get('displayName'),
                'delta':       raw_delta,
                'newScore':    new_score,
                'eventType':   game_type or 'minigame',
                'reason':      submitter_delta.get('reason') or game_type,
                # Lets the frontend score_update handler suppress its toast
                # for mini-game deltas — the modal's result panel already
                # surfaces these.
                'source':      'minigame',
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

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :m ADD reactionsClaimed :v',
        ExpressionAttributeValues={
            ':m': members,
            ':v': {claim_key},
        },
    )

    label = 'nutmeg' if reaction_type == 'nutmeg' else 'spectacular play'
    score_changes = [{
        'userId':     user_id,
        'delta':      REACTION_BONUS,
        'newScore':   new_score,
        'eventType':  reaction_type or 'reaction',
        'reason':     f'reacted to {label}',
        'playerName': member.get('displayName') or '',
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

    members = room.get('members', [])
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
        }
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
    """
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    draft = room.get('draft') or {}
    if draft.get('status') != 'active':
        raise ValueError('Draft is not active')

    cur_idx = int(draft.get('currentPairIndex', 0))
    if int(pair_index) != cur_idx:
        raise ValueError('Pick is for a stale pair')

    pairs = draft.get('pairs') or []
    if cur_idx >= len(pairs):
        raise ValueError('No more pairs')
    pair = pairs[cur_idx]
    if player_id not in pair:
        raise ValueError('Player is not in the current pair')

    pending = dict(draft.get('pendingChoices') or {})
    if user_id in pending:
        # User already submitted — re-lock to their original choice (per the
        # disconnect-freeze design: no second-guessing once submitted).
        return {'ok': True, 'lockedTo': pending[user_id]}
    pending[user_id] = player_id

    # Identify both members.
    members = room.get('members', [])
    member_ids = [m['userId'] for m in members]
    other_ids = [uid for uid in member_ids if uid != user_id]

    # If we still need the other user's pick, just save state and broadcast.
    if not other_ids or other_ids[0] not in pending:
        draft = {**draft, 'pendingChoices': pending}
        rooms_table.update_item(
            Key={'roomCode': room_code},
            UpdateExpression='SET draft = :d',
            ExpressionAttributeValues={':d': draft},
        )
        ws.push_to_channel(f"room#{room_code}", {
            'type':  'draft_state_update',
            'draft': _normalize_draft(draft),
        })
        return {'ok': True, 'waiting': True}

    # Both have picked — resolve.
    other_id = other_ids[0]
    my_pick = pending[user_id]
    other_pick = pending[other_id]

    tiebreak = None
    if my_pick == other_pick:
        # Conflict — capped random. The "winner" gets the picked player, the
        # "loser" gets the other one in the pair.
        #
        # User wants luck back (deterministic alternation killed the gamble),
        # but also wants to avoid the small-sample streaks that made the
        # tiebreak feel rigged. Solution: real coin flip every tiebreak,
        # except when one user is already 1 ahead — in that case force the
        # trailing user to win, keeping the gap in [0, 1] across the draft.
        host_id = room.get('hostUserId') or members[0]['userId']
        ordered = sorted(member_ids, key=lambda mid: 0 if mid == host_id else 1)
        ties_won = dict(draft.get('tiebreakWinsByUser') or {})
        wins_a = int(ties_won.get(ordered[0], 0))
        wins_b = int(ties_won.get(ordered[1], 0))
        forced = None
        if wins_a - wins_b >= 1:
            winner_id = ordered[1]    # trailing
            forced = 'capped'
        elif wins_b - wins_a >= 1:
            winner_id = ordered[0]    # trailing
            forced = 'capped'
        else:
            winner_id = random.choice([ordered[0], ordered[1]])
        loser_id = ordered[1] if winner_id == ordered[0] else ordered[0]

        other_player = pair[0] if pair[1] == my_pick else pair[1]
        winner_player = my_pick
        loser_player = other_player
        tiebreak = {
            'winnerUserId':       winner_id,
            'contestedPlayerId':  my_pick,
            'capped':             forced == 'capped',
        }
        resolved = {winner_id: winner_player, loser_id: loser_player}
        # Bump the winner's running total so the next tiebreak's cap check
        # sees the updated gap.
        ties_won[winner_id] = int(ties_won.get(winner_id, 0)) + 1
        draft = {**draft, 'tiebreakWinsByUser': ties_won}
    else:
        # Distinct picks — each gets what they chose.
        resolved = {user_id: my_pick, other_id: other_pick}

    picks_per_user = {uid: list(plist) for uid, plist in (draft.get('picks') or {}).items()}
    for uid, pid in resolved.items():
        picks_per_user.setdefault(uid, []).append(pid)

    next_idx = cur_idx + 1
    is_last = next_idx >= len(pairs)
    new_status = 'complete' if is_last else 'active'

    draft = {
        **draft,
        'currentPairIndex': next_idx,
        'pendingChoices':   {},
        'picks':            picks_per_user,
        'status':           new_status,
        **({'completedAt': int(time.time() * 1000)} if is_last else {}),
    }
    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET draft = :d',
        ExpressionAttributeValues={':d': draft},
    )

    ws.push_to_channel(f"room#{room_code}", {
        'type':           'draft_pair_resolved',
        'pairIndex':      cur_idx,
        'pair':           pair,
        'resolved':       resolved,
        'tiebreak':       tiebreak,
        'draft':          _normalize_draft(draft),
    })
    if is_last:
        ws.push_to_channel(f"room#{room_code}", {
            'type':  'draft_complete',
            'draft': _normalize_draft(draft),
        })

    return {'ok': True, 'resolved': resolved, 'tiebreak': tiebreak}


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
        }
        for pid in player_ids
    ]

    members = room.get('members', [])
    updated = False
    for m in members:
        if m['userId'] == user_id:
            m['teamSelection'] = player_ids
            m['teamSelectionDetails'] = selection_details
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
    return {'ok': True, 'playerCount': 11}


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
