import json
import os
import time
import boto3

logs = boto3.client('logs')
LOG_GROUP = os.environ['LOG_GROUP']


def handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')
        entries = body.get('logs', [])

        if not entries:
            return _response(400, {'error': 'No logs provided'})

        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']

        stream_name = f"browser-{user_id}"
        _ensure_stream(stream_name)

        log_events = sorted(
            [{'timestamp': int(e.get('timestamp', time.time() * 1000)), 'message': json.dumps({**e, 'userId': user_id})} for e in entries],
            key=lambda x: x['timestamp']
        )

        logs.put_log_events(logGroupName=LOG_GROUP, logStreamName=stream_name, logEvents=log_events)

        return _response(200, {'flushed': len(log_events)})

    except Exception as e:
        print(f"Logger error: {e}")
        return _response(500, {'error': 'Failed to write logs'})


def _ensure_stream(stream_name):
    try:
        logs.create_log_stream(logGroupName=LOG_GROUP, logStreamName=stream_name)
    except logs.exceptions.ResourceAlreadyExistsException:
        pass


def _response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        'body': json.dumps(body)
    }
