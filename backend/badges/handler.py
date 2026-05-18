"""
Badges Lambda — read API + the badge-buy purchase path.

Routes:
    GET  /badges            — list current user's earned badges
    GET  /badges/catalog    — full catalog (so the FE has one source of truth)
    POST /badges/buy        — claim a specific badge by paying its tier price
                              from the user's brezn balance. Atomic across
                              the badges + credits tables.

Match-event awarding still happens elsewhere (event-processor via
`backend/shared/badges.py`). This Lambda owns the EXPLICIT buy path —
the user has chosen to pay for a specific badge instead of grinding it.
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

        if method == 'POST' and path.endswith('/badges/buy'):
            try:
                body = json.loads(event.get('body') or '{}')
            except Exception:
                return _resp(400, {'error': 'invalid body'})
            badge_id = (body or {}).get('badgeId')
            if not badge_id or not isinstance(badge_id, str):
                return _resp(400, {'error': 'badgeId required'})
            status, body_resp = service.buy_badge(user_id, badge_id)
            return _resp(status, body_resp)

        if method == 'GET' and path.endswith('/badges'):
            return _resp(200, {'badges': service.list_user_badges(user_id)})

        return _resp(404, {'error': 'not found'})

    except Exception as e:
        print(f"[badges-handler] error on {method} {path}: {e}")
        return _resp(500, {'error': 'internal error'})
