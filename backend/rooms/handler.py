import json
import service

def handler(event, context):
        method = event['httpMethod']
        path = event['path']

        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']
        display_name = claims.get('name', 'Anonymous')
        # Cognito custom attribute set by the profile-page upload flow.
        # Empty string when the user hasn't picked a picture; persisted
        # on the member dict so room mates render the photo in the lobby
        # SQUAD panel and the leaderboard rows.
        avatar_url = claims.get('custom:avatar_url') or ''

        try:
            if method == 'POST' and path == '/rooms':
                return _create_room(event, user_id, display_name, avatar_url)

            elif method == 'GET' and '/rooms/' in path and '/join' not in path:
                return _get_room(event)

            elif method == 'POST' and '/join' in path:
                return _join_room(event, user_id, display_name, avatar_url)
            
            elif method == 'DELETE' and '/leave' in path:
                return _leave_room(event, user_id)

            elif method == 'POST' and '/message' in path:
                return _send_message(event, user_id, display_name)

            elif method == 'POST' and '/team' in path:
                return _select_team(event, user_id)

            elif method == 'POST' and '/start' in path:
                return _start_match(event, user_id)

            elif method == 'POST' and '/minigame-score' in path:
                return _post_minigame_score(event, user_id)

            elif method == 'POST' and '/draft-ready' in path:
                return _post_draft_ready(event, user_id)

            elif method == 'POST' and '/draft-pick' in path:
                return _post_draft_pick(event, user_id)

            elif method == 'POST' and '/draft-reroll' in path:
                return _post_draft_reroll(event, user_id)

            elif method == 'POST' and '/react' in path:
                return _post_reaction(event, user_id)

            elif method == 'POST' and '/cheer' in path:
                return _post_cheer(event, user_id, display_name, avatar_url)

            elif method == 'POST' and '/captain' in path:
                return _post_captain(event, user_id)

            else:
                return _response(404, {'error': 'Not found'})
        
        except ValueError as e:
            return _response(400, {'error': str(e)})
        
        except Exception as e:
            print(f"Unexpected error: {str(e)}")
            return _response(500, {'error': 'Internal server error'})

def _create_room(event, user_id, display_name, avatar_url=''):
        body = json.loads(event.get('body') or '{}')
        match_id = body.get('matchId')

        if not match_id:
            return _response(400, {'error': 'matchId is required'})

        room = service.create_room(match_id, user_id, display_name, avatar_url)
        return _response(201, room)

def _get_room(event):
        room_code = event['pathParameters']['code']
        room = service.get_room(room_code)
        return _response(200, room)

def _join_room(event, user_id, display_name, avatar_url=''):
        room_code = event['pathParameters']['code']
        room = service.join_room(room_code, user_id, display_name, avatar_url)
        return _response(200, room)

def _leave_room(event, user_id):
        room_code = event['pathParameters']['code']
        result = service.leave_room(room_code, user_id)
        return _response(200, result)

def _send_message(event, user_id, display_name):
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        text = (body.get('text') or '').strip()
        if not text:
            return _response(400, {'error': 'text is required'})
        if len(text) > 200:
            return _response(400, {'error': 'message too long'})
        service.send_message(room_code, user_id, display_name, text)
        return _response(200, {'ok': True})

def _select_team(event, user_id):
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        player_ids = body.get('playerIds', [])
        if not isinstance(player_ids, list):
            return _response(400, {'error': 'playerIds must be a list'})
        result = service.select_team(room_code, user_id, player_ids)
        return _response(200, result)

def _start_match(event, user_id):
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        # Optional speed multiplier from lobby UI; backend clamps to [1, 30].
        try:
            speed_multiplier = float(body.get('speedMultiplier', 5))
        except (TypeError, ValueError):
            speed_multiplier = 5.0
        speed_multiplier = max(1.0, min(30.0, speed_multiplier))
        result = service.start_match_for_room(room_code, user_id, speed_multiplier)
        return _response(200, result)


def _post_minigame_score(event, user_id):
        # Frontend resolves a mini-game locally (or via solo bot) and posts the
        # score deltas here so the leaderboard stays consistent across users.
        # Body shape: {gameId, gameType, deltas: [{userId, delta, reason}], result}
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        game_id   = body.get('gameId') or ''
        game_type = body.get('gameType') or ''
        deltas    = body.get('deltas') or []
        result    = body.get('result') or {}
        # `phase` controls penalty's two-phase resolution. 'announce' = pure
        # broadcast of the local pick (no score), 'final' = real deltas (default).
        phase     = body.get('phase') if body.get('phase') in ('announce', 'final') else 'final'
        if not isinstance(deltas, list):
            return _response(400, {'error': 'deltas must be a list'})
        # Validation: each delta has userId + integer delta + reason. Cap |delta|
        # to prevent client tampering from awarding huge point swings.
        clean = []
        for d in deltas:
            try:
                uid = str(d.get('userId') or '')
                amt = int(d.get('delta') or 0)
                rsn = str(d.get('reason') or game_type)[:80]
                if not uid:
                    continue
                amt = max(-200, min(200, amt))
                clean.append({'userId': uid, 'delta': amt, 'reason': rsn})
            except (TypeError, ValueError):
                continue
        out = service.apply_minigame_score(room_code, user_id, game_id, game_type, clean, result, phase=phase)
        return _response(200, out)

def _post_draft_ready(event, user_id):
        # Toggle the user into the draft 'ready' set. Once 2 users are ready,
        # backend generates pairs and broadcasts draft_started.
        room_code = event['pathParameters']['code']
        out = service.mark_draft_ready(room_code, user_id)
        return _response(200, out)


def _post_draft_pick(event, user_id):
        # Submit a pick for the current pair. Backend buffers until both users
        # have submitted, then resolves (with random tiebreak on conflict).
        # Body shape: {pairIndex: int, playerId: str}
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        try:
            pair_index = int(body.get('pairIndex'))
        except (TypeError, ValueError):
            return _response(400, {'error': 'pairIndex must be an integer'})
        player_id = body.get('playerId')
        if not player_id:
            return _response(400, {'error': 'playerId is required'})
        out = service.submit_draft_pick(room_code, user_id, pair_index, player_id)
        return _response(200, out)


def _post_draft_reroll(event, user_id):
        # Re-roll the current draft pair — replaces it with a randomly-
        # chosen upcoming pair. Consumes the 'pick-reroll' perk that
        # was armed at squad-lock time. One re-roll per match.
        room_code = event['pathParameters']['code']
        out = service.reroll_draft_pair(room_code, user_id)
        return _response(200, out)


def _post_captain(event, user_id):
        # Set the user's captain pick for this room. Pass empty string to clear.
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        player_id = (body.get('playerId') or '').strip()
        out = service.set_captain(room_code, user_id, player_id)
        return _response(200, out)


def _post_cheer(event, user_id, display_name, avatar_url):
        # Free-form floating emoji reaction. Separate from `/react` which
        # is the event-tied +2 scoring bonus. No DDB writes — pure WS pub/sub.
        # Allow-list of 6 emoji to keep the floater overlay focused and to
        # avoid abuse via arbitrary user-controlled strings broadcast to the
        # whole party.
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        emoji = (body.get('emoji') or '').strip()
        out = service.cheer(room_code, user_id, display_name, avatar_url, emoji)
        return _response(200, out)


def _post_reaction(event, user_id):
        # Awards a +2 bonus when the user taps the nutmeg/spectacular badge
        # within the 1.5s window. Idempotent per (eventId, userId).
        # Body shape: {eventId: str, reactionType: 'nutmeg' | 'spectacular_play'}
        room_code = event['pathParameters']['code']
        body = json.loads(event.get('body') or '{}')
        event_id = (body.get('eventId') or '').strip()
        reaction_type = (body.get('reactionType') or '').strip()
        if not event_id:
            return _response(400, {'error': 'eventId is required'})
        out = service.claim_reaction(room_code, user_id, event_id, reaction_type)
        return _response(200, out)


def _response(status_code: int, body: dict) -> dict:
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            },
            'body': json.dumps(body, default=str)
        }
    # sync
