import xmltodict
from constants import POSITION_NAMES, MATCH_ID, KICKOFF_TIME

def parse_match(xml_path: str) -> dict:
    with open(xml_path, "r", encoding="utf-8") as f:
        raw = xmltodict.parse(f.read())

    info = raw["PutDataRequest"]["MatchInformation"]
    general = info["General"]
    environment = info["Environment"]

    match = _parse_general(general, environment)
    players, formations = _parse_teams(info["Teams"]["Team"], match["matchId"])

    # Fill in formations now that we have them
    match["homeFormation"] = formations.get("home")
    match["awayFormation"] = formations.get("away")

    return {
        "match": match,
        "players": players,
    }

# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _parse_general(general: dict, environment: dict) -> dict:
    return {
        "matchId":        MATCH_ID,
        "homeTeamId":     general["@HomeTeamId"],
        "homeTeamName":   general["@HomeTeamName"],
        "awayTeamId":     general["@GuestTeamId"],
        "awayTeamName":   general["@GuestTeamName"],
        "homeFormation":  None,  # filled in from Teams
        "awayFormation":  None,  # filled in from Teams
        "kickoffTime":    KICKOFF_TIME,
        "stadium":        environment["@StadiumName"],
        "spectators":     int(environment["@NumberOfSpectators"]),
        "homeScore":      0,
        "awayScore":      0,
        "status":         "upcoming",
        "currentMinute":  None,
        "startedAt":      None,
        "speedMultiplier": 30,
    }


def _parse_teams(teams_raw, match_id: str) -> dict:
    """
    Returns a flat player lookup dict keyed by playerId.
    Also returns formation per team role.
    """
    if isinstance(teams_raw, dict):
        teams_raw = [teams_raw]

    players = {}
    formations = {}

    for team in teams_raw:
        team_id   = team["@TeamId"]
        team_name = team["@TeamName"]
        role      = team["@Role"]        # "home" or "guest"
        formation = team["@LineUp"]
        team_role = "home" if role == "home" else "away"

        formations[team_role] = formation

        raw_players = team["Players"]["Player"]
        if isinstance(raw_players, dict):
            raw_players = [raw_players]

        for p in raw_players:
            player_id = p["@PersonId"]
            position_code = p.get("@PlayingPosition", "")

            players[player_id] = {
                "matchId":       match_id,
                "playerId":      player_id,
                "teamId":        team_id,
                "teamName":      team_name,
                "teamRole":      team_role,
                "shirtNumber":   p["@ShirtNumber"],
                "position":      position_code,
                "positionName":  POSITION_NAMES.get(position_code, "Unknown"),
                "starting":      p["@Starting"] == "true",
                "captain":       p["@TeamLeader"] == "true",
                "displayName":   _build_display_name(p, team_role),
            }

    return players, formations


def _build_display_name(player: dict, team_role: str) -> str:
    """
    Builds a human readable display name since real names are anonymized.
    Example: "Home #9 (Centre Forward)"
    """
    shirt   = player["@ShirtNumber"]
    pos     = player.get("@PlayingPosition", "")
    pos_name = POSITION_NAMES.get(pos, pos)
    side    = "Home" if team_role == "home" else "Away"
    captain = " ©" if player["@TeamLeader"] == "true" else ""
    return f"{side} #{shirt} ({pos_name}){captain}"