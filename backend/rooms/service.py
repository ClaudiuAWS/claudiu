import boto3
import os
import time
import random
import string
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource('dynamodb')
rooms_table = dynamodb.Table(os.environ['ROOMS_TABLE'])
matches_table = dynamodb.Table(os.environ['MATCHES_TABLE'])


def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _get_user_current_room(user_id: str):
    """Check if user is already in a room."""
    response = rooms_table.scan(
        FilterExpression=Attr('members').contains({'userId': user_id})
    )
    rooms = response.get('Items', [])
    return rooms[0] if rooms else None


def create_room(match_id: str, user_id: str, display_name: str) -> dict:
    existing_room = _get_user_current_room(user_id)
    if existing_room:
        raise ValueError('You are already in a room. Leave it first.')
    
    match = matches_table.get_item(Key={'matchId': match_id}).get('Item')
    if not match:
        raise ValueError('Match not found')
    
    for _ in range(5):
        room_code = generate_room_code()
        if not rooms_table.get_item(Key={'roomCode': room_code}).get('Item'):
            break
    else:
        raise RuntimeError('Failed to generate unique room code')
    
    
    
    room = {
        'roomCode': room_code,
        'matchId': match_id,
        'hostUserId': user_id,
        'members': [{
            'userId': user_id,
            'displayName': display_name,
            'score': 0
        }],
        'status': 'waiting',
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'TTL': int(time.time()) + 86400
    }
    
    rooms_table.put_item(Item=room)
    return room


def join_room(room_code: str, user_id: str, display_name: str) -> dict:
    existing_room = _get_user_current_room(user_id)
    if existing_room and existing_room['roomCode'] != room_code:
        raise ValueError('You are already in another room. Leave it first.')
    
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    
    if room['status'] != 'waiting':
        raise ValueError('Room is no longer accepting players')
    
    members = room.get('members', [])
    if any(m['userId'] == user_id for m in members):
        return room
    
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
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    
    if room['hostUserId'] == user_id:
        rooms_table.delete_item(Key={'roomCode': room_code})
        return {'roomCode': room_code, 'deleted': True}
    
    members = [m for m in room.get('members', []) if m['userId'] != user_id]
    
    if not members:
        rooms_table.delete_item(Key={'roomCode': room_code})
        return {'roomCode': room_code, 'deleted': True}
    
    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )
    
    return {'roomCode': room_code, 'deleted': False}


def get_room(room_code: str) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    return room
