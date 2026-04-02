import json
import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

def handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        conn = connections_table.get_item(
            Key={'connectionId': connection_id}
        ).get('Item')

        if conn:
            room_code = conn.get('roomCode')
            connections_table.delete_item(Key={'connectionId': connection_id})
            print(f"Connection deleted: {connection_id}")

            if room_code:
                _broadcast_members(room_code)
        else:
            print(f"Connection not found: {connection_id}")

    except Exception as e:
        print(f"Error handling disconnect: {str(e)}")

    return {'statusCode': 200}


def _broadcast_members(room_code):
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

    except Exception as e:
        print(f"Error broadcasting after disconnect: {str(e)}")