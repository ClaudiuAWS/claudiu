"""AI Match Director — REST entry point.

Receives a state snapshot from the host client (via API Gateway POST), passes
it to Bedrock Claude, and dispatches the AI's chosen action over the room
WebSocket channel. Failures degrade gracefully to {action: 'wait'} so the
match flow is never blocked — the frontend has its own rule-based fallback.
"""
import json

import service


def handler(event, _ctx):
        method = event.get('httpMethod')
        if method == 'OPTIONS':
                return _response(204, {})
        if method != 'POST':
                return _response(405, {'error': 'method not allowed'})

        path_params = event.get('pathParameters') or {}
        room_code = path_params.get('code')
        if not room_code:
                return _response(400, {'error': 'missing room code'})

        claims = (event.get('requestContext', {}).get('authorizer') or {}).get('claims') or {}
        user_id = claims.get('sub')

        body = json.loads(event.get('body') or '{}')
        # Mode multiplexer: this Lambda answers two kinds of requests on the
        # same /director-tick endpoint. The default tick is per-event match
        # commentary; mode='captain-suggestion' is a one-shot called from the
        # lobby's preview phase to recommend who should wear the armband.
        mode = body.get('mode') or 'tick'
        try:
                if mode == 'captain-suggestion':
                        decision = service.run_captain_suggestion(room_code, user_id, body)
                else:
                        decision = service.run_director_tick(room_code, user_id, body)
                return _response(200, {'decision': decision})
        except Exception as e:
                # Logged for debugging but never block the room — frontend has its own
                # rule-based fallback (Step 1).
                print(f"director tick failed for room {room_code} (mode={mode}): {e}")
                return _response(200, {'decision': {'action': 'wait', 'reason': 'director error'}})


def _response(status_code, body):
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            },
            'body': json.dumps(body, default=str),
        }
