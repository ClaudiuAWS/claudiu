"""
Friends Lambda — mutual friend requests.

DDB schema (claudiu-friends):
    PK userId, SK friendId, attrs: status, email, displayName, avatarUrl

Each relationship is stored as TWO mirrored items so both users can list
their own view with a single query:

    add A -> B   writes (A, B, "outgoing") and (B, A, "incoming")
    B accepts   updates both to "accepted"
    either removes/declines  deletes both
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
cognito = boto3.client("cognito-idp")

TABLE = dynamodb.Table(os.environ["FRIENDS_TABLE"])
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

    if method == "POST" and path.endswith("/accept"):
        # /friends/{friendId}/accept
        friend_id = path.split("/friends/")[-1].split("/")[0]
        return accept_friend(user_id, friend_id)

    if method == "DELETE" and "/friends/" in path:
        friend_id = path.split("/friends/")[-1]
        return remove_friend(user_id, friend_id)

    return resp(404, {"error": "not found"})
