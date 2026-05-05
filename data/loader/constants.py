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
    GOAL             = "goal"
    CARD             = "card"
    HALFTIME         = "halftime"
    FULLTIME         = "fulltime"
    KICKOFF          = "kickoff"
    SECOND_HALF      = "secondhalf"
    SUBSTITUTION     = "substitution"
    SAVED_SHOT       = "saved_shot"
    NUTMEG           = "nutmeg"
    SPECTACULAR_PLAY = "spectacular_play"
    OFFSIDE          = "offside"

# ─────────────────────────────────────────
# XML Event Tags We Care About
# ─────────────────────────────────────────

RELEVANT_XML_TAGS = {
    "ShotAtGoal",
    "Caution",
    "FinalWhistle",
    "KickOff",
    "Substitution",
    "Nutmeg",
    "SpectacularPlay",
    "Offside",
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

CLOUDFRONT_DOMAIN = "d1t5xvsturq92p.cloudfront.net"

# ─────────────────────────────────────────
# Real Player Name Overrides
# Maps PersonId → {firstName, lastName, shortName, shirtNumber, imageUrl}
# Bayern Munich (DFL-OBJ-000001..000020) vs Hamburger SV (DFL-OBJ-000021..000040)
# 2024-25 Bundesliga season lineup. Images from SofaScore CDN.
# ─────────────────────────────────────────

_SS = "https://api.sofascore.com/api/v1/player"

PLAYER_NAME_OVERRIDES = {
    # ── Bayern Munich Starting XI ──────────────────────────────────────────
    "DFL-OBJ-000001": {"firstName": "Manuel",     "lastName": "Neuer",             "shortName": "M. Neuer",             "shirtNumber": "1",  "imageUrl": f"{_SS}/8959/image"},
    "DFL-OBJ-000002": {"firstName": "Dayot",      "lastName": "Upamecano",         "shortName": "D. Upamecano",         "shirtNumber": "2",  "imageUrl": f"{_SS}/798583/image"},
    "DFL-OBJ-000003": {"firstName": "Jonathan",   "lastName": "Tah",               "shortName": "J. Tah",               "shirtNumber": "4",  "imageUrl": f"{_SS}/227672/image"},
    "DFL-OBJ-000004": {"firstName": "Joshua",     "lastName": "Kimmich",           "shortName": "J. Kimmich",           "shirtNumber": "6",  "imageUrl": f"{_SS}/259117/image"},
    "DFL-OBJ-000005": {"firstName": "Serge",      "lastName": "Gnabry",            "shortName": "S. Gnabry",            "shirtNumber": "7",  "imageUrl": f"{_SS}/187433/image"},
    "DFL-OBJ-000006": {"firstName": "Harry",      "lastName": "Kane",              "shortName": "H. Kane",              "shirtNumber": "9",  "imageUrl": f"{_SS}/108579/image"},
    "DFL-OBJ-000007": {"firstName": "Michael",    "lastName": "Olise",             "shortName": "M. Olise",             "shirtNumber": "17", "imageUrl": f"{_SS}/978838/image"},
    "DFL-OBJ-000008": {"firstName": "Luis",       "lastName": "Díaz",              "shortName": "L. Díaz",              "shirtNumber": "14", "imageUrl": f"{_SS}/883537/image"},
    "DFL-OBJ-000009": {"firstName": "Konrad",     "lastName": "Laimer",            "shortName": "K. Laimer",            "shirtNumber": "27", "imageUrl": f"{_SS}/355492/image"},
    "DFL-OBJ-000010": {"firstName": "Josip",      "lastName": "Stanišić",          "shortName": "J. Stanišić",          "shirtNumber": "44", "imageUrl": f"{_SS}/927407/image"},
    "DFL-OBJ-000011": {"firstName": "Aleksandar", "lastName": "Pavlović",          "shortName": "A. Pavlović",          "shirtNumber": "45", "imageUrl": f"{_SS}/1142251/image"},
    # ── Bayern Munich Bench ────────────────────────────────────────────────
    "DFL-OBJ-000012": {"firstName": "Sven",       "lastName": "Ulreich",           "shortName": "S. Ulreich",           "shirtNumber": "26", "imageUrl": f"{_SS}/26768/image"},
    "DFL-OBJ-000013": {"firstName": "Kim",        "lastName": "Min-jae",           "shortName": "Kim Min-jae",          "shirtNumber": "3",  "imageUrl": f"{_SS}/896569/image"},
    "DFL-OBJ-000014": {"firstName": "Raphaël",    "lastName": "Guerreiro",         "shortName": "R. Guerreiro",         "shirtNumber": "22", "imageUrl": f"{_SS}/246999/image"},
    "DFL-OBJ-000015": {"firstName": "Tom",        "lastName": "Bischof",           "shortName": "T. Bischof",           "shirtNumber": "20", "imageUrl": f"{_SS}/1129935/image"},
    "DFL-OBJ-000016": {"firstName": "Nicolas",   "lastName": "Jackson",           "shortName": "N. Jackson",           "shirtNumber": "11", "imageUrl": f"{_SS}/1085381/image"},
    "DFL-OBJ-000017": {"firstName": "Sacha",      "lastName": "Boey",              "shortName": "S. Boey",              "shirtNumber": "23", "imageUrl": f"{_SS}/980418/image"},
    "DFL-OBJ-000018": {"firstName": "Leon",       "lastName": "Goretzka",          "shortName": "L. Goretzka",          "shirtNumber": "8",  "imageUrl": f"{_SS}/184661/image"},
    "DFL-OBJ-000019": {"firstName": "Jonas",      "lastName": "Urbig",             "shortName": "J. Urbig",             "shirtNumber": "40", "imageUrl": f"{_SS}/1130647/image"},
    "DFL-OBJ-000020": {"firstName": "Lennart",    "lastName": "Karl",              "shortName": "L. Karl",              "shirtNumber": "42", "imageUrl": f"{_SS}/1861975/image"},

    # ── Hamburger SV Starting XI ───────────────────────────────────────────
    "DFL-OBJ-000021": {"firstName": "Daniel",     "lastName": "Fernandes",         "shortName": "D. Fernandes",         "shirtNumber": "1",  "imageUrl": f"{_SS}/113442/image"},
    "DFL-OBJ-000022": {"firstName": "William",    "lastName": "Mikelbrencis",      "shortName": "W. Mikelbrencis",      "shirtNumber": "2",  "imageUrl": f"{_SS}/1102528/image"},
    "DFL-OBJ-000023": {"firstName": "Ransford",   "lastName": "Königsdörffer",     "shortName": "R. Königsdörffer",     "shirtNumber": "11", "imageUrl": f"{_SS}/1012235/image"},
    "DFL-OBJ-000024": {"firstName": "Luka",       "lastName": "Vušković",          "shortName": "L. Vušković",          "shirtNumber": "44", "imageUrl": f"{_SS}/1405212/image"},
    "DFL-OBJ-000025": {"firstName": "Emir",       "lastName": "Sahiti",            "shortName": "E. Sahiti",            "shirtNumber": "29", "imageUrl": f"{_SS}/841985/image"},
    "DFL-OBJ-000026": {"firstName": "Nicolás",    "lastName": "Capaldo",           "shortName": "N. Capaldo",           "shirtNumber": "24", "imageUrl": f"{_SS}/973564/image"},
    "DFL-OBJ-000027": {"firstName": "Aboubakr",   "lastName": "Soumahoro",         "shortName": "A. Soumahoro",         "shirtNumber": "22", "imageUrl": f"{_SS}/1605225/image"},
    "DFL-OBJ-000028": {"firstName": "Nicolai",    "lastName": "Remberg",           "shortName": "N. Remberg",           "shirtNumber": "21", "imageUrl": f"{_SS}/1064305/image"},
    "DFL-OBJ-000029": {"firstName": "Miro",       "lastName": "Muheim",            "shortName": "M. Muheim",            "shirtNumber": "28", "imageUrl": f"{_SS}/798303/image"},
    "DFL-OBJ-000030": {"firstName": "Warmed",     "lastName": "Omari",             "shortName": "W. Omari",             "shirtNumber": "17", "imageUrl": f"{_SS}/999030/image"},
    "DFL-OBJ-000031": {"firstName": "Fábio",      "lastName": "Vieira",            "shortName": "F. Vieira",            "shirtNumber": "20", "imageUrl": f"{_SS}/904835/image"},
    # ── Hamburger SV Bench ────────────────────────────────────────────────
    "DFL-OBJ-000032": {"firstName": "Daniel",     "lastName": "Peretz",            "shortName": "D. Peretz",            "shirtNumber": "30", "imageUrl": f"{_SS}/1048265/image"},
    "DFL-OBJ-000033": {"firstName": "Noah",       "lastName": "Katterbach",        "shortName": "N. Katterbach",        "shirtNumber": "3",  "imageUrl": f"{_SS}/930271/image"},
    "DFL-OBJ-000034": {"firstName": "Albert",     "lastName": "Sambi Lokonga",     "shortName": "A. Lokonga",           "shirtNumber": "6",  "imageUrl": f"{_SS}/901892/image"},
    "DFL-OBJ-000035": {"firstName": "Jonas",      "lastName": "Meffert",           "shortName": "J. Meffert",           "shirtNumber": "23", "imageUrl": f"{_SS}/148256/image"},
    "DFL-OBJ-000036": {"firstName": "Alexander",  "lastName": "Røssing-Lelesiit",  "shortName": "A. Røssing-Lelesiit",  "shirtNumber": "38", "imageUrl": f"{_SS}/1862226/image"},
    "DFL-OBJ-000037": {"firstName": "Robert",     "lastName": "Glatzel",           "shortName": "R. Glatzel",           "shirtNumber": "9",  "imageUrl": f"{_SS}/168987/image"},
    "DFL-OBJ-000038": {"firstName": "Fabio",      "lastName": "Baldé",             "shortName": "F. Baldé",             "shirtNumber": "45", "imageUrl": f"{_SS}/1546267/image"},
    "DFL-OBJ-000039": {"firstName": "Rayan",      "lastName": "Philippe",          "shortName": "R. Philippe",          "shirtNumber": "14", "imageUrl": f"{_SS}/991824/image"},
    "DFL-OBJ-000040": {"firstName": "Daniel",     "lastName": "Elfadli",           "shortName": "D. Elfadli",           "shirtNumber": "10", "imageUrl": f"{_SS}/945532/image"},
}