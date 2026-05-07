import xmltodict
from datetime import datetime, timezone
from typing import Optional
from constants import EventType, RELEVANT_XML_TAGS, KICKOFF_TIME


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

    # Use the canonical kickoff from constants — the same value parse_match
    # writes to the match record's kickoffTime field. Iterating raw_events for
    # the first firstHalf KickOff used to win a pre-match marker (~17 min
    # before ball-rolling kickoff), inflating every gameTime by 17 min and
    # making halftime schedule at 68:00 instead of 51:01.
    kickoff_dt = datetime.fromisoformat(KICKOFF_TIME).astimezone(timezone.utc)


    processed = []

    for raw_event in raw_events:
        result = _process_event(raw_event, players)
        if result:
            result["gameTime"] = _calculate_game_time(result["eventTime"], kickoff_dt)
            processed.append(result)

    processed.sort(key=lambda e: e["eventTime"])

    _recalculate_second_half_match_clock(processed)

    # Keep DynamoDB query order aligned with match chronology by prefixing
    # eventId with an incrementing sequence (zero-padded for lexical sorting).
    for idx, event in enumerate(processed, start=1):
        original_id = event["eventId"]
        event["eventId"] = f"{idx:06d}#{original_id}"

    print(f"  Found {len(processed)} relevant events out of {len(raw_events)} total")
    return processed


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _calculate_game_time(event_time_str: str, kickoff_dt: datetime) -> Optional[str]:
    """
    Calculate elapsed game time from EventTime and kickoff time.
    Returns "MM:SS" format.
    """
    try:
        event_dt = datetime.fromisoformat(event_time_str).astimezone(timezone.utc)
        offset_seconds = (event_dt - kickoff_dt).total_seconds()
        if offset_seconds < 0:
            return "00:00"
        elapsed = int(offset_seconds)
        minutes, seconds = divmod(elapsed, 60)
        return f"{minutes:02d}:{seconds:02d}"
    except Exception:
        return None


def _mmss_to_seconds(mmss: Optional[str]) -> Optional[int]:
    if not mmss:
        return None
    parts = str(mmss).strip().split(":")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def _seconds_to_mmss(total: int) -> str:
    t = max(0, int(total))
    minutes, seconds = divmod(t, 60)
    return f"{minutes:02d}:{seconds:02d}"


def _recalculate_second_half_match_clock(processed: list) -> None:
    """
    Wall-clock offset from kickoff includes real half-time break, so second-half
    events get inflated MM:SS (e.g. 68:30) while earlier subs look earlier (66:22).
    From the second-half kickoff onward, use: halftime clock + elapsed since 2H kickoff.
    """
    halftime_event = None
    for e in processed:
        if e.get("eventType") == EventType.HALFTIME:
            halftime_event = e
            break
    if halftime_event is None:
        return
    halftime_sec = _mmss_to_seconds(halftime_event.get("gameTime"))
    if halftime_sec is None:
        return

    sh = None
    for e in processed:
        if e.get("eventType") == EventType.SECOND_HALF:
            sh = e
            break
    if not sh:
        return

    try:
        sh_dt = datetime.fromisoformat(sh["eventTime"]).astimezone(timezone.utc)
    except Exception:
        return

    try:
        ht_dt = datetime.fromisoformat(halftime_event["eventTime"]).astimezone(timezone.utc)
    except Exception:
        return

    # Push halftime's gameTime past any 1st-half stoppage event whose wall-clock
    # time falls before the halftime whistle. Boundary is ht_dt (FinalWhistle of
    # firstHalf), NOT sh_dt: events between ht_dt and sh_dt are halftime-break
    # announcements (substitutions), and their wall-clock-from-kickoff gameTime
    # (e.g. 67:59) would otherwise inflate halftime to 68:00 and delay its
    # EventBridge schedule by ~3 min real time at 5x speed.
    max_first_half_sec = halftime_sec
    for e in processed:
        if e is halftime_event or e is sh:
            continue
        try:
            et = datetime.fromisoformat(e["eventTime"]).astimezone(timezone.utc)
        except Exception:
            continue
        if et >= ht_dt:
            continue
        sec = _mmss_to_seconds(e.get("gameTime"))
        if sec is not None and sec > max_first_half_sec:
            max_first_half_sec = sec
    if max_first_half_sec > halftime_sec:
        halftime_sec = max_first_half_sec + 1
        halftime_event["gameTime"] = _seconds_to_mmss(halftime_sec)

    # Halftime-break events (ht_dt <= et < sh_dt) — typically substitution
    # announcements during the break. Pin to halftime_sec so they schedule
    # alongside halftime instead of at random late wall-seconds. Subs are
    # filtered from the live feed; this only affects scheduling order and the
    # Squad-tab Subs section, where they're conventionally "HT subs" anyway.
    for e in processed:
        if e is halftime_event or e is sh:
            continue
        try:
            et = datetime.fromisoformat(e["eventTime"]).astimezone(timezone.utc)
        except Exception:
            continue
        if et < ht_dt or et >= sh_dt:
            continue
        e["gameTime"] = _seconds_to_mmss(halftime_sec)

    # Second-half kickoff must sit right after halftime on the match clock. Do not
    # rely on the loop below — rare et < sh_dt edge cases could skip this row and
    # leave an inflated wall-clock MM:SS (~68:00), which sorts after 66:xx subs.
    sh["gameTime"] = _seconds_to_mmss(halftime_sec + 1)

    for e in processed:
        if e is sh:
            continue
        try:
            et = datetime.fromisoformat(e["eventTime"]).astimezone(timezone.utc)
        except Exception:
            continue
        if et < sh_dt:
            continue
        extra = int((et - sh_dt).total_seconds())
        if extra < 0:
            extra = 0
        e["gameTime"] = _seconds_to_mmss(halftime_sec + 1 + extra)


def _process_event(raw_event: dict, players: dict) -> Optional[dict]:
    event_id   = raw_event.get("@EventId")
    event_time = raw_event.get("@EventTime")
    match_id   = raw_event.get("@MatchId")

    if not event_id or not event_time:
        return None

    # Check for ShotAtGoal or SavedShot nested inside Penalty
    if "Penalty" in raw_event:
        penalty = raw_event["Penalty"]
        if "ShotAtGoal" in penalty:
            shot = penalty["ShotAtGoal"]
            if "SuccessfulShot" in shot:
                return _handle_shot(
                    event_id, match_id, event_time,
                    shot, players,
                    is_penalty=True, penalty_data=penalty,
                )
            if "SavedShot" in shot:
                return _handle_saved_shot(
                    event_id, match_id, event_time,
                    shot["SavedShot"], players,
                )
        return None

    for tag in RELEVANT_XML_TAGS:
        if tag not in raw_event:
            continue

        data = raw_event[tag]

        if tag == "ShotAtGoal":
            # Goal
            if "SuccessfulShot" in data:
                return _handle_shot(event_id, match_id, event_time, data, players)
            # Goalkeeper save
            if "SavedShot" in data:
                return _handle_saved_shot(event_id, match_id, event_time, data["SavedShot"], players)
            return None

        if tag == "FinalWhistle":
            return _handle_final_whistle(event_id, match_id, event_time, data)

        if tag == "KickOff":
            return _handle_kickoff(event_id, match_id, event_time, data)

        if tag == "Caution":
            return _handle_caution(event_id, match_id, event_time, data, players)

        if tag == "Substitution":
            return _handle_substitution(event_id, match_id, event_time, data, players)

        if tag == "Nutmeg":
            return _handle_nutmeg(event_id, match_id, event_time, data, players)

        if tag == "SpectacularPlay":
            return _handle_spectacular_play(event_id, match_id, event_time, data, players)

        if tag == "Offside":
            return _handle_offside(event_id, match_id, event_time, data, players)

    return None


def _handle_shot(event_id, match_id, event_time, data, players, is_penalty=False, penalty_data=None) -> Optional[dict]:
    successful = data.get("SuccessfulShot")
    if not successful:
        return None
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
            # Penalty-specific fields
            "penaltyTakerId":       penalty_data.get("@ProspectiveTaker") if penalty_data else None,
            "goalkeeperMovement":   penalty_data.get("@GoalkeeperMovement") if penalty_data else None,
            "goalkeeperBehaviour":  penalty_data.get("@GoalkeeperBehaviour") if penalty_data else None,
        }
    }


def _handle_saved_shot(event_id, match_id, event_time, data, players) -> dict:
    gk_id = data.get("@GoalKeeper")
    gk    = players.get(gk_id, {})
    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.SAVED_SHOT,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "goalKeeperId":      gk_id,
            "goalKeeperDisplay": gk.get("displayName", gk_id),
            "teamId":            gk.get("teamId"),
            "teamRole":          gk.get("teamRole"),
            "saveType":          data.get("@SaveType"),
            "saveResult":        data.get("@SaveResult"),
            "saveEvaluation":    data.get("@SaveEvaluation"),
        }
    }


def _handle_nutmeg(event_id, match_id, event_time, data, players) -> dict:
    pid = data.get("@Player")
    aff = data.get("@AffectedPlayer")
    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.NUTMEG,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "playerId":         pid,
            "playerDisplay":    players.get(pid, {}).get("displayName", pid),
            "teamId":           data.get("@Team"),
            "teamRole":         players.get(pid, {}).get("teamRole"),
            "affectedPlayerId": aff,
            "affectedDisplay":  players.get(aff, {}).get("displayName", aff),
        }
    }


def _handle_spectacular_play(event_id, match_id, event_time, data, players) -> dict:
    pid = data.get("@Player")
    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.SPECTACULAR_PLAY,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "playerId":      pid,
            "playerDisplay": players.get(pid, {}).get("displayName", pid),
            "teamId":        data.get("@Team"),
            "teamRole":      players.get(pid, {}).get("teamRole"),
            "playType":      data.get("@Type"),
        }
    }


def _handle_offside(event_id, match_id, event_time, data, players) -> dict:
    pid = data.get("@Player")
    return {
        "eventId":   event_id,
        "matchId":   match_id,
        "eventType": EventType.OFFSIDE,
        "eventTime": event_time,
        "gameTime":  None,
        "data": {
            "playerId":      pid,
            "playerDisplay": players.get(pid, {}).get("displayName", pid),
            "teamId":        data.get("@Team"),
            "teamRole":      players.get(pid, {}).get("teamRole"),
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