import xmltodict
from datetime import datetime, timezone
from typing import Optional
from constants import EventType, RELEVANT_XML_TAGS


def parse_events(xml_path: str, players: dict) -> list:
    """
    Parse events.xml and return only relevant match events
    enriched with player data, sorted by EventTime.
    Kickoff time is derived from the firstHalf KickOff event.
    """
    with open(xml_path, "r", encoding="utf-8") as f:
        raw = xmltodict.parse(f.read())

    raw_events = raw["PutDataRequest"]["Event"]

    if isinstance(raw_events, dict):
        raw_events = [raw_events]

    kickoff_dt = _find_kickoff(raw_events)
    if not kickoff_dt:
        raise ValueError("No first half kickoff event found in events.xml")


    processed = []

    for raw_event in raw_events:
        result = _process_event(raw_event, players)
        if result:
            result["gameTime"] = _calculate_game_time(result["eventTime"], kickoff_dt)
            processed.append(result)

    processed.sort(key=lambda e: e["eventTime"])

    print(f"  Found {len(processed)} relevant events out of {len(raw_events)} total")
    return processed


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _find_kickoff(raw_events: list) -> Optional[datetime]:
    """Find the first half kickoff event and return its time in UTC."""
    for raw_event in raw_events:
        if "KickOff" not in raw_event:
            continue
        data = raw_event["KickOff"]
        if data.get("@GameSection") == "firstHalf":
            return datetime.fromisoformat(
                raw_event["@EventTime"]
            ).astimezone(timezone.utc)
    return None


def _calculate_game_time(event_time_str: str, kickoff_dt: datetime) -> Optional[str]:
    """
    Calculate match minute from EventTime and kickoff time.
    Returns "23'" format.
    """
    try:
        event_dt = datetime.fromisoformat(event_time_str).astimezone(timezone.utc)
        offset_seconds = (event_dt - kickoff_dt).total_seconds()
        if offset_seconds < 0:
            return "0'"
        minutes = int(offset_seconds // 60) + 1
        return f"{minutes}'"
    except Exception:
        return None


def _process_event(raw_event: dict, players: dict) -> Optional[dict]:
    event_id   = raw_event.get("@EventId")
    event_time = raw_event.get("@EventTime")
    match_id   = raw_event.get("@MatchId")

    if not event_id or not event_time:
        return None

    # Check for ShotAtGoal nested inside Penalty
    if "Penalty" in raw_event:
        penalty = raw_event["Penalty"]
        if "ShotAtGoal" in penalty:
            return _handle_shot(
                event_id, match_id, event_time,
                penalty["ShotAtGoal"], players,
                is_penalty=True
            )

    for tag in RELEVANT_XML_TAGS:
        if tag not in raw_event:
            continue

        data = raw_event[tag]

        if tag == "ShotAtGoal":
            return _handle_shot(event_id, match_id, event_time, data, players)

        if tag == "FinalWhistle":
            return _handle_final_whistle(event_id, match_id, event_time, data)

        if tag == "KickOff":
            return _handle_kickoff(event_id, match_id, event_time, data)

        if tag == "Caution":
            return _handle_caution(event_id, match_id, event_time, data, players)

        if tag == "Substitution":
            return _handle_substitution(event_id, match_id, event_time, data, players)

    return None


def _handle_shot(event_id, match_id, event_time, data, players, is_penalty=False) -> Optional[dict]:
    if "SuccessfulShot" not in data:
        return None

    successful = data["SuccessfulShot"]
    scorer_id  = data.get("@Player")
    assist_id  = successful.get("@Assist")
    scorer     = players.get(scorer_id, {})
    assister   = players.get(assist_id, {})

    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.GOAL,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "scoringPlayerId":    scorer_id,
            "scoringDisplay":     scorer.get("displayName", scorer_id),
            "scoringTeamId":      data.get("@Team"),
            "scoringTeamRole":    scorer.get("teamRole"),
            "shirtNumber":        scorer.get("shirtNumber"),
            "position":           scorer.get("position"),
            "positionName":       scorer.get("positionName"),
            "captain":            scorer.get("captain", False),
            "currentResult":      successful.get("@CurrentResult"),
            "typeOfShot":         data.get("@TypeOfShot"),
            "insideBox":          data.get("@InsideBox"),
            "xG":                 data.get("@xG"),
            "distanceToGoal":     data.get("@DistanceToGoal"),
            "assistPlayerId":     assist_id,
            "assistDisplay":      assister.get("displayName", assist_id),
            "assistPosition":     assister.get("position"),
            "assistPositionName": assister.get("positionName"),
            "assistType":         successful.get("@AssistType"),
            "isPenalty":          is_penalty,
        }
    }


def _handle_final_whistle(event_id, match_id, event_time, data) -> dict:
    game_section = data.get("@GameSection", "")
    event_type = (
        EventType.HALFTIME
        if game_section == "firstHalf"
        else EventType.FULLTIME
    )

    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": event_type,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "gameSection": game_section,
            "finalResult": data.get("@FinalResult"),
        }
    }


def _handle_kickoff(event_id, match_id, event_time, data) -> Optional[dict]:
    game_section = data.get("@GameSection", "")

    # Only keep actual second half kickoff
    # Empty gameSection = kickoff after a goal, skip
    # firstHalf = timing anchor, skip
    if game_section != "secondHalf":
        return None

    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.SECOND_HALF,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "gameSection": game_section,
        }
    }


def _handle_caution(event_id, match_id, event_time, data, players) -> dict:
    player_id = data.get("@Player")
    player    = players.get(player_id, {})

    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.CARD,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "playerId":      player_id,
            "playerDisplay": player.get("displayName", player_id),
            "teamId":        data.get("@Team"),
            "teamRole":      player.get("teamRole"),
            "cardColor":     data.get("@CardColor"),
            "reason":        data.get("@Reason"),
        }
    }


def _handle_substitution(event_id, match_id, event_time, data, players) -> dict:
    player_out_id = data.get("@PlayerOut")
    player_in_id  = data.get("@PlayerIn")
    player_out    = players.get(player_out_id, {})
    player_in     = players.get(player_in_id, {})

    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.SUBSTITUTION,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "playerOutId":      player_out_id,
            "playerOutDisplay": player_out.get("displayName", player_out_id),
            "playerInId":       player_in_id,
            "playerInDisplay":  player_in.get("displayName", player_in_id),
            "teamId":           data.get("@Team"),
            "teamRole":         player_out.get("teamRole"),
            "position":         data.get("@PlayingPosition"),
        }
    }