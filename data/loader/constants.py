# ─────────────────────────────────────────
# DynamoDB Table Names
# ─────────────────────────────────────────

MATCHES_TABLE = "claudiu-matches"
MATCH_EVENTS_TABLE = "claudiu-match-events"
PLAYER_LOOKUP_TABLE = "claudiu-player-lookup"

# ─────────────────────────────────────────
# File Paths (relative to data/ folder)
# ─────────────────────────────────────────

EVENTS_FILE = "events.xml"
KPI_FILE = "kpi.xml"
MATCH_FILE = "match.xml"

# ─────────────────────────────────────────
# Event Types
# ─────────────────────────────────────────

class EventType:
    GOAL = "goal"
    CARD = "card"
    HALFTIME = "halftime"
    FULLTIME = "fulltime"
    KICKOFF = "kickoff"
    SECOND_HALF = "secondhalf"
    SUBSTITUTION = "substitution"

# ─────────────────────────────────────────
# XML Event Tags We Care About
# ─────────────────────────────────────────

RELEVANT_XML_TAGS = {
    "ShotAtGoal",
    "Caution",
    "FinalWhistle",
    "KickOff",
    "Substitution",
}

SKIP_XML_TAGS = {
    "Play",
    "Reception",
    "Carry",
    "TeamPossession",
    "TacklingGame",
    "Foul",
    "FreeKick",
    "BallClaiming",
    "OtherBallAction",
    "RefereeBall",
    "FairPlay",
    "Offside",
}

# ─────────────────────────────────────────
# Playing Position Code → Readable Name
# ─────────────────────────────────────────

POSITION_NAMES = {
    "TW":  "Goalkeeper",
    "IVR": "Centre-back (Right)",
    "IVL": "Centre-back (Left)",
    "IVZ": "Centre-back",
    "LV":  "Left-back",
    "RV":  "Right-back",
    "DMZ": "Defensive Midfielder",
    "DMR": "Defensive Midfielder (Right)",
    "DML": "Defensive Midfielder (Left)",
    "DRM": "Defensive Midfielder (Right)",
    "DLM": "Defensive Midfielder (Left)",
    "ZO":  "Attacking Midfielder",
    "OLM": "Left Winger",
    "ORM": "Right Winger",
    "STZ": "Centre Forward",
    "STL": "Forward (Left)",
    "STR": "Forward (Right)",
    "LA":  "Left Wing",
    "RA":  "Right Wing",
}

# ─────────────────────────────────────────
# Match TTL (7 days in seconds)
# ─────────────────────────────────────────

MATCH_TTL_SECONDS = 2 * 60 * 60

# ─────────────────────────────────────────
# AWS Region
# ─────────────────────────────────────────

AWS_REGION = "eu-central-1"