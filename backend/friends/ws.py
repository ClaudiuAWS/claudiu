import boto3
import json
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

_apigw_client = None


def _get_apigw():
    global _apigw_client
    if _apigw_client is None:
        _apigw_client = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=os.environ['WEBSOCKET_ENDPOINT'],
        )
    return _apigw_client


def push_to_channel(channel: str, payload: dict) -> None:
    """Push a JSON payload to every connection subscribed to `channel`."""
    response = connections_table.query(
        IndexName='channel-index',
        KeyConditionExpression=Key('channel').eq(channel),
    )

    message = json.dumps(payload, default=str).encode()
    apigw = _get_apigw()
    stale = []

    for item in response.get('Items', []):
        connection_id = item['connectionId']
        try:
            apigw.post_to_connection(ConnectionId=connection_id, Data=message)
        except apigw.exceptions.GoneException:
            # Connection no longer exists — clean it up
            stale.append(connection_id)

    for connection_id in stale:
        connections_table.delete_item(Key={'connectionId': connection_id})

    if stale:
        print(f"Cleaned up {len(stale)} stale connections on channel {channel}")
