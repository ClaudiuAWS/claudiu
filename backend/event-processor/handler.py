import json
from service import process_event


def handler(event, context):
    """
    Accepts either:
      • SQS FIFO trigger — `event['Records'][i]['body']` is the JSON payload.
      • Direct EventBridge Scheduler invocation — payload at the top level
        (legacy shape, kept for in-flight schedules created before SQS rollout).
    """
    print(f"EVENT: {json.dumps(event, default=str)}")

    try:
        if 'Records' in event:
            # SQS batch — FIFO guarantees in-group ordering.
            for record in event['Records']:
                body = json.loads(record['body'])
                _process_one(body)
        else:
            _process_one(event)
    except Exception as e:
        print(f"Error processing event: {str(e)}")
        raise


def _process_one(payload: dict) -> None:
    process_event(
        match_id   = payload['matchId'],
        run_id     = payload.get('runId'),
        event_id   = payload['eventId'],
        event_type = payload['eventType'],
        game_time  = payload.get('gameTime'),
        data       = payload.get('data', {}),
    )


def _response(status_code: int, body: dict) -> dict:
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, default=str),
    }