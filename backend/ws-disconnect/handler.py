import json
import boto3
import os
import time

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

def handler(event, context):
    connection_id = event['requestContext']['connectionId']
    
    try:
        connections_table.delete_item(
            Key={'connectionId': connection_id}
        )
    except Exception as e:
        print(f"Error deleting connection {connection_id}: {str(e)}")
    
    return {'statusCode': 200}