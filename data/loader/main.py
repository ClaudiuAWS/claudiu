import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from parsers.match import parse_match
from parsers.events import parse_events
from loader.dynamodb import write_match, write_events, write_players
from constants import MATCH_FILE, EVENTS_FILE

DATA_DIR = os.path.join(os.path.dirname(__file__), "..")


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

    print("\nWriting to DynamoDB...")
    write_match(match)
    write_events(events)
    write_players(players)

    print("\nDone ✅")
    print(f"  Match:   {match['matchId']}")
    print(f"  Events:  {len(events)}")
    print(f"  Players: {len(players)}")


if __name__ == "__main__":
    main()