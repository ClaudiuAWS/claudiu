# Architecture — Brezn

The app is a React SPA in front of an event-driven AWS backend. Real-time
state changes flow through API Gateway WebSocket connections; durable state
lives in DynamoDB; the AI agent runs on Bedrock Nova Micro behind a Lambda
that the frontend can mode-multiplex (per-event ticks vs one-shot captain
suggestions).

---

## Service map

```mermaid
flowchart LR
  subgraph Client
    UA["Browser SPA<br/>(Vite + React 19)"]
  end

  subgraph AWS_Edge["AWS Edge"]
    CF[CloudFront]
    S3[(S3 static assets)]
  end

  subgraph AWS_Auth["Auth"]
    COG[Cognito User Pool]
  end

  subgraph AWS_API["API Gateway"]
    REST[REST API]
    WS[WebSocket API]
  end

  subgraph AWS_Compute["Lambda"]
    L_ROOMS[rooms]
    L_FRIENDS[friends]
    L_CREDITS[credits]
    L_BADGES[badges]
    L_EVT[event-processor]
    L_DIR[director-handler]
  end

  subgraph AWS_AI["Generative AI"]
    BR[(Bedrock<br/>Nova Micro)]
  end

  subgraph AWS_State["DynamoDB"]
    T_ROOMS[(rooms)]
    T_MATCHES[(matches)]
    T_EVENTS[(match-events)]
    T_CREDITS[(credits)]
    T_BADGES[(badges)]
    T_FRIENDS[(friends)]
    T_PLAYERS[(player-lookup)]
  end

  subgraph AWS_Sched["Scheduler"]
    EB[EventBridge schedules]
  end

  UA -->|HTTPS| CF --> S3
  UA -->|Auth JWT| COG
  UA -->|REST| REST
  UA -.->|WSS subscribe| WS

  REST --> L_ROOMS & L_FRIENDS & L_CREDITS & L_BADGES & L_DIR

  L_ROOMS --> T_ROOMS & T_MATCHES & T_PLAYERS & EB
  L_FRIENDS --> T_FRIENDS
  L_CREDITS --> T_CREDITS
  L_BADGES --> T_BADGES
  L_DIR --> BR

  EB --> L_EVT
  L_EVT --> T_ROOMS & T_MATCHES & T_EVENTS & T_CREDITS & T_BADGES
  L_EVT --> WS
  L_DIR --> WS
  L_ROOMS --> WS
  L_FRIENDS --> WS
```

---

## Data flows

### 1. Live match event ingest + fanout

The match is a parsed XML replay loaded into `claudiu-match-events`. The
host's `Start Match` action stamps a `startedAt` on the room and writes
EventBridge schedules — one per event — at `startedAt + (eventTimeSec /
speedMultiplier × 1000 ms)`.

```mermaid
sequenceDiagram
  participant Host
  participant Rooms as rooms Lambda
  participant EB as EventBridge
  participant EP as event-processor
  participant DDB as DynamoDB
  participant WS as API Gateway WS
  participant Members as All party members

  Host->>Rooms: POST /rooms/{code}/start
  Rooms->>DDB: status=live, startedAt=now()
  Rooms->>EB: createSchedule × N events
  Members->>WS: subscribe room#{code}

  loop For each scheduled event
    EB->>EP: invoke(eventId)
    EP->>DDB: read event + room + members
    EP->>DDB: write score deltas, badges, credits
    EP->>WS: broadcast room_update + score_update
    WS-->>Members: room_update + score_update
  end
```

Once all events have fired, `event-processor._end_rooms` flips the match
status to `complete`, awards end-of-match credits + badges, and broadcasts
`match_ended`.

### 2. Party invite acceptance — instant navigation

```mermaid
sequenceDiagram
  participant Inviter
  participant Friends as friends Lambda
  participant WS as API Gateway WS
  participant Invitee as Invitee SPA
  participant LobbyPage as Lobby

  Inviter->>Friends: POST /friends/{id}/invite
  Friends->>WS: push to user#{inviteeId}
  WS-->>Invitee: room_invite {roomCode, matchId, inviter}
  Invitee->>Invitee: handleAccept fires
  Note over Invitee: setPending(null); navigate(/lobby/X, { state: { initialRoom } })
  Invitee->>LobbyPage: mount with initialRoom stub<br/>(both members + hostUserId)
  par Background
    Invitee->>Friends: POST /rooms/{code}/join
    Friends->>WS: broadcast room_update
    WS-->>Invitee: room_update (authoritative)
  end
```

The stub `initialRoom` (passes 35–36) means the lobby renders fully-populated
on the first frame; the WS `room_update` just confirms what's already on
screen.

### 3. Coordinated draft pick — CAS + soft-ack stale race

```mermaid
sequenceDiagram
  participant UserA
  participant UserB
  participant Rooms as rooms Lambda
  participant DDB as DynamoDB
  participant WS as API Gateway WS

  par Both tap simultaneously
    UserA->>Rooms: draft-pick(pairIndex=N, playerId=X)
  and
    UserB->>Rooms: draft-pick(pairIndex=N, playerId=Y)
  end

  Rooms->>DDB: read draft (ConsistentRead)
  Note over Rooms: pendingChoices = {A: X}
  Rooms->>DDB: conditional update (CAS)<br/>expects currentPairIndex=N
  DDB-->>Rooms: OK
  Rooms->>WS: draft_state_update

  Note over Rooms: B's request now runs
  Rooms->>DDB: read draft (ConsistentRead)
  Note over Rooms: pendingChoices = {A: X}, both now resolved → advance
  Rooms->>DDB: conditional update<br/>currentPairIndex=N+1
  DDB-->>Rooms: OK
  Rooms->>WS: draft_pair_resolved + draft_state_update
  WS-->>UserA: pair advanced
  WS-->>UserB: pair advanced
```

If a third client raced and tried to submit `pairIndex=N` after
`currentPairIndex` had already advanced, the backend returns
`{ok: True, stale: True, currentPairIndex: cur_idx}` instead of raising
(pass 37). Frontend clears its optimistic `chosen` lock; the next WS
`room_update` syncs the user's UI.

### 4. Halftime — match-aware quiz generation

```mermaid
sequenceDiagram
  participant EP as event-processor
  participant DH as director-handler
  participant BR as Bedrock Nova Micro
  participant WS as API Gateway WS
  participant Client

  EP->>EP: halftime event fires
  EP->>WS: broadcast match_event(halftime)<br/>+ minigame_start(HALFTIME_QUIZ, fallback)
  Client->>DH: POST /rooms/{code}/director-tick<br/>{snapshot, playerDirectory, firstHalfEvents}
  DH->>BR: Converse(SYSTEM_PROMPT + snapshot)
  BR-->>DH: JSON {action: start_minigame, gameType: HALFTIME_QUIZ, config.questions}
  DH->>DH: validate schema, no-duplicate options, confidence ≥ 0.7,<br/>player-bio names in playerDirectory,<br/>at least one type=match-event
  alt All checks pass
    DH->>WS: minigame_start(HALFTIME_QUIZ, AI questions)
    WS-->>Client: overrides the static fallback
  else
    Note over DH: drop the AI questions; static fallback already broadcast
  end
```

Hallucination guards (defined in `prompts.py` + `service.py`):

1. **Schema gate** — each question must have 4 distinct non-empty choices, a `correctIdx` in `[0, 4)`, a `category`, a `type` ∈ {`match-event`, `player-bio`}, and a `confidence` ∈ `[0, 1]`.
2. **Confidence filter** — drop any question with `confidence < 0.7`.
3. **Name-grounding** — `player-bio` questions must reference a name from `playerDirectory` (the authoritative {playerName → teamName} map built from the actual rosters of THIS match).
4. **Required match-event** — at least one of the 3 surviving questions must be type `match-event` (grounded in confirmed first-half events), else drop the whole quiz.
5. **Banned phrases** — the prompt explicitly forbids "today", "currently", "this season", trophy counts, current jersey numbers, etc. — anything that drifts over time.

If validation drops everything, the frontend's `pickFallbackQuestions(3)` static pool fires instead. Users always see a coherent quiz; they never see a wrong answer.

---

## Why Bedrock Nova Micro

- Direct invocable in `eu-central-1` (no Marketplace subscription).
- ~8× cheaper than Anthropic models on this workload (~250-token outputs, 30 ticks per match cap).
- The Converse API is model-agnostic — we can swap to a stronger model via env var (`BEDROCK_MODEL_ID`) if the price-quality tradeoff shifts.

---

## Infra-as-code

Every backend stack is a CloudFormation template under `infra/`:

```
infra/
  cicd/           — OIDC IAM roles for GitHub Actions
  compute/        — Lambda stacks (rooms, credits, badges, friends, director, event-processor, matches)
  data/           — DynamoDB tables
  hosting/        — CloudFront + S3 frontend
  shared/         — Cognito, base IAM, log groups
```

Each has a matching `.github/workflows/deploy-*.yml` that triggers on push
to `main` touching the template, and deploys via the OIDC role —
no long-lived secrets.
