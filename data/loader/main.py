import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from parsers.match import parse_match
from parsers.events import parse_events
from parsers.kpi import parse_kpi
from loader.dynamodb import write_match, write_events, write_players
from loader.images import upload_player_images
from constants import MATCH_FILE, EVENTS_FILE, KPI_FILE

DATA_DIR = os.path.join(os.path.dirname(__file__), "..")

# KPI file locations to try in order
_KPI_CANDIDATES = [
    os.path.join(DATA_DIR, KPI_FILE),
    os.path.expanduser("~/Downloads/kpi_data_Bayern_Hamburg.xml"),
]


def main():
    print("Parsing match info...")
    result = parse_match(os.path.join(DATA_DIR, MATCH_FILE))
    match = result["match"]
    players = result["players"]
    print(f"  {match['homeTeamName']} vs {match['awayTeamName']}")
    print(f"  {len(players)} players")
    print(f"  Formations: {match['homeFormation']} vs {match['awayFormation']}")

    print("\nParsing events...")
    events = parse_events(os.path.join(DATA_DIR, EVENTS_FILE), players)
    print(f"  {len(events)} relevant events")

    # Merge KPI stats into player records if the file is available
    kpi_path = next((p for p in _KPI_CANDIDATES if os.path.exists(p)), None)
    if kpi_path:
        print(f"\nParsing KPI stats from {os.path.basename(kpi_path)}...")
        kpi_stats = parse_kpi(kpi_path, players)
        for pid, player in players.items():
            player["stats"] = kpi_stats.get(pid, {})
        print(f"  Stats merged for {sum(1 for p in players.values() if p.get('stats'))} players")
    else:
        print("\nNo KPI file found — skipping stats (copy kpi.xml to data/ to enable)")

    print("\nUploading player images to S3...")
    upload_player_images(players)

    print("\nWriting to DynamoDB...")
    write_match(match)
    write_events(events)
    write_players(players)

    print("\nDone.")
    print(f"  Match:   {match['matchId']}")
    print(f"  Events:  {len(events)}")
    print(f"  Players: {len(players)}")


if __name__ == "__main__":
    main()