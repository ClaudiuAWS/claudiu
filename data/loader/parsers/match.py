import xmltodict
import re
from constants import POSITION_NAMES, MATCH_ID, KICKOFF_TIME, HOME_TEAM_NAME, AWAY_TEAM_NAME, PLAYER_NAME_OVERRIDES

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
        "homeTeamName":   HOME_TEAM_NAME or general["@HomeTeamName"],
        "awayTeamId":     general["@GuestTeamId"],
        "awayTeamName":   AWAY_TEAM_NAME or general["@GuestTeamName"],
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
        role      = team["@Role"]        # "home" or "guest"
        formation = _normalize_formation(team.get("@LineUp", ""))
        team_role = "home" if role == "home" else "away"
        # Use override name if set, otherwise fall back to what's in the XML
        team_name = (HOME_TEAM_NAME if team_role == "home" else AWAY_TEAM_NAME) or team["@TeamName"]

        formations[team_role] = formation

        raw_players = team["Players"]["Player"]
        if isinstance(raw_players, dict):
            raw_players = [raw_players]

        for p in raw_players:
            player_id = p["@PersonId"]
            position_code = p.get("@PlayingPosition", "")
            override = PLAYER_NAME_OVERRIDES.get(player_id, {})

            players[player_id] = {
                "matchId":       match_id,
                "playerId":      player_id,
                "teamId":        team_id,
                "teamName":      team_name,
                "teamRole":      team_role,
                "shirtNumber":   override.get("shirtNumber") or p["@ShirtNumber"],
                "position":      position_code,
                "positionName":  POSITION_NAMES.get(position_code, "Unknown"),
                "starting":      p["@Starting"] == "true",
                "captain":       p["@TeamLeader"] == "true",
                "displayName":   _build_display_name(p, team_role, override),
                "imageUrl":      override.get("imageUrl"),
            }

    return players, formations


def _normalize_formation(raw_formation: str) -> str:
    """
    Extract a canonical formation token like 4-2-3-1.
    Falls back to the raw input when no clear token is found.
    """
    if not raw_formation:
        return raw_formation

    match = re.search(r"\b\d+(?:-\d+){2,3}\b", raw_formation)
    return match.group(0) if match else raw_formation


def _build_display_name(player: dict, team_role: str, override: dict = None) -> str:
    captain = " ©" if player["@TeamLeader"] == "true" else ""
    if override:
        first = override.get("firstName", "")
        last  = override.get("lastName", "")
        name  = f"{first} {last}".strip() or override.get("shortName", "")
        return f"{name}{captain}"
    # Fallback for any player without an override
    shirt    = player["@ShirtNumber"]
    pos      = player.get("@PlayingPosition", "")
    pos_name = POSITION_NAMES.get(pos, pos)
    side     = "Home" if team_role == "home" else "Away"
    return f"{side} #{shirt} ({pos_name}){captain}"