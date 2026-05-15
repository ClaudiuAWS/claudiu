"""
Service layer for the badges read API.

Thin wrapper around `shared/badges.py` — the same module the writer
Lambdas use. The deploy workflow copies that file into this Lambda's zip
under the name `badges_shared.py` so we have one canonical catalog.
"""

import badges_shared


def get_catalog() -> list:
    return badges_shared.get_catalog()


def list_user_badges(user_id: str) -> list:
    return badges_shared.list_user_badges(user_id)
