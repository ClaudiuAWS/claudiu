import boto3
import json
import os
import time
import random
import string
from boto3.dynamodb.conditions import Attr

import ws

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda', region_name='eu-central-1')
rooms_table = dynamodb.Table(os.environ['ROOMS_TABLE'])
matches_table = dynamodb.Table(os.environ['MATCHES_TABLE'])
player_lookup_table = dynamodb.Table(os.environ['PLAYER_LOOKUP_TABLE'])


def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _get_user_current_room(user_id: str):
    response = rooms_table.scan(
        FilterExpression=Attr('members').contains({'userId': user_id}) & Attr('status').ne('ended')
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
    _push_room_update(room)
    return room


def leave_room(room_code: str, user_id: str) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    if room['hostUserId'] == user_id:
        rooms_table.delete_item(Key={'roomCode': room_code})
        ws.push_to_channel(f"room#{room_code}", {'type': 'room_closed'})
        return {'roomCode': room_code, 'deleted': True}

    members = [m for m in room.get('members', []) if m['userId'] != user_id]

    if not members:
        rooms_table.delete_item(Key={'roomCode': room_code})
        ws.push_to_channel(f"room#{room_code}", {'type': 'room_closed'})
        return {'roomCode': room_code, 'deleted': True}

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )

    room['members'] = members
    _push_room_update(room)
    return {'roomCode': room_code, 'deleted': False}


def get_room(room_code: str) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    return room


def send_message(room_code: str, user_id: str, display_name: str, text: str) -> None:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if not any(m['userId'] == user_id for m in room.get('members', [])):
        raise ValueError('You are not in this room')

    ws.push_to_channel(f"room#{room_code}", {
        'type':        'chat_message',
        'userId':      user_id,
        'displayName': display_name,
        'text':        text,
        'ts':          int(time.time() * 1000),
    })


def select_team(room_code: str, user_id: str, player_ids: list) -> dict:
    if len(player_ids) != 11:
        raise ValueError('You must select exactly 11 players')
    if len(set(player_ids)) != 11:
        raise ValueError('Duplicate players are not allowed')

    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')

    match_id = room['matchId']
    keys = [{'matchId': match_id, 'playerId': pid} for pid in player_ids]
    resp = dynamodb.batch_get_item(
        RequestItems={os.environ['PLAYER_LOOKUP_TABLE']: {'Keys': keys}}
    )
    fetched = {p['playerId']: p for p in resp['Responses'].get(os.environ['PLAYER_LOOKUP_TABLE'], [])}
    if len(fetched) != 11:
        raise ValueError('One or more player IDs are invalid for this match')

    selection_details = [
        {
            'playerId':    pid,
            'position':    fetched[pid].get('position', ''),
            'teamRole':    fetched[pid].get('teamRole', ''),
            'shirtNumber': fetched[pid].get('shirtNumber', ''),
        }
        for pid in player_ids
    ]

    members = room.get('members', [])
    updated = False
    for m in members:
        if m['userId'] == user_id:
            m['teamSelection'] = player_ids
            m['teamSelectionDetails'] = selection_details
            updated = True
            break
    if not updated:
        raise ValueError('You are not in this room')

    rooms_table.update_item(
        Key={'roomCode': room_code},
        UpdateExpression='SET members = :members',
        ExpressionAttributeValues={':members': members}
    )
    room['members'] = members
    _push_room_update(room)
    return {'ok': True, 'playerCount': 11}


def start_match_for_room(room_code: str, user_id: str, speed_multiplier: float = 5.0) -> dict:
    room = rooms_table.get_item(Key={'roomCode': room_code}).get('Item')
    if not room:
        raise ValueError('Room not found')
    if room.get('hostUserId') != user_id:
        raise ValueError('Only the host can start the match')
    members = room.get('members', [])
    if len(members) < 1:  # DEV: solo testing allowed; restore to < 2 for production
        raise ValueError('At least 1 player is required to start the match')

    match_id = room['matchId']
    payload = json.dumps({
        'pathParameters': {'matchId': match_id},
        'body': json.dumps({'speedMultiplier': speed_multiplier}),
    })
    response = lambda_client.invoke(
        FunctionName=os.environ['REPLAY_EMITTER_FUNCTION'],
        InvocationType='RequestResponse',
        Payload=payload,
    )
    result = json.loads(response['Payload'].read())
    if result.get('statusCode', 200) >= 400:
        body = json.loads(result.get('body', '{}'))
        raise ValueError(body.get('error', 'Failed to start match'))
    return {'ok': True, 'matchId': match_id}


def _push_room_update(room: dict) -> None:
    ws.push_to_channel(f"room#{room['roomCode']}", {
        'type': 'room_update',
        'room': room,
    })
