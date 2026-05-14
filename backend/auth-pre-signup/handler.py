"""
PreSignUp Cognito trigger — clean up UNCONFIRMED dupes before a new signup.

When a user starts signup with email X, doesn't enter the verification
code, and abandons, Cognito leaves the record in `UserStatus: UNCONFIRMED`.
Without this trigger, X is effectively "reserved": re-signup with X fails
with `UsernameExistsException`, and sign-in fails because the user was
never confirmed.

This trigger fires before every `signUp`. If an UNCONFIRMED user with the
same username already exists, we delete it so `signUp` then proceeds with
whatever new password the user just typed. Confirmed users are left
untouched — the existing UsernameExistsException flow still surfaces
"this email already has an account, sign in" via the frontend.
"""

import os
import boto3
from botocore.exceptions import ClientError

USER_POOL_ID = os.environ["USER_POOL_ID"]
client = boto3.client("cognito-idp")


def handler(event, context):
    email = (event.get("userName") or "").strip()
    if not email:
        return event

    try:
        existing = client.admin_get_user(UserPoolId=USER_POOL_ID, Username=email)
        if existing.get("UserStatus") == "UNCONFIRMED":
            client.admin_delete_user(UserPoolId=USER_POOL_ID, Username=email)
    except client.exceptions.UserNotFoundException:
        pass  # first signup attempt — nothing to clean up
    except ClientError:
        # Defensive: never block sign-up because of a trigger error.
        # Worst case the user hits the original UsernameExistsException,
        # which is the pre-fix behaviour.
        pass

    return event
