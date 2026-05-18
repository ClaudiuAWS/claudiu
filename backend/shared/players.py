"""Fallback player roster for the demo match.

The data loader (data/loader/main.py) populates the claudiu-player-lookup
table from the canonical XML feed. On the deployed prod env that table
may be empty (loader was never re-run there) — when that happens, the
coordinated draft produces 0 pairs because _generate_draft_pairs has
nothing to pair up, and the user sees a "0 / 0" empty draft screen.

This module ships a fallback roster for the demo match so the draft is
playable end-to-end even with empty DDB. Player names are publicly
known Bundesliga players (NOT the protected hackathon dataset which
we never commit). When DDB has a real roster, the fallback stays
dormant — the threshold check in query_players_with_fallback below
prefers DDB data.

Each record matches the shape player_lookup writes:

    {
      'matchId':     'DFL-MAT-111111',
      'playerId':    'fallback-fcb-1',   # unique synthetic id
      'displayName': 'Manuel Neuer',
      'position':    'TW',                # German loader-convention code
      'teamRole':    'home' | 'away',
      'shirtNumber': 1,
      'starting':    True | False,
      'imageUrl':    '',
    }
"""

from boto3.dynamodb.conditions import Key

# Threshold below which we activate the fallback. A real Bundesliga
# roster has ~30 players (15-16 per team); a draft of 11 starters per
# team needs at least 22 players to produce meaningful pairs. Anything
# below that means the DDB scan returned a partial/broken load.
_FALLBACK_THRESHOLD = 22

_DEMO_MATCH_ID = 'DFL-MAT-111111'


def _row(team_role: str, idx: int, name: str, pos: str, shirt: int, starting: bool) -> dict:
    """Build a player_lookup-shaped row for the fallback table."""
    return {
        'matchId':     _DEMO_MATCH_ID,
        'playerId':    f'fallback-{team_role}-{idx}',
        'displayName': name,
        'position':    pos,
        'teamRole':    team_role,
        'shirtNumber': shirt,
        'starting':    starting,
        'imageUrl':    '',
    }


# Bayern Munich (home) — 11 starters in 4-2-3-1 + 5 subs
_BAYERN = [
    _row('home',  1, 'Manuel Neuer',        'TW',  1,  True),
    _row('home',  2, 'Joshua Kimmich',      'RV',  6,  True),
    _row('home',  3, 'Dayot Upamecano',     'IV',  2,  True),
    _row('home',  4, 'Min-jae Kim',         'IV', 24,  True),
    _row('home',  5, 'Alphonso Davies',     'LV', 19,  True),
    _row('home',  6, 'Leon Goretzka',       'DM',  8,  True),
    _row('home',  7, 'Aleksandar Pavlovic', 'DM', 23,  True),
    _row('home',  8, 'Thomas Müller',       'OM', 25,  True),
    _row('home',  9, 'Serge Gnabry',        'LM',  7,  True),
    _row('home', 10, 'Leroy Sané',          'RM', 10,  True),
    _row('home', 11, 'Harry Kane',          'ST',  9,  True),
    # Subs
    _row('home', 12, 'Jamal Musiala',       'OM', 42,  False),
    _row('home', 13, 'Konrad Laimer',       'DM', 27,  False),
    _row('home', 14, 'Eric Dier',           'IV', 15,  False),
    _row('home', 15, 'Mathys Tel',          'ST', 39,  False),
    _row('home', 16, 'Sven Ulreich',        'TW', 26,  False),
]


# Hamburger SV (away) — 11 starters in 4-2-3-1 + 5 subs
_HSV = [
    _row('away',  1, 'Daniel Heuer Fernandes', 'TW',  1,  True),
    _row('away',  2, 'Moritz Heyer',           'RV', 30,  True),
    _row('away',  3, 'Sebastian Schonlau',     'IV', 25,  True),
    _row('away',  4, 'Dennis Hadzikadunic',    'IV', 35,  True),
    _row('away',  5, 'Miro Muheim',            'LV', 28,  True),
    _row('away',  6, 'Jonas Meffert',          'DM', 14,  True),
    _row('away',  7, 'Lukasz Poreba',          'DM', 38,  True),
    _row('away',  8, 'László Bénes',           'OM', 20,  True),
    _row('away',  9, 'Bakery Jatta',           'LM', 18,  True),
    _row('away', 10, 'Levin Öztunali',         'RM', 11,  True),
    _row('away', 11, 'Robert Glatzel',         'ST',  9,  True),
    # Subs
    _row('away', 12, 'András Németh',          'ST', 39,  False),
    _row('away', 13, 'Ludovit Reis',           'DM',  6,  False),
    _row('away', 14, 'Stephan Ambrosius',      'IV',  3,  False),
    _row('away', 15, 'Anssi Suhonen',          'RM', 17,  False),
    _row('away', 16, 'Matheo Raab',            'TW', 24,  False),
]


FALLBACK_PLAYERS = {
    _DEMO_MATCH_ID: _BAYERN + _HSV,
}


def query_players_with_fallback(player_lookup_table, match_id: str) -> list:
    """Query player_lookup for `match_id` and fall back to bundled
    FALLBACK_PLAYERS when DDB returns fewer players than the threshold.

    This handles three cases:
      1. DDB has a full roster -> use it (fallback dormant).
      2. DDB is empty (loader never ran) -> fall back.
      3. DDB has a partial/broken load -> fall back (better than
         shipping a draft with 3 random players).

    Pagination via LastEvaluatedKey is preserved from the original
    direct-query path. Returns an empty list when the matchId isn't
    in the fallback registry AND DDB returns nothing.
    """
    resp = player_lookup_table.query(
        KeyConditionExpression=Key('matchId').eq(match_id),
    )
    players = resp.get('Items', [])
    while resp.get('LastEvaluatedKey'):
        resp = player_lookup_table.query(
            KeyConditionExpression=Key('matchId').eq(match_id),
            ExclusiveStartKey=resp['LastEvaluatedKey'],
        )
        players.extend(resp.get('Items', []))

    if len(players) >= _FALLBACK_THRESHOLD:
        return players

    fallback = FALLBACK_PLAYERS.get(match_id)
    if fallback:
        print(
            f"[players] DDB had {len(players)} rows for {match_id}, "
            f"below threshold {_FALLBACK_THRESHOLD} — using bundled fallback "
            f"({len(fallback)} players)"
        )
        return fallback

    # No DDB data + no fallback registered — return whatever we have.
    return players
