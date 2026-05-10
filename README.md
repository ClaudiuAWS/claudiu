# claudiu

Our project in the AWS World Cup Sports Innovation hackathon — a multiplayer
football match watching app where users draft squads against each other,
play live reaction-based mini-games, and chase a leaderboard while the match
unfolds.

---

## Match watching

- Each match is a real Bundesliga replay (Bayern Munich vs Hamburger SV in
  the demo dataset, `DFL-MAT-111111`) loaded from a parsed XML feed.
- The host picks a **replay speed** (1× = real time, 5× = recommended ~18 min,
  up to 30×). Backend EventBridge schedules dispatch the events at the
  scaled wall-clock interval.
- Events are **revealed on the displayed match clock**, not when the backend
  happens to process them. So even if EventBridge dispatch jitter delivers an
  event late, the feed only surfaces it when the match clock reaches its
  in-game time. Result: visually consistent timing across all viewers.
- The **header score** (e.g. `2:0`) is derived from the latest revealed goal's
  `currentResult`, not from the backend's match record. Goals appear in the
  feed and the score updates simultaneously — no lag between the two.
- Football-minute convention: a goal at 5:01 displays as `6'`, not `5'`
  (`Math.ceil(seconds / 60)`).

---

## Rooms

- **Create or join** a room using a 6-character code. Up to 2 humans per room
  in the current build.
- Member roster, draft state, mini-game state, and leaderboard all live on
  the room record. WebSocket channel `room#{code}` broadcasts every change.
- **Per-tab session storage** — Cognito tokens, draft progress, room rejoin
  info, and mini-game tracking all use `sessionStorage` instead of
  `localStorage`. Two tabs in the same browser profile can hold two
  different accounts (essential for same-machine multi-user testing).
  Tradeoff: closing a tab signs that tab out.

---

## Squad draft

Two modes depending on the room composition:

### Solo (1 user) — local simulation

Frontend generates draft pairs from the player roster, simulates an opponent
locally, and lets the user click through 14-ish rounds before picking their
starting XI. State persists in `sessionStorage` so a refresh resumes
mid-draft.

### Coordinated (2 users) — backend-driven, simultaneous picks

1. Both users see a **"⚡ Ready Up — Start Draft"** button in the lobby.
   When both are ready, the backend generates pairs and broadcasts
   `draft_started`.
2. Each pair is shown to both users at the same time. They tap their
   choice **privately** — the opponent doesn't know what they picked.
3. When both have submitted, the backend resolves the pair:
   - **Different picks**: each user gets the player they picked.
   - **Same pick (tiebreak)**: capped random — see [Tiebreak fairness](#tiebreak-fairness).
4. After all pairs resolve, both users advance to "Pick Your XI" with
   their drafted roster.

### Why pair only within zones?

To make the pick meaningful. Pairing across zones (Kane vs Neuer) is
nonsensical — you'd be choosing between a striker and a goalkeeper. Pairing
inside a zone means you're picking between two similar-role players, where
stats are comparable and the decision is real.

The five zones:

| Zone | Positions |
|---|---|
| GK | TW (goalkeeper) |
| DEF | CB, LB, RB |
| CDM | CDM, CM |
| WIDE | LM, RM, LW, RW |
| ATK | CAM, CF, ST |

### Why the leftover is a sub (not Kane)

Within each zone the order is **starters first, subs second** (each tier
shuffled). When a zone has an odd total, the leftover (the last unpaired
entry) is always a sub — never a starter — unless that zone happens to have
only starters and no subs (rare edge case).

So Kane (a starter) can't be a draft leftover. He'll always be paired.

### Could we get to a perfectly even draft (no leftovers)?

Only if every zone had an even count. That depends entirely on the loaded
data — for the demo match (`DFL-MAT-111111`), 4 of the 5 zones happen to have
odd counts, leaving 4 auto-picks. Different match, different distribution.

Auto-picks are still distributed fairly — they go alternately between users
(after a shuffle) so squad sizes stay balanced ±1 across the draft.

### Tiebreak fairness

When both users pick the same player from a pair, the backend rolls a
**capped coin**:
- Real `random.choice` per tiebreak (preserves the gamble).
- BUT the gap between users' tiebreak wins can never exceed 1. If one user
  is already 1 ahead and the random outcome would push the gap to 2, the
  call is forced to the trailing user.

The frontend shows a coin-flip animation (~1s) before revealing the result.
The reveal banner mentions `· balance corrected` when the cap kicked in, so
you can see when the script overrode the coin.

---

## Mini-games

Live reaction-based games triggered by qualifying match events.

### OFFSIDE_REFLEX (currently shipping)

- Triggered by the first `offside` event in a match.
- A modal pops with a horizontal pitch lane: defender line at x=60%, an
  attacker dot animating from left to right. **Tap when the attacker
  crosses the defender line.**
- Game duration: 8 seconds. The "moment of truth" is at 4 seconds in
  (when the attacker hits the line).
- Score brackets: ≤150 ms = +6 points, ≤300 ms = +4, ≤600 ms = +2,
  else 0. **Closest tap** gets a +1 bonus.

### Frontend-driven trigger

The modal opens **the instant the offside event reveals in the feed**, not
when the backend processes it. Per-match idempotent via `sessionStorage`
(`minigame_fired_${matchId}_${startedAt}`) — the same mini-game can't
re-trigger after a refresh.

### Solo mode bot

When only one human is in the room, a bot opponent fills the other slot.
Random tap timing within ±150-600 ms of the offside moment, 50% accurate.
Reaction delay 400-1800 ms after game start.

### Multi-user resolve

Each user posts only their own delta to `POST /rooms/{code}/minigame-score`.
Backend idempotency is per-`(gameId, userId)` — both users always get their
result broadcast, deltas accumulate across messages so each modal shows both
players' outcomes.

---

## AI Match Director (Bedrock)

A `claudiu-director-handler` Lambda calls **Amazon Nova Micro** via the
Bedrock Converse API. Host clients post a state snapshot (recent events,
score, member rosters, minigames already fired) on each event reveal; Claude
returns one of three actions in JSON:

- `start_minigame` — fire a mini-game with a personalized prompt
- `commentate` — emit a one-line reaction
- `wait` — do nothing this tick

The Director runs alongside the rule-based trigger map. If Bedrock errors,
JSON parse fails, or the route is down, the rule-based fallback still fires
the modal — the AI is additive, not load-bearing.

---

## Scoring

| Source | Delta |
|---|---|
| Goal (passive) | +5 |
| Assist | +3 |
| Save | +3 |
| Yellow card | -1 |
| Mini-game tap (≤150ms) | +6 |
| Mini-game tap (≤300ms) | +4 |
| Mini-game tap (≤600ms) | +2 |
| Closest tap bonus | +1 |

All deltas are clamped to ±200 server-side to prevent client tampering.
Leaderboard pushes via `score_update` over the room WebSocket.

---

## Stack

- **Frontend**: React + Vite, deployed to CloudFront via S3
- **Auth**: AWS Cognito User Pools (per-tab `sessionStorage` for tokens)
- **Backend**: Python 3.14 Lambdas behind API Gateway (REST) +
  WebSocket API Gateway for real-time
- **Storage**: DynamoDB (`claudiu-rooms`, `claudiu-matches`,
  `claudiu-player-lookup`, `claudiu-match-events`, `claudiu-ws-connections`)
- **Compute**: EventBridge Scheduler for replay event dispatch, SQS FIFO for
  ordered processing, AWS Bedrock (Nova Micro) for the AI Director
- **Infra**: CloudFormation templates in `infra/compute/`

---

## Running locally

The fastest path is just to use the deployed frontend at the CloudFront URL —
sign up via Cognito, create or join a room, no local setup needed.

If you want to run the **frontend dev server** against the deployed backend:

```bash
git clone https://github.com/ClaudiuAWS/claudiu.git
cd claudiu/frontend
cp .env.example .env       # then fill in the four VITE_* values
npm ci
npm run dev                # http://localhost:5173
```

The four values in `.env.example` come from the deployed AWS stacks
(`cognito-claudiu-auth`, `api-gateway-claudiu`, `claudiu-ws-api`). They're
not committed; ask a teammate to share their current values, or look them up
via `aws cloudformation describe-stacks` if you have AWS access.

### Backend / infra changes

Lambda code changes auto-deploy on `main` via the workflows in
`.github/workflows/deploy-*.yml`. CloudFormation stacks (`api-gateway-claudiu`,
the IAM role stacks, etc.) require manual `aws cloudformation deploy` for
the stacks that don't yet have a workflow. See `infra/compute/`.

### Reloading match data

The four source XMLs (`positions.xml`, `kpi.xml`, `events.xml`, `match.xml`)
are gitignored because they're too large. You only need them if you want to
re-populate DynamoDB with fresh match data via `data/loader/main.py`. Match
data is already loaded in the deployed DDB tables, so most local development
doesn't need this.

To reset the deployed match back to `upcoming` for a fresh replay:

```bash
python data/reset_match.py    # uses [hackathon] AWS profile
```

---

## Repository layout

```
backend/
  rooms/             # room create/join, draft, minigame score, team selection
  matches/           # match metadata + events feed
  event-processor/   # consumes replay events, applies passive scoring
  replay-emitter/    # EventBridge-driven event dispatcher
  director-handler/  # AI Match Director (Bedrock)
  ws-handler/        # WebSocket $connect / $disconnect / channel subscribe
  shared/            # ws.push_to_channel utility, constants
frontend/
  src/pages/         # HomePage, LobbyPage, MatchPage, ProfilePage, etc.
  src/components/    # match feed, lobby, mini-game UIs, etc.
  src/hooks/         # useRoom, useMatch, useDraft, useMiniGame, useAuth
infra/compute/       # CloudFormation: api-gateway.yml, lambdas-*.yml
data/                # match dataset loader + reset scripts
```
