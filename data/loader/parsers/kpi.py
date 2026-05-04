import xmltodict
from collections import defaultdict


def parse_kpi(xml_path: str, players: dict) -> dict:
    """
    Aggregate per-player stats from the KPI XML.
    players: dict of playerId -> player info (needed to find starting GKs for save attribution).
    Returns: dict of playerId -> stats dict.
    """
    with open(xml_path, "r", encoding="utf-8") as f:
        raw = xmltodict.parse(f.read())

    events = raw["PutDataRequest"]["AdvancedEvents"]["Event"]
    if isinstance(events, dict):
        events = [events]

    # Find starting GK per team for save attribution
    gk_by_team = {}
    for pid, p in players.items():
        if p.get("position") == "TW" and p.get("starting"):
            gk_by_team[p["teamId"]] = pid

    stats = defaultdict(lambda: {
        "goals":    0,
        "shots":    0,
        "xG":       0.0,
        "passes":   0,
        "passOk":   0,
        "tackles":  0,
        "saves":    0,
    })

    for event in events:
        for tag, data in event.items():
            if not isinstance(data, dict):
                continue

            if tag == "Play":
                pid = data.get("@PlayerId")
                if pid:
                    stats[pid]["passes"] += 1
                    if data.get("@Evaluation") == "successfullyCompleted":
                        stats[pid]["passOk"] += 1

            elif tag == "ShotAtGoal":
                pid     = data.get("@PlayerId")
                team_id = data.get("@TeamId")
                result  = data.get("@ShotResult", "")
                xg      = float(data.get("@xG", 0))
                if pid:
                    stats[pid]["shots"] += 1
                    stats[pid]["xG"]    += xg
                    if result == "successfulShot":
                        stats[pid]["goals"] += 1
                # Credit the save to the opposing starting GK
                if result == "savedShot":
                    for t_id, gk_pid in gk_by_team.items():
                        if t_id != team_id:
                            stats[gk_pid]["saves"] += 1

            elif tag == "TacklingGame":
                winner = data.get("@WinnerPlayerId")
                if winner:
                    stats[winner]["tackles"] += 1

    # Post-process: derive passAcc, round xG, drop raw passOk
    result_stats = {}
    for pid, s in stats.items():
        pass_acc = round(100 * s["passOk"] / s["passes"]) if s["passes"] > 0 else 0
        result_stats[pid] = {
            "goals":    s["goals"],
            "shots":    s["shots"],
            "xG":       round(s["xG"], 2),
            "passes":   s["passes"],
            "passAcc":  pass_acc,
            "tackles":  s["tackles"],
            "saves":    s["saves"],
        }

    return result_stats
