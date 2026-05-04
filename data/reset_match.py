#!/usr/bin/env python3
"""
Dev utility: reset the match back to 'upcoming' so it can be replayed.

Usage (from project root):
    python data/reset_match.py              # uses saved credentials
    python data/reset_match.py --save-creds # prompts for fresh AWS creds, saves them, then resets

Saving credentials once:
    python data/reset_match.py --save-creds
    Paste the three SET lines from the AWS console when prompted.
    Credentials are saved to ~/.aws/credentials under [hackathon].

After saving you can just run:
    python data/reset_match.py
"""

import boto3
import configparser
import os
import re
import sys

REGION      = "eu-central-1"
MATCH_TABLE        = "claudiu-matches"
MATCH_EVENTS_TABLE = "claudiu-match-events"
ROOMS_TABLE        = "claudiu-rooms"
MATCH_ID    = next((a for a in sys.argv[1:] if not a.startswith("--")), "DFL-MAT-111111")
PROFILE     = "hackathon"
CREDS_FILE  = os.path.expanduser("~/.aws/credentials")


def save_credentials():
    """Parse pasted SET lines and write them to the hackathon profile."""
    print("Paste the three SET lines from your AWS console (then press Enter twice):")
    print("  SET AWS_ACCESS_KEY_ID=...")
    print("  SET AWS_SECRET_ACCESS_KEY=...")
    print("  SET AWS_SESSION_TOKEN=...")
    print()
    lines = []
    while True:
        line = input()
        if not line.strip():
            break
        lines.append(line.strip())

    creds = {}
    for line in lines:
        # Handle both "SET KEY=VALUE" and "export KEY=VALUE" and plain "KEY=VALUE"
        m = re.match(r"(?:SET\s+|export\s+)?([A-Z_]+)=(.+)", line, re.IGNORECASE)
        if m:
            creds[m.group(1).upper()] = m.group(2).strip()

    required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]
    missing = [k for k in required if k not in creds]
    if missing:
        print(f"ERROR: could not parse {missing}. Make sure you pasted all three lines.")
        sys.exit(1)

    # Write to ~/.aws/credentials
    cfg = configparser.RawConfigParser()
    if os.path.exists(CREDS_FILE):
        with open(CREDS_FILE, encoding="utf-8-sig") as f:
            cfg.read_file(f)

    if not cfg.has_section(PROFILE):
        cfg.add_section(PROFILE)
    cfg.set(PROFILE, "aws_access_key_id",     creds["AWS_ACCESS_KEY_ID"])
    cfg.set(PROFILE, "aws_secret_access_key", creds["AWS_SECRET_ACCESS_KEY"])
    cfg.set(PROFILE, "aws_session_token",     creds["AWS_SESSION_TOKEN"])
    cfg.set(PROFILE, "region",                REGION)

    os.makedirs(os.path.dirname(CREDS_FILE), exist_ok=True)
    with open(CREDS_FILE, "w", encoding="utf-8") as f:
        cfg.write(f)
    print(f"Credentials saved to [{PROFILE}] in {CREDS_FILE}\n")


# ── Optionally save fresh credentials first ───────────────────────────────────
if "--save-creds" in sys.argv:
    save_credentials()

# ── Build boto3 session ───────────────────────────────────────────────────────
# Prefer env vars (if set), then fall back to the hackathon profile
if os.environ.get("AWS_ACCESS_KEY_ID"):
    session = boto3.Session(region_name=REGION)
    print("Using credentials from environment variables.")
else:
    try:
        session = boto3.Session(profile_name=PROFILE, region_name=REGION)
        print(f"Using [{PROFILE}] profile from {CREDS_FILE}.")
    except Exception:
        print("No credentials found. Run:  python data/reset_match.py --save-creds")
        sys.exit(1)

dynamodb     = session.resource("dynamodb")
events       = session.client("events")
matches      = dynamodb.Table(MATCH_TABLE)
match_events = dynamodb.Table(MATCH_EVENTS_TABLE)
rooms        = dynamodb.Table(ROOMS_TABLE)

# ── 1. Reset match ────────────────────────────────────────────────────────────
print(f"\nResetting match {MATCH_ID}...")
matches.update_item(
    Key={"matchId": MATCH_ID},
    UpdateExpression=(
        "SET #st = :upcoming, homeScore = :zero, awayScore = :zero "
        "REMOVE startedAt, finishedAt, currentMinute, speedMultiplier, activeRunId"
    ),
    ExpressionAttributeNames={"#st": "status"},
    ExpressionAttributeValues={":upcoming": "upcoming", ":zero": 0},
)
print("  Match reset to 'upcoming', scores 0:0")

# ── 2. Reset fired flags on match events ─────────────────────────────────────
print("Resetting match event fired flags...")
resp = match_events.query(
    KeyConditionExpression=boto3.dynamodb.conditions.Key("matchId").eq(MATCH_ID)
)
event_items = resp.get("Items", [])
for ev in event_items:
    match_events.update_item(
        Key={"matchId": MATCH_ID, "eventId": ev["eventId"]},
        UpdateExpression="REMOVE fired, firedAt, firedRunId",
    )
print(f"  Reset {len(event_items)} events")

# ── 4. Delete all rooms for this match ────────────────────────────────────────
print("Scanning for rooms...")
resp = rooms.scan(
    FilterExpression=boto3.dynamodb.conditions.Attr("matchId").eq(MATCH_ID)
)
room_items = resp.get("Items", [])
for room in room_items:
    code = room["roomCode"]
    rooms.delete_item(Key={"roomCode": code})
    print(f"  Deleted room {code}")
if not room_items:
    print("  No rooms to delete")

# ── 5. Delete stale EventBridge rules from replay emitter ────────────────────
print("Checking EventBridge for stale replay rules...")
paginator = events.get_paginator("list_rules")
deleted = 0
for page in paginator.paginate(NamePrefix="claudiu-replay-"):
    for rule in page["Rules"]:
        name = rule["Name"]
        targets = events.list_targets_by_rule(Rule=name)["Targets"]
        if targets:
            events.remove_targets(Rule=name, Ids=[t["Id"] for t in targets])
        events.delete_rule(Name=name)
        print(f"  Deleted EventBridge rule: {name}")
        deleted += 1
if deleted == 0:
    print("  No stale EventBridge rules found")

print("\nDone! The match is ready to be replayed.")
print("Go to the lobby, create a room with 2+ users, and click 'Start Match'.")
