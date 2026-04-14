import boto3
import os
import time

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

# Connections live for 6 hours; covers any realistic match duration.
# Stale connections (tab closed without clean disconnect) are cleaned up by TTL.
CONNECTION_TTL_SECONDS = 6 * 60 * 60


def handler(event, context):
    route = event['requestContext']['routeKey']
    connection_id = event['requestContext']['connectionId']

    if route == '$connect':
        return _on_connect(connection_id, event)

    if route == '$disconnect':
        return _on_disconnect(connection_id)

    # $default — we don't expect client-to-server messages, ignore
    return {'statusCode': 200}


def _on_connect(connection_id: str, event: dict) -> dict:
    # Channel is passed as a query string parameter on connect:
    # wss://...?channel=match%23DFL-MAT-111111
    # wss://...?channel=room%23ABC123
    params = event.get('queryStringParameters') or {}
    channel = params.get('channel')

    if not channel:
        return {'statusCode': 400}

    connections_table.put_item(Item={
        'connectionId': connection_id,
        'channel':      channel,
        'ttl':          int(time.time()) + CONNECTION_TTL_SECONDS,
    })

    return {'statusCode': 200}


def _on_disconnect(connection_id: str) -> dict:
    connections_table.delete_item(Key={'connectionId': connection_id})
    return {'statusCode': 200}
