# ─────────────────────────────────────────
# DynamoDB Table Names
# ─────────────────────────────────────────

MATCHES_TABLE = "claudiu-matches"
MATCH_EVENTS_TABLE = "claudiu-match-events"
PLAYER_LOOKUP_TABLE = "claudiu-player-lookup"

# -----------------------------------------
# Match ID
# -----------------------------------------

MATCH_ID = "DFL-MAT-111111"

# -----------------------------------------
# Team Name Overrides
# The XML uses anonymised placeholders; set real names here.
# Set to None to use whatever is in the XML.
# -----------------------------------------

HOME_TEAM_NAME = "Bayern Munich"
AWAY_TEAM_NAME = "Hamburger SV"

# -----------------------------------------
# Kickoff Time
# -----------------------------------------

KICKOFF_TIME = "2025-01-01T14:30:17.210+00:00"


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

MATCH_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days for dev

# ─────────────────────────────────────────
# AWS Region
# ─────────────────────────────────────────

AWS_REGION = "eu-central-1"