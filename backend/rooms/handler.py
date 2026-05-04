import json
import service

def handler(event, context):
        method = event['httpMethod']
        path = event['path']

        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']
        display_name = claims.get('name', 'Anonymous')
        
        try:
            if method == 'POST' and path == '/rooms':
                return _create_room(event, user_id, display_name)
            
            elif method == 'GET' and '/rooms/' in path and '/join' not in path:
                return _get_room(event)
            
            elif method == 'POST' and '/join' in path:
                return _join_room(event, user_id, display_name)
            
            elif method == 'DELETE' and '/leave' in path:
                return _leave_room(event, user_id)

            elif method == 'POST' and '/message' in path:
                return _send_message(event, user_id, display_name)

            elif method == 'POST' and '/team' in path:
                return _select_team(event, user_id)

            elif method == 'POST' and '/start' in path:
                return _start_match(event, user_id)

            else:
                return _response(404, {'error': 'Not found'})
        
        except ValueError as e:
            return _response(400, {'error': str(e)})
        
        except Exception as e:
            print(f"Unexpected error: {str(e)}")
            return _response(500, {'error': 'Internal server error'})

def _create_room(event, user_id, display_name):
        body = json.loads(event.get('body') or '{}')
        match_id = body.get('matchId')
        
        if not match_id:
            return _response(400, {'error': 'matchId is required'})
        
        room = service.create_room(match_id, user_id, display_name)
        return _response(201, room)

def _get_room(event):
        room_code = event['pathParameters']['code']
        room = service.get_room(room_code)
        return _response(200, room)

def _join_room(event, user_id, display_name):
        room_code = event['pathParameters']['code']
        room = service.join_room(room_code, user_id, display_name)
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
        result = service.start_match_for_room(room_code, user_id)
        return _response(200, result)

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
