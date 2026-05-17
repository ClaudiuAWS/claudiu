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
        'cost':     1000,
        'kind':     'cosmetic',
        'category': 'name-color',
    },
    'name-rainbow': {
        'id':       'name-rainbow',
        'cost':     3000,
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
        'cost':     2000,
        'kind':     'cosmetic',
        'category': 'avatar-frame',
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
    'captain-triple': {
        'id':       'captain-triple',
        'cost':     500,
        'kind':     'consumable',
        'category': 'match-perk',
    },
    'pick-reroll': {
        'id':       'pick-reroll',
        'cost':     400,
        'kind':     'consumable',
        'category': 'match-perk',
    },
    'free-hit': {
        'id':       'free-hit',
        'cost':     800,
        'kind':     'consumable',
        'category': 'match-perk',
    },
    'reaction-pack': {
        'id':       'reaction-pack',
        'cost':     300,
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
