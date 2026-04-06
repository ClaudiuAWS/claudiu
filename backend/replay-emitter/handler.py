import json
import traceback
from service import start_match


def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")

    try:
        match_id = event['pathParameters']['matchId']
        body = json.loads(event.get('body') or '{}')
        speed_multiplier = float(body.get('speedMultiplier', 30))

        result = start_match(match_id, speed_multiplier)
        return _response(200, result)

    except ValueError as e:
        return _response(400, {'error': str(e)})
    except Exception as e:
        print(traceback.format_exc())
        return _response(500, {
            'error': 'Internal server error',
            'detail': str(e),
        })


def _response(status_code: int, body: dict) -> dict:
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, default=str),
    }