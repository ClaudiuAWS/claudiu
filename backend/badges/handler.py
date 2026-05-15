"""
Badges Lambda — read-only API.

Routes:
    GET  /badges            — list current user's earned badges
    GET  /badges/catalog    — full catalog (so the FE has one source of truth)

Awarding NEVER happens here. The only writer is `backend/shared/badges.py`,
imported by the Lambdas that observe the relevant signals (event-processor,
etc.). Keeping the read path dumb means the FE can never accidentally
self-award — every badge is server-derived from real match events.
"""

import json
import service

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}


def _resp(status: int, body) -> dict:
    return {
        'statusCode': status,
        'headers':    {**CORS, 'Content-Type': 'application/json'},
        'body':       json.dumps(body, default=str),
    }


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '')

    if method == 'OPTIONS':
        return _resp(200, {})

    # Catalog is public-ish but we still serve it through the same auth
    # gate as everything else (API Gateway enforces Cognito) — no need
    # to special-case it here.
    try:
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']
    except (KeyError, TypeError):
        return _resp(401, {'error': 'unauthorized'})

    try:
        if method == 'GET' and path.endswith('/badges/catalog'):
            return _resp(200, {'catalog': service.get_catalog()})

        if method == 'GET' and path.endswith('/badges'):
            return _resp(200, {'badges': service.list_user_badges(user_id)})

        return _resp(404, {'error': 'not found'})

    except Exception as e:
        print(f"[badges-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
