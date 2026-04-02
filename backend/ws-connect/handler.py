import json
import boto3
import os
import time
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
rooms_table = dynamodb.Table(os.environ['ROOMS_TABLE'])

def handler(event, context):
    connection_id = event['requestContext']['connectionId']
    query_params = event.get('queryStringParameters') or {}

    room_code = query_params.get('roomCode')
    user_id = query_params.get('userId')
    match_id = query_params.get('matchId')
    display_name = query_params.get('displayName', 'Anonymous')

    if not room_code or not user_id or not match_id:
        print(f"Missing params: roomCode={room_code} userId={user_id} matchId={match_id}")
        return {'statusCode': 400}

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        print(f"Room not found: {room_code}")
        return {'statusCode': 404}

    connections_table.put_item(Item={
        'connectionId': connection_id,
        'userId': user_id,
        'roomCode': room_code,
        'matchId': match_id,
        'displayName': display_name,
        'connectedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'TTL': int(time.time()) + 7200
    })

    print(f"Connection stored: {connection_id} for user {user_id} in room {room_code}")

    _broadcast_members(room_code, connection_id)

    return {'statusCode': 200}


def _broadcast_members(room_code, new_connection_id):
    try:
        response = connections_table.query(
            IndexName='roomCode-index',
            KeyConditionExpression=Key('roomCode').eq(room_code)
        )
        connections = response.get('Items', [])

        members = [
            {
                'userId': c['userId'],
                'displayName': c['displayName'],
                'connectionId': c['connectionId']
            }
            for c in connections
        ]

        message = json.dumps({
            'type': 'members_update',
            'members': members
        })

        apigw = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=os.environ['WEBSOCKET_ENDPOINT']
        )

        dead_connections = []

        for conn in connections:
            try:
                apigw.post_to_connection(
                    ConnectionId=conn['connectionId'],
                    Data=message
                )
            except apigw.exceptions.GoneException:
                dead_connections.append(conn['connectionId'])
            except Exception as e:
                print(f"Error posting to {conn['connectionId']}: {str(e)}")

        for conn_id in dead_connections:
            connections_table.delete_item(Key={'connectionId': conn_id})
            print(f"Cleaned up dead connection: {conn_id}")

    except Exception as e:
        print(f"Error broadcasting members: {str(e)}")