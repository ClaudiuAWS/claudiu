"""
Brezn spend catalog — backend canonical prices.

The frontend has its own catalog at `frontend/src/utils/breznCatalog.js`
for UI rendering, but ALL purchase decisions are validated against THIS
file. The credits Lambda looks up cost + kind here before debiting, so a
client can't lie about a price to the API.

Item shape:
    id       (str) — stable identifier, matches the FE catalog
    cost     (int) — brezn debited at purchase time
    kind     (str) — 'cosmetic' (permanent), 'disc' (permanent unlock),
                     'consumable' (armed for next match, consumed on use)
    category (str) — informational, used for inventory grouping in UI
"""

CATALOG = {
    # ─── Cosmetics — permanent visual upgrades ────────────────────────────
    'name-red': {
        'id':       'name-red',
        'cost':     800,            # was 1000 — entry cosmetic
        'kind':     'cosmetic',
        'category': 'name-color',
    },
    'name-rainbow': {
        'id':       'name-rainbow',
        'cost':     2500,           # was 3000 — premium cosmetic
        'kind':     'cosmetic',
        'category': 'name-color',
    },
    'frame-gold': {
        'id':       'frame-gold',
        'cost':     1500,
        'kind':     'cosmetic',
        'category': 'avatar-frame',
    },
    'frame-pretzel': {
        'id':       'frame-pretzel',
        'cost':     2200,           # was 2000 — slightly more premium
        'kind':     'cosmetic',
        'category': 'avatar-frame',
    },
    'reaction-pack': {
        'id':       'reaction-pack',
        'cost':     800,            # was 200 — flipped to permanent; matches name-red tier
        'kind':     'cosmetic',
        'category': 'reactions',
    },

    # ─── Premium discs — alternative path to badge-locked tracks ──────────
    'disc-waka-waka': {
        'id':       'disc-waka-waka',
        'cost':     1500,
        'kind':     'disc',
        'category': 'disc',
        # The track id this unlocks (matches utils/tracks.js id).
        'trackId':  'shakira-waka-waka',
    },
    'disc-we-are-one': {
        'id':       'disc-we-are-one',
        'cost':     2000,
        'kind':     'disc',
        'category': 'disc',
        'trackId':  'pitbull-we-are-one',
    },
    'disc-walk': {
        'id':       'disc-walk',
        'cost':     1500,
        'kind':     'disc',
        'category': 'disc',
        'trackId':  'kwabs-walk',
    },

    # ─── Match perks — consumables, armed for the next match ──────────────
    # Pricing reflects in-match power. captain-triple and free-hit
    # influence the leaderboard heavily — they cost more so users have
    # to commit. pick-reroll is the cheapest in-draft perk.
    'captain-triple': {
        'id':       'captain-triple',
        'cost':     800,            # was 500 — 1.5× captain multiplier is heavy
        'kind':     'consumable',
        'category': 'match-perk',
    },
    'pick-reroll': {
        'id':       'pick-reroll',
        'cost':     400,            # unchanged — modest in-draft influence
        'kind':     'consumable',
        'category': 'match-perk',
    },
    'free-hit': {
        'id':       'free-hit',
        'cost':     1500,           # was 800 — single most powerful perk
        'kind':     'consumable',
        'category': 'match-perk',
    },
}


def get_item(item_id: str) -> dict | None:
    """Return the catalog entry for item_id, or None if unknown."""
    return CATALOG.get(item_id)


def is_consumable(item_id: str) -> bool:
    item = CATALOG.get(item_id)
    return bool(item) and item.get('kind') == 'consumable'


def is_permanent(item_id: str) -> bool:
    item = CATALOG.get(item_id)
    return bool(item) and item.get('kind') in ('cosmetic', 'disc')
