import json
from service import process_event


def handler(event, context):
    print(f"EVENT: {json.dumps(event, default=str)}")

    try:
        process_event(
            match_id   = event['matchId'],
            event_id   = event['eventId'],
            event_type = event['eventType'],
            game_time  = event.get('gameTime'),
            data       = event.get('data', {}),
        )
    except Exception as e:
        print(f"Error processing event {event.get('eventId')}: {str(e)}")
        raise


def _response(status_code: int, body: dict) -> dict:
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, default=str),
    }