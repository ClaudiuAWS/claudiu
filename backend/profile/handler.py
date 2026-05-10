import json
import os
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
cognito = boto3.client("cognito-idp")
# hello world
BUCKET = os.environ["PROFILE_PICTURES_BUCKET"]
USER_POOL_ID = os.environ["USER_POOL_ID"]

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body)}


def handler(event, context):
    method = event["httpMethod"]
    path = event["path"]
    claims = event["requestContext"]["authorizer"]["claims"]
    user_id = claims["sub"]

    # POST /profile/avatar-upload-url
    if method == "POST" and path.endswith("/avatar-upload-url"):
        body = json.loads(event.get("body") or "{}")
        content_type = body.get("contentType", "image/jpeg")
        if content_type not in ("image/jpeg", "image/png", "image/webp"):
            return resp(400, {"error": "unsupported content type"})

        key = f"avatars/{user_id}"
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
            ExpiresIn=300,
        )
        public_url = f"https://{BUCKET}.s3.eu-central-1.amazonaws.com/{key}"
        return resp(200, {"uploadUrl": url, "avatarUrl": public_url})

    # PUT /profile  — save avatarUrl to Cognito custom attribute
    if method == "PUT" and path.endswith("/profile"):
        body = json.loads(event.get("body") or "{}")
        avatar_url = body.get("avatarUrl", "").strip()
        if not avatar_url:
            return resp(400, {"error": "avatarUrl required"})

        try:
            cognito.admin_update_user_attributes(
                UserPoolId=USER_POOL_ID,
                Username=claims["email"],
                UserAttributes=[{"Name": "custom:avatar_url", "Value": avatar_url}],
            )
        except ClientError as e:
            return resp(500, {"error": str(e)})

        return resp(200, {"avatarUrl": avatar_url})

    return resp(404, {"error": "not found"})
