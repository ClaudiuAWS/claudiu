import json
import service


def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")

    method = event['httpMethod']
    path = event['path']
    params = event.get('pathParameters') or {}

    try:
        if method == 'GET' and path == '/matches':
            return _response(200, service.list_matches())

        elif method == 'GET' and 'players' in path:
            match_id = params['matchId']
            return _response(200, service.get_match_players(match_id))

        elif method == 'GET' and 'events' in path:
            match_id = params['matchId']
            return _response(200, service.get_match_events(match_id))

        elif method == 'GET' and 'matchId' in params:
            match_id = params['matchId']
            return _response(200, service.get_match(match_id))

        return _response(404, {'error': 'Not found'})

    except ValueError as e:
        return _response(404, {'error': str(e)})
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return _response(500, {'error': 'Internal server error'})


def _response(status_code: int, body) -> dict:
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        'body': json.dumps(body, default=str),
    }