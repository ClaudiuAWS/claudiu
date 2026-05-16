"""
Friends Lambda — mutual friend requests + room invites.

DDB schema (claudiu-friends):
    PK userId, SK friendId, attrs: status, email, displayName, avatarUrl

Each relationship is stored as TWO mirrored items so both users can list
their own view with a single query:

    add A -> B   writes (A, B, "outgoing") and (B, A, "incoming")
    B accepts   updates both to "accepted"
    either removes/declines  deletes both

Room invites (POST /friends/{friendId}/invite):
    Verifies A and B are accepted friends and the inviter is in the room,
    then pushes a `room_invite` WS message to channel `user#{friendId}`.
    No DDB writes — invites are pure pub/sub. The invitee's frontend joins
    the room via the existing `POST /rooms/{code}/join` flow.
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

import ws

dynamodb = boto3.resource("dynamodb")
cognito = boto3.client("cognito-idp")

TABLE = dynamodb.Table(os.environ["FRIENDS_TABLE"])
ROOMS_TABLE = dynamodb.Table(os.environ["ROOMS_TABLE"])
USER_POOL_ID = os.environ["USER_POOL_ID"]

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

STATUS_ACCEPTED = "accepted"
STATUS_OUTGOING = "outgoing"   # I sent the request
STATUS_INCOMING = "incoming"   # I received the request


# ---------- helpers ----------

def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body)}


def cognito_user_by_email(email):
    """Return {userId, email, displayName, avatarUrl} or None."""
    try:
        result = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1,
        )
    except ClientError:
        return None

    users = result.get("Users", [])
    if not users:
        return None

    attrs = {a["Name"]: a["Value"] for a in users[0]["Attributes"]}
    return {
        "userId": attrs.get("sub"),
        "email": attrs.get("email"),
        "displayName": attrs.get("name") or attrs.get("email"),
        "avatarUrl": attrs.get("custom:avatar_url"),
    }


def cognito_user_by_sub(sub):
    """Return {userId, email, displayName, avatarUrl} or None."""
    try:
        result = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'sub = "{sub}"',
            Limit=1,
        )
    except ClientError:
        return None

    users = result.get("Users", [])
    if not users:
        return None

    attrs = {a["Name"]: a["Value"] for a in users[0]["Attributes"]}
    return {
        "userId": attrs.get("sub"),
        "email": attrs.get("email"),
        "displayName": attrs.get("name") or attrs.get("email"),
        "avatarUrl": attrs.get("custom:avatar_url"),
    }


def make_item(user_id, friend, status):
    return {
        "userId": user_id,
        "friendId": friend["userId"],
        "status": status,
        "email": friend["email"],
        "displayName": friend["displayName"],
        "avatarUrl": friend.get("avatarUrl"),
    }


def to_friend_dto(item):
    return {
        "friendId": item["friendId"],
        "email": item.get("email"),
        "displayName": item.get("displayName"),
        "avatarUrl": item.get("avatarUrl"),
        "status": item.get("status"),
    }


# ---------- routes ----------

def list_friends(user_id):
    result = TABLE.query(KeyConditionExpression=Key("userId").eq(user_id))
    buckets = {STATUS_ACCEPTED: [], STATUS_INCOMING: [], STATUS_OUTGOING: []}
    for item in result.get("Items", []):
        status = item.get("status")
        if status in buckets:
            buckets[status].append(to_friend_dto(item))
    return resp(200, {
        "accepted": buckets[STATUS_ACCEPTED],
        "incoming": buckets[STATUS_INCOMING],
        "outgoing": buckets[STATUS_OUTGOING],
    })


def add_friend(user_id, email_raw):
    email = (email_raw or "").strip().lower()
    if not email:
        return resp(400, {"error": "email required"})

    target = cognito_user_by_email(email)
    if not target:
        return resp(404, {"error": "No user found with that email"})
    if target["userId"] == user_id:
        return resp(400, {"error": "You can't add yourself"})

    existing = TABLE.get_item(Key={"userId": user_id, "friendId": target["userId"]})
    if "Item" in existing:
        status = existing["Item"].get("status")
        if status == STATUS_ACCEPTED:
            return resp(409, {"error": "Already friends"})
        if status == STATUS_OUTGOING:
            return resp(409, {"error": "Request already sent"})
        if status == STATUS_INCOMING:
            return resp(409, {"error": "This user already sent you a request — accept it instead"})

    me = cognito_user_by_sub(user_id)
    if not me:
        return resp(500, {"error": "Could not load your profile"})

    TABLE.put_item(Item=make_item(user_id, target, STATUS_OUTGOING))
    TABLE.put_item(Item=make_item(target["userId"], me, STATUS_INCOMING))

    return resp(201, {"friend": to_friend_dto(make_item(user_id, target, STATUS_OUTGOING))})


def accept_friend(user_id, friend_id):
    incoming = TABLE.get_item(Key={"userId": user_id, "friendId": friend_id}).get("Item")
    if not incoming or incoming.get("status") != STATUS_INCOMING:
        return resp(404, {"error": "No pending request from that user"})

    TABLE.update_item(
        Key={"userId": user_id, "friendId": friend_id},
        UpdateExpression="SET #s = :s",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": STATUS_ACCEPTED},
    )
    TABLE.update_item(
        Key={"userId": friend_id, "friendId": user_id},
        UpdateExpression="SET #s = :s",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": STATUS_ACCEPTED},
    )

    updated = TABLE.get_item(Key={"userId": user_id, "friendId": friend_id})["Item"]
    return resp(200, {"friend": to_friend_dto(updated)})


def remove_friend(user_id, friend_id):
    """Removes a friend in any state (accepted, incoming, outgoing)."""
    TABLE.delete_item(Key={"userId": user_id, "friendId": friend_id})
    TABLE.delete_item(Key={"userId": friend_id, "friendId": user_id})
    return resp(200, {"ok": True})


def accept_invite(user_id, inviter_user_id):
    """Auto-friend via a shared invite link.

    Skips the request/accept dance entirely — when a user opens
    `/invite/<inviterUserId>` we trust the URL token (it's just their
    Cognito sub; not secret in a meaningful way), look the inviter up
    in Cognito, and write both rows as `accepted` straight away.

    If a row already exists in any state (outgoing/incoming/accepted),
    upgrade it to accepted. Idempotent — opening the same link twice is
    a no-op the second time.
    """
    if not inviter_user_id:
        return resp(400, {"error": "inviterUserId required"})
    if inviter_user_id == user_id:
        return resp(400, {"error": "You can't invite yourself"})

    inviter = cognito_user_by_sub(inviter_user_id)
    if not inviter:
        return resp(404, {"error": "Invite link is invalid"})

    me = cognito_user_by_sub(user_id)
    if not me:
        return resp(500, {"error": "Could not load your profile"})

    # Bidirectional put — overwrites whatever state was there before.
    TABLE.put_item(Item=make_item(user_id,     inviter, STATUS_ACCEPTED))
    TABLE.put_item(Item=make_item(inviter_user_id, me,  STATUS_ACCEPTED))

    return resp(200, {"friend": to_friend_dto(make_item(user_id, inviter, STATUS_ACCEPTED))})


def invite_to_room(user_id, friend_id, room_code):
    """Invite an accepted friend to a room.

    Pure pub/sub — no DDB writes for the invite itself. The invitee receives
    a WS `room_invite` on channel `user#{friend_id}` and accepts via the
    existing `POST /rooms/{code}/join` flow.
    """
    if not room_code:
        return resp(400, {"error": "roomCode required"})

    # Must be accepted friends
    friendship = TABLE.get_item(Key={"userId": user_id, "friendId": friend_id}).get("Item")
    if not friendship or friendship.get("status") != STATUS_ACCEPTED:
        return resp(403, {"error": "You are not friends with this user"})

    # Inviter must be in the room
    room = ROOMS_TABLE.get_item(Key={"roomCode": room_code}).get("Item")
    if not room:
        return resp(404, {"error": "Room not found"})
    if not any(m.get("userId") == user_id for m in room.get("members", [])):
        return resp(403, {"error": "You are not in this room"})

    # Don't re-invite someone already in the room
    if any(m.get("userId") == friend_id for m in room.get("members", [])):
        return resp(409, {"error": "They are already in this party"})

    inviter = cognito_user_by_sub(user_id)
    if not inviter:
        return resp(500, {"error": "Could not load your profile"})

    ws.push_to_channel(f"user#{friend_id}", {
        "type":     "room_invite",
        "roomCode": room_code,
        "matchId":  room.get("matchId"),
        "inviter": {
            "userId":      inviter["userId"],
            "displayName": inviter["displayName"],
            "avatarUrl":   inviter.get("avatarUrl"),
        },
    })
    return resp(200, {"ok": True})


# ---------- entrypoint ----------

def handler(event, context):
    method = event["httpMethod"]
    path = event["path"]
    user_id = event["requestContext"]["authorizer"]["claims"]["sub"]

    if method == "GET" and path.endswith("/friends"):
        return list_friends(user_id)

    if method == "POST" and path.endswith("/friends"):
        body = json.loads(event.get("body") or "{}")
        return add_friend(user_id, body.get("email"))

    if method == "POST" and path.endswith("/accept-invite"):
        # /friends/accept-invite — auto-friend via shared link
        body = json.loads(event.get("body") or "{}")
        return accept_invite(user_id, body.get("inviterUserId"))

    if method == "POST" and path.endswith("/accept"):
        # /friends/{friendId}/accept
        friend_id = path.split("/friends/")[-1].split("/")[0]
        return accept_friend(user_id, friend_id)

    if method == "POST" and path.endswith("/invite"):
        # /friends/{friendId}/invite
        friend_id = path.split("/friends/")[-1].split("/")[0]
        body = json.loads(event.get("body") or "{}")
        return invite_to_room(user_id, friend_id, body.get("roomCode"))

    if method == "DELETE" and "/friends/" in path:
        friend_id = path.split("/friends/")[-1]
        return remove_friend(user_id, friend_id)

    return resp(404, {"error": "not found"})
