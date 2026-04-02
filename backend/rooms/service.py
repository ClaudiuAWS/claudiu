import boto3
import os
import time
import random
import string
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
rooms_table = dynamodb.Table(os.environ['ROOMS_TABLE'])

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def create_room(match_id: str, user_id: str, display_name: str) -> dict:
    # Generate unique room code
    for _ in range(5):
        room_code = generate_room_code()
        existing = rooms_table.get_item(
            Key={'roomCode': room_code}
        ).get('Item')
        if not existing:
            break
    
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    room = {
        'roomCode': room_code,
        'matchId': match_id,
        'hostUserId': user_id,
        'members': [
            {
                'userId': user_id,
                'displayName': display_name,
                'score': 0
            }
        ],
        'status': 'waiting',
        'createdAt': now,
        'TTL': int(time.time()) + 86400
    }
    
    rooms_table.put_item(Item=room)
    return room

def join_room(room_code: str, user_id: str, display_name: str) -> dict:
    room = rooms_table.get_item(
        Key={'roomCode': room_code}
    ).get('Item')
    
    if not room:
        raise ValueError('Room not found')
    
    if room['status'] != 'waiting':
        raise ValueError('Room is no longer accepting players')
    
    # Check if already a member
    members = room.get('members', [])
    for member in members:
        if member['userId'] == user_id:
            return room
    
    # Add member
    members.append({
        'userId': user_id,
        'displayName': display_name,
        'score': 0
    })
    
    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )
    
    room['members'] = members
    return room

def leave_room(room_code: str, user_id: str) -> dict:
    room = rooms_table.get_item(
        Key={'roomCode': room_code}
    ).get('Item')
    
    if not room:
        raise ValueError('Room not found')
    
    members = [m for m in room.get('members', []) if m['userId'] != user_id]
    
    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )
    
    return {'roomCode': room_code, 'members': members}

def get_room(room_code: str) -> dict:
    room = rooms_table.get_item(
        Key={'roomCode': room_code}
    ).get('Item')
    
    if not room:
        raise ValueError('Room not found')
    
    return room