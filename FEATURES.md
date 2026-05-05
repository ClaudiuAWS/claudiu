# Fantasy Football Draft Battle — Feature Specification

## XML Event Audit

All event types extracted from `data/events.xml` (1,719 total `<Event>` elements):

| XML Element | Count | Key Attributes | Notes |
|---|---|---|---|
| `Play` + `Pass` | 1,164 | `Player`, `Recipient`, `Team`, `Evaluation`, `Distance` | Most common, ball movement |
| `Play` + `OtherBallAction` | 173 | `Player`, `Team` | Catches, clearances |
| `TacklingGame` | 155 | `Winner`, `Loser`, `WinnerTeam`, `LoserTeam`, `PossessionChange`, `Type` | Duels |
| `ThrowIn` | 33 | `Team` | Throw-ins |
| `ShotAtGoal` | 31 | `Player`, `Team`, `xG`, `TypeOfShot`, `InsideBox`, `DistanceToGoal`, `ChanceEvaluation` | On-target/off-target shots with xG |
| `BallClaiming` | 28 | `Type`: `BallClaimed`/`BallHeld`/`InterceptedBall` | Possession duels |
| `FreeKick` | 27 | `Team` | All free kicks |
| `Cross` | 26 | `Player`, `Team` | Crossing events |
| `Foul` | 25 | `Fouler`, `Fouled`, `TeamFouler`, `TeamFouled`, `FoulType`: `foul`/`handBall` | Fouls with both players named |
| `GoalKick` | 14 | `Team` | GK clearances |
| `Substitution` | 10 | `PlayerIn`, `PlayerOut`, `PlayingPosition`, `Team` | Has both player IDs |
| `ShotWide` | 10 | `Player`, `Team` | Off-target shots |
| `SavedShot` | 9 | `GoalKeeper`, `SaveType`, `SaveResult`, `SaveEvaluation` | GK saves with result |
| `CornerKick` | 8 | `Team`, `Side`, `TargetArea`, `Rotation` | Corners |
| `BlockedShot` | 7 | `Player`, `GoalPrevented` | Blocked shots |
| `SuccessfulShot` | 5 | `Player`, `Assist`, `GoalZone` (1–18 grid), `CurrentResult`, `Solo`, `AssistType` | Goals |
| `Caution` | 4 | `Player`, `Team`, `CardColor`: `yellow`, `Reason` | Yellow cards |
| `KickOff` | 7 | `GameSection`: `firstHalf`/`secondHalf` | Match start and second half |
| `Run` | 3 | `Player`, `Team` | Notable sprints |
| `Offside` | 3 | `Player`, `Team` | ✅ Present |
| `Nutmeg` | 3 | `Player`, `AffectedPlayer`, `Team`, `AffectedTeam` | Skill move |
| `SpectacularPlay` | 2 | `Player`, `Team`, `Type`: `backheel` | Skill highlights |
| `FinalWhistle` | 2 | `GameSection`: `firstHalf`/`secondHalf`, `FinalResult` | Halftime + fulltime |
| `AdditionalTimeDisplayed` | 2 | `Minute` | Stoppage time board |
| `VideoAssistantAction` | 1 | `ProofedEvent`: `penalty`, `RefDecision`, `FinalDecision`, `TimestampStartAction`, `TimestampEndAction` | VAR review |
| `Penalty` | 1 | `ProspectiveTaker`, `CausingPlayer`, `GoalkeeperMovement`, `RetakenPenalty`, `GoalkeeperBehaviour` | ✅ Present |
| `PlayerNotSentOff` | 1 | `Player`, `Team`, `Type`: `yellowRed`, `Reason`, `RefDecisionEvaluation`: `controversial` | Disputed red card |
| `OtherPlayerAction` | 1 | `Player`, `Team`, `ChangeOfCaptain` | Captain change |

### Events NOT present in the XML data

| Requested name | Reality |
|---|---|
| `DISALLOWED_GOAL` | Not a distinct event. Infer from `VideoAssistantAction` where `FinalDecision="eventWithdrawn"`. Not in our match (VAR confirmed penalty here). |
| `THROUGH_BALL` | No element. Through balls are encoded as `<Pass>` sub-elements with `Direction="throughBall"` possibly — no separate type. |
| `PENALTY_GOAL` / `PENALTY_SAVE` | Not separate events. A `<Penalty>` element is followed by a `<SuccessfulShot>` or `<SavedShot>` event in sequence. |
| `VAR_CHECK` (as offside) | Only one `<VideoAssistantAction>` in the data; its `ProofedEvent` is `penalty`, not `offside`. No offside-VAR example in this match. |
| `REACTION_RUSH` | Mini-game concept, not a match event type. |
| `HALFTIME` / `FULLTIME` | Not named events. Detected via `<FinalWhistle GameSection="firstHalf">` and `<FinalWhistle GameSection="secondHalf">`. |

---

## Implemented Features

### 1. Draft Battle

- 32 draftable players from Bundesliga data (40 total; 8 bench-only excluded).
- Zone-paired draft pool:
  - GK vs GK
  - DEF vs DEF
  - CDM/CM together
  - Wide players paired (LM/RM/LW/RW)
  - Attackers paired (ST/CF)
- 16 draft rounds.
- User picks 1 of 2 each round; opponent auto-receives the other.
- User ends with 16 players; opponent ends with 16 players.
- Round counter: "Round X of 16".
- Opponent picks persisted: `localStorage` key `draft_opponent_picks_${roomCode}`.

### 2. Select XI Phase

- Football pitch SVG (111×74 viewBox, landscape rendered in portrait).
- Starters shown as colored position bubbles placed by formation template.
- Bench strip: horizontal scrollable row of non-starters.
- 3-case swap mechanic:
  - Bench → pitch (XI < 11): auto-add to first matching open slot.
  - Bench → pitch (XI full): tap starter first (green glow + ⇄ icon), then bench player to swap.
  - Pitch ↔ Pitch: tap two starters; formation auto-reassigns from position codes.
- Formation auto-detects live as XI composition changes.
- Confirm button enabled only when exactly 11 selected.

### 3. Preview Phase

- Full pitch display of confirmed XI with formation label.
- "Lock In Squad" submits 11 player IDs to backend.

### 4. Match Page

- Live match events with accurate minute timestamps.
- Home and away fantasy squad pitches visible simultaneously.
- Away squad loads from `localStorage` fallback for solo testing.
- Player stats popup on bubble tap.
- Live leaderboard for room members.
- Event feed supports 10 event types: `goal`, `card`, `substitution`, `halftime`, `secondhalf`, `fulltime`, `saved_shot`, `nutmeg`, `spectacular_play`, `offside`.
- `SkillFlashBadge` component: corner badge animates in for 3 seconds on `nutmeg`/`spectacular_play` events (visual display only; multi-user tap race is a remaining feature — see R5c).
- Squad pitch uses dynamic formation row spacing: row y-positions are computed from active positional tiers (GK/DEF/CDM/CAM/FWD present in the XI) so every formation renders with even gaps regardless of tier count.
- Player photos served from S3/CloudFront CDN (`d1t5xvsturq92p.cloudfront.net`); SofaScore URL used as browser-side fallback when server-side download is blocked.

### 5. Position System

- 13-type granular classification: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST, CF.
- 5 visual tiers with colors: GK (yellow), DEF (blue), CDM (emerald), ATM (orange), FWD (red).
- 7 formation templates: 4-2-3-1, 4-3-3, 4-4-2, 3-5-2, 5-3-2, 5-2-3, 3-4-3.
- Versatile slot matching (e.g. LW fills wide ATM or FWD slot).

### 6. Backend / Infrastructure

- AWS Lambda + DynamoDB + API Gateway WebSocket.
- Room management: create, join, leave, start match.
- Team selection (11 player IDs) persisted per room/user.
- Player data: Bayern Munich vs HSV, Bundesliga API.
- Match events scheduled by absolute game-time offset (no second-half drift).
- Event-processor handles all 10 feed event types including `nutmeg`, `spectacular_play`, `offside`, and `saved_shot`.
- Passive fantasy scoring (applied immediately on event fire, no mini-game needed):
  - `goal` scorer: **+5 pts**; assist: **+3 pts**; valid-opponent bonus (scorer vs. opponent GK): **+2 pts extra**; opponent GK who conceded: **−1 pt**.
  - `card` yellow: **−1 pt**; red: **−3 pts**.
  - `saved_shot` GK: **+3 pts**.
- Player images loaded idempotently to S3 (skips re-upload if already present via `head_object` check).

---

## Remaining Features

### Core Rule: Fantasy Ownership Context

Before any mini-game starts or resolves, compute ownership context:

```js
{
  roomCode, matchEventId, matchEventType,
  involvedPlayerIds, involvedPlayerNames, involvedTeamIds,
  userAId, userBId, userAStartingXI, userBStartingXI,
  userAOwnsInvolvedPlayer, userBOwnsInvolvedPlayer,
  bothOwnInvolvedPlayer, neitherOwnsInvolvedPlayer,
  advantagedUserId,   // set only if exactly one user owns the key player
  defensiveUserId,    // set if goalkeeper/defender belongs to one user
  neutralEvent        // true if no clear fantasy ownership advantage
}
```

**Critical rule**: never assume User A = home team or User B = away team. Ownership is determined by which fantasy XI contains the involved player's ID.

---

### Feature R1: Mini-game Infrastructure

**Backend state model** (DynamoDB):
- PK: `ROOM#${roomCode}`, SK: `MINIGAME#${gameId}`
- Fields: `gameId`, `roomCode`, `type`, `status` (`pending|active|resolved|expired`), `title`, `prompt`, `config`, `startedAt`, `endsAt`, `createdBy` (`system|ai`), `relatedMatchEventId`, `ownershipContext`, `participants`, `submissions`, `result`

**Rules**:
- Only one active mini-game per room at a time.
- 60–90 second cooldown between mini-games.
- Mini-game creation failure must not interrupt match event flow.

**WebSocket message types to add**:
- `MINIGAME_START`
- `MINIGAME_SUBMIT`
- `MINIGAME_RESULT`
- `MINIGAME_EXPIRED`
- `LEADERBOARD_UPDATE`

**Backend functions to add**:
- `startMiniGame(roomCode, type, config, relatedMatchEventId, createdBy)`
- `submitMiniGameAnswer(roomCode, gameId, userId, payload)`
- `resolveMiniGame(roomCode, gameId)`
- `expireMiniGame(roomCode, gameId)`
- `broadcastMiniGameUpdate(roomCode, message)`
- `computeEventOwnershipContext(roomCode, matchEvent)`
- `applyMiniGameScore(roomCode, gameId, result)`

---

### Feature R2: Frontend Mini-game Modal (`MatchMiniGameModal`)

Reusable component that overlays the match page.

Behavior:
- Appears on `MINIGAME_START` WebSocket message.
- Shows: title, prompt, countdown timer, game-type-specific UI.
- Disables input after user submits; shows waiting state.
- Shows result (winner, points gained) before closing.
- Must not crash if data is missing.
- Supports solo mode with bot opponent.

Supported game types: `PENALTY_SHOOTOUT`, `OFFSIDE_REFLEX`, `SHOT_CALL`, `VAR_VERDICT`, `QUIZ_BATTLE`.

Skill flash interactions (`SKILL_FLASH`) use a separate lightweight non-modal component — a corner badge overlay, not this modal.

---

### Feature R3: Penalty Shootout (`PENALTY_SHOOTOUT`)

**XML trigger**: `<Penalty>` element.

Attributes available: `ProspectiveTaker` (player ID of shooter), `CausingPlayer`, `GoalkeeperMovement`, `GoalkeeperBehaviour`, `RetakenPenalty`.

The result arrives as a subsequent `<SuccessfulShot>` (goal) or `<SavedShot>` (save) event in the event stream — they are not a single combined element.

**UI**: 2D goal with 9 clickable zones (3×3 grid: top/mid/low × left/center/right). Ball animation toward selected zone; keeper dive animation; result: GOAL or SAVED.

**Ownership logic**:
- If `ProspectiveTaker` is in User A's XI → User A gets shooter advantage.
- If the opposing goalkeeper is in User B's XI → User B gets keeper advantage.
- Neither/both → neutral challenge.

**Scoring**:
- Successful goal: +100
- Saved/missed: +25 participation
- Fastest successful scorer: +50 bonus
- Owns penalty taker: +25 ownership bonus
- Owns goalkeeper when save happens: +50 save ownership bonus

---

### Feature R4: Offside Reflex (`OFFSIDE_REFLEX`)

**XML triggers**:
- `<Offside>` (3 events) — has `Player` and `Team`.
- `<VideoAssistantAction>` (1 event) — has `ProofedEvent`, `RefDecision`, `FinalDecision`.

**Not present**: `DISALLOWED_GOAL` as a named event. If needed, infer from `VideoAssistantAction` where `FinalDecision="eventWithdrawn"` — but this does not occur in the current dataset.

**UI**: 2D pitch lane. Defender line fixed. Attacker marker moves horizontally. User taps when attacker crosses the offside line. Timing delta shown after result.

**Config**: `offsideMomentMs`, `startTime`, `durationMs`, `defenderLineX`, `attackerSpeed`.

**Submission**: `clickedAt` timestamp. Backend calculates absolute delta from `offsideMomentMs`.

**Ownership logic**:
- `<Offside Player="...">` identifies the offside player directly.
- If that player is in one user's XI, the opponent gains bonus for spotting it accurately.
- If neither/both own the player → equal competition.

**Scoring**:
- Within 150ms: +120
- Within 300ms: +80
- Within 600ms: +40
- Beyond 600ms: +0
- Closest user bonus: +50
- Owns the offside player + accurate reaction: +20 recovery bonus instead of zero

---

### Feature R5: Shot Call (`SHOT_CALL`)

**XML trigger**: `<ShotAtGoal>` where `ChanceEvaluation="chance"` AND `xG > 0.15` AND cooldown is clear. Fires at most 2 times per match.

Attributes available: `Player`, `Team`, `xG`, `TypeOfShot`, `InsideBox`, `DistanceToGoal`, `AngleToGoal`, `BuildUp`, `CounterAttack`.

Result is determined by the next event immediately following the `<ShotAtGoal>` in the event stream: `<SuccessfulShot>` = GOAL, anything else (`<SavedShot>`, `<ShotWide>`, `<BlockedShot>`) = NO GOAL. Backend must look ahead by one event before broadcasting.

**UI**: Mini pitch diagram with shot position dot. Large xG meter showing the value (e.g. `xG: 0.34`). Two big buttons: **GOAL** / **NO GOAL**. 5-second countdown. After time: result animates in (ball into net or keeper save). Ownership banner if shooter is in user's XI: "YOUR PLAYER IS SHOOTING".

**Ownership logic**:
- If shooter is in user's XI → show banner + +15 ownership bonus regardless of prediction accuracy.
- Both users predict independently; no hidden information.

**Scoring**:
- Fast + correct (< 2s): +80
- Slow + correct (2–5s): +40
- Wrong: +10 participation
- Owns shooter: +15 ownership bonus

---

### Feature R5b: VAR Verdict (`VAR_VERDICT`)

**XML trigger**: `<VideoAssistantAction>` (1x in match). Always fires when present.

Attributes available: `ProofedEvent` (e.g. `"penalty"`), `RefDecision`, `FinalDecision`, `TimestampStartAction`, `TimestampEndAction`, `TeamChallenged`, `RefDecisionEvaluation`.

Answer: `FinalDecision`. Options: `"eventGiven"` = Decision Stands / decision in favour; `"eventWithdrawn"` or `"decisionOverturned"` = Overturned.

**UI**: VAR screen graphic — TV-style "VAR REVIEW" banner. Shows what is being reviewed (`ProofedEvent`). Countdown timer set to match the real review duration from `TimestampStartAction`/`TimestampEndAction` (capped at 20 seconds). Two buttons: **"STANDS"** / **"OVERTURNED"**. After time: result reveals with referee animation.

Ownership context: if `TeamChallenged` maps to a player in one user's XI, show "This call affects [User]'s squad".

**Scoring**:
- Fastest correct: +100
- Correct but slower: +60
- Wrong: +10 participation
- Squad affected + correct: +20 bonus

---

### Feature R5c: Skill Flash (`SKILL_FLASH`)

> **Status: Partially implemented.** The `SkillFlashBadge` UI component exists and displays automatically for 3 seconds on `nutmeg`/`spectacular_play` events via the existing `match_update` WebSocket message. What remains: multi-user tap race, server-side first-tap resolution, dedicated `SKILL_FLASH_START` / `SKILL_FLASH_RESULT` WebSocket message types, and the point awards below.

**XML triggers**: `<Nutmeg>` (3x) and `<SpectacularPlay>` (2x). Fires every time — not subject to full mini-game cooldown.

**UI**: Non-modal. A small badge slides in from the right edge of the screen — 120px wide, dark background, e.g. "NUTMEG! TAP!" or "BACKHEEL! TAP!". First user to tap within 2 seconds wins. Badge disappears automatically whether tapped or not. Never blocks the match feed or pitch view.

Shows player name from `Player` attribute. If that player is in a user's XI, the badge shows their color accent.

**Scoring**:
- First to tap: +20
- Second to tap: +5
- No tap: +0

**Implementation**: Separate `SkillFlashBadge` component (not `MatchMiniGameModal`). Triggered by WebSocket message type `SKILL_FLASH_START`. No DynamoDB write needed — backend resolves in-memory and broadcasts `SKILL_FLASH_RESULT` with winner ID.

---

### Feature R6: Quiz Battle (`QUIZ_BATTLE`)

**XML triggers**:
- `<FinalWhistle GameSection="firstHalf">` → halftime quiz.
- `<FinalWhistle GameSection="secondHalf">` → fulltime quiz.
- `<SuccessfulShot>` → optional goal-moment quiz.
- `<Substitution>` → optional sub-moment quiz.
- Quiet periods with no events for 60+ seconds → AI host may trigger.

**UI**: Question text + 4 answer buttons + 10-second countdown. Selected answer locked in. Correct answer revealed after time. Fastest correct user shown.

**Question types** (use match context, never generic trivia):
- Which fantasy manager benefits more from this goal? (based on `SuccessfulShot.Player` ownership)
- Who owns the assist player? (based on `SuccessfulShot.Assist` ownership)
- Which manager has more defenders in their XI right now?
- Which drafted player has scored the highest xG this half? (from `ShotAtGoal.xG` accumulation)
- Whose goalkeeper has made more saves? (from `SavedShot.GoalKeeper` ownership)
- Fastest player involved in a `TacklingGame` this half?

**Scoring**:
- Fastest correct: +100
- Correct but slower: +60
- Wrong: +0
- Participation: optional +10

---

### Feature R7: Mini-game Event Trigger Map

| XML Event | Interaction type | Notes |
|---|---|---|
| `<Penalty>` | `PENALTY_SHOOTOUT` (full modal) | Always fires |
| `<Offside>` | `OFFSIDE_REFLEX` (full modal) | Fires on first occurrence only; others appear in feed |
| `<VideoAssistantAction>` | `VAR_VERDICT` (full modal) | Always fires when present |
| `<ShotAtGoal>` where `xG > 0.15` + `ChanceEvaluation="chance"` | `SHOT_CALL` (full modal) | Max 2 per match; cooldown applies |
| `<FinalWhistle GameSection="firstHalf">` | `QUIZ_BATTLE` (full modal) | Always fires |
| `<FinalWhistle GameSection="secondHalf">` | `QUIZ_BATTLE` (full modal) | Always fires |
| `<Nutmeg>` | `SKILL_FLASH` (corner badge) | Always fires; no cooldown |
| `<SpectacularPlay>` | `SKILL_FLASH` (corner badge) | Always fires; no cooldown |
| `<SuccessfulShot>` | Passive scoring + feed event | +100 shooter owner, +50 assist owner |
| `<SavedShot>` | Passive scoring + feed event | +50 GK owner |
| `<Caution>` | Passive scoring + feed event | -20 card recipient owner |
| `<BlockedShot>` where `GoalPrevented="true"` | Passive scoring + feed event | +30 blocker owner |
| `<Substitution>` | Feed event + XI tracking update | No points; update ownership context |
| `<PlayerNotSentOff>` | Feed event | Controversial call shown in AI host panel |
| `<TacklingGame>` | Feed event | Win/loss shown if owned player involved |
| `<Run>` | Feed event | Sprint highlight |
| `<ShotWide>` | Feed event | xG accumulation |
| `<CornerKick>` | Feed event | Feed only |
| `<FreeKick>` | Feed event | Feed only |
| `<GoalKick>` | Feed event | Feed only |
| `<ThrowIn>` | Feed event | Feed only |
| `<KickOff>` | Half-start marker | No interaction |
| `<AdditionalTimeDisplayed>` | Feed event | Stoppage time display |
| `<OtherPlayerAction>` | Feed event | Captain change shown if relevant |
| `<Pass>` / `<OtherBallAction>` | Tracking only | Never triggers interaction |
| `<BallClaiming>` | Tracking only | Never triggers interaction |

**Cooldown rules (confirmed)**:
- Full modal mini-games: 60-second cooldown between resolutions. No second mini-game opens until the previous resolves + 60 seconds.
- `SKILL_FLASH`: not subject to mini-game cooldown. Can fire during any state.
- Passive scoring: always runs, never blocked by cooldown.
- Match event broadcast is never delayed — mini-game trigger runs asynchronously after broadcast.

**Estimated interactive moments per match (this dataset)**:
- 1× PENALTY_SHOOTOUT
- 1× OFFSIDE_REFLEX (of 3 offside events)
- 1× VAR_VERDICT
- 2× SHOT_CALL (from 31 ShotAtGoal events, pick xG > 0.15)
- 2× QUIZ_BATTLE (halftime + fulltime)
- 5× SKILL_FLASH (3 nutmegs + 2 spectacular plays)

Total: **7 full mini-games + 5 skill flashes** across 90 simulated minutes.

---

### Feature R8: Solo Mode Bot Support

Required because a single user can test the full match experience via localStorage fallback.

Bot behavior per mini-game:
- **PENALTY_SHOOTOUT**: random zone; delay 700–2500ms.
- **OFFSIDE_REFLEX**: random timing within ±800ms of offside moment; accurate ~50% of the time.
- **SHOT_CALL**: random answer (GOAL/NO GOAL); correct ~55% of the time (slightly better than chance, not perfect); delay 800–3000ms.
- **VAR_VERDICT**: random pick (Stands/Overturned); delay 1000–4000ms to simulate reading the screen.
- **QUIZ_BATTLE**: random answer; slightly higher hit rate (~40%) if answer is derivable from ownership context.
- **SKILL_FLASH**: bot taps after random 400–1800ms. Never instant (would feel unfair).

Bot uses opponent localStorage XI (`draft_opponent_picks_${roomCode}`) for ownership context. If unavailable, bot plays as neutral.

Every mini-game must complete with zero real opponents. No game waits longer than its countdown timer.

---

### Feature R8: Leaderboard Integration

Use existing leaderboard. Add mini-game points to current score.

After mini-game resolves:
- Write point deltas to DynamoDB.
- Broadcast `LEADERBOARD_UPDATE`.
- Show points gained in the result banner.
- Show reason text when possible.

Example point breakdown displayed to user:
```
+100  goal owned
+50   fastest bonus
+25   owns penalty taker
────
+175  this round
```

Direct scoring events (not mini-games) applied to leaderboard:

> **Implemented values** (live in `event-processor/service.py`):
> - `<SuccessfulShot>` (goal): **+5** scorer, **+3** assist, **+2** valid-opponent bonus, **−1** beaten GK.
> - `<SavedShot>`: **+3** GK owner.
> - `<Caution>`: **−1** yellow card, **−3** red card.

> **Target values** (to scale up as mini-game system matures):
> - `<SuccessfulShot>`: +100 to user who owns `Player`; +50 to user who owns `Assist`.
> - `<SavedShot>`: +50 to user who owns `GoalKeeper`.
> - `<Caution>`: −20 from user who owns `Player`.

- `<PlayerNotSentOff>`: no deduction (call was reversed); +10 curiosity bonus if owned.
- `<Substitution>`: no points; update starting XI tracking.

---

### Feature R9: Agentic AI Compatibility Layer

Structured action format the backend must accept and validate:

```json
{
  "action": "START_MINIGAME",
  "gameType": "PENALTY_SHOOTOUT | OFFSIDE_REFLEX | QUIZ_BATTLE",
  "title": "...",
  "prompt": "...",
  "durationSeconds": 10,
  "reason": "...",
  "relatedMatchEventId": "...",
  "ownershipContext": {}
}
```

Backend validation rules:
- `action` must be `START_MINIGAME`.
- `gameType` must be one of the three allowed types.
- `durationSeconds` must be 5–30.
- `title` ≤ 80 chars; `prompt` ≤ 300 chars.
- Room must exist and match must be active.
- No active mini-game already running.
- Cooldown must allow it.
- `relatedMatchEventId` must exist in DynamoDB if provided.

Initial implementation: rule-based logic produces this same JSON format. Amazon Bedrock replaces the rule-based layer later without changing the validation contract.

---

### Feature R10: AI Match Host Panel

Visual panel on match page. Initially rule-based; Bedrock-powered later.

Triggered commentary examples:
- On `<Penalty>`: "Penalty pressure! [Taker name] is in [User A]'s XI — this could swing the leaderboard."
- On `<Offside>`: "VAR check! Time for an Offside Reflex challenge."
- On `<FinalWhistle GameSection="firstHalf">`: "Halftime! Let's test who understands the draft battle best."
- On `<SuccessfulShot>`: "[Scorer] nets — [User A] holds this asset."
- On `<Nutmeg>` or `<SpectacularPlay>`: "[Player] with a moment of magic — owned by [User B]."
- On `<SavedShot>`: "Great stop! [Goalkeeper] is in [User]'s XI."

Rules:
- Never reference real team allegiance.
- Always reference fantasy ownership by user.
- Never assume home pitch user = home team supporter.

---

### Feature R11: Visual Polish

Required animations:
- Modal entrance: slide-up or fade-in.
- Countdown timer: live ring or progress bar.
- Penalty: ball arcs toward selected zone; keeper dives.
- Offside: attacker marker slides horizontally across pitch lane.
- Quiz: answer buttons highlight green/red after reveal.
- Result banner: points fly in or slide up.
- Leaderboard rows glow briefly when updated.

Approach: 2D CSS animations first. CSS `transform`/`transition` only. No Three.js or WebGL unless 2D is fully stable.

---

### Feature R12: Dev Test Controls

Match page dev panel (hidden in production via `VITE_DEV_CONTROLS=true` env flag):
- Trigger `PENALTY_SHOOTOUT` manually.
- Trigger `OFFSIDE_REFLEX` manually.
- Trigger `QUIZ_BATTLE` manually.
- Clear active mini-game.
- Simulate bot submission.

---

### Feature R13: Reliability Requirements

Must handle gracefully (no crash, no match interruption):
- User submits twice → ignore second submission.
- User reconnects mid mini-game → re-send current state via `MINIGAME_START`.
- Mini-game expires before user submits → auto-resolve with submitted answers only.
- WebSocket message arrives out of order → check `status` field before acting.
- Mini-game result arrives after modal closed → silently update leaderboard.
- Room has only one user → bot fills in.
- Opponent is localStorage fallback → bot uses that XI for ownership context.
- Involved player missing from local data → show "unknown player", continue.
- Match event has no player ID → run neutral mini-game.
- Invalid AI action (bad gameType, bad duration) → reject, log, continue match.
- DynamoDB write fails → match continues; mini-game is skipped silently.
- Leaderboard update fails → retry once; if still failing, continue without update.

---

### Feature R14: Acceptance Criteria

Implementation is complete when:

1. Existing draft flow still works.
2. Existing Select XI flow still works.
3. Existing preview/lock-in flow still works.
4. Existing match page still works.
5. `<Penalty>` event opens `PENALTY_SHOOTOUT` modal for all room users.
6. Users can select a penalty zone.
7. Result is broadcast to all users.
8. Leaderboard updates with correct owner bonuses.
9. `<Offside>` or `<VideoAssistantAction>` opens `OFFSIDE_REFLEX` modal.
10. Closest timing tap wins; result broadcast.
11. `<FinalWhistle GameSection="firstHalf">` opens `QUIZ_BATTLE`.
12. Quiz question uses real fantasy ownership context from the match.
13. Solo mode completes every mini-game with bot opponent.
14. Only one mini-game active at a time per room.
15. Cooldown enforced between mini-games.
16. All scoring uses fantasy XI ownership, never real team allegiance.
17. Backend accepts and validates `START_MINIGAME` structured action format.
18. AI Host panel displays ownership-aware commentary.
19. No code path assumes home user = home team.
20. App remains stable when mini-game data is incomplete or missing.

---

### Implementation Order

1. Mini-game backend state model + WebSocket message types (`MINIGAME_START`, `MINIGAME_SUBMIT`, `MINIGAME_RESULT`, `MINIGAME_EXPIRED`, `SKILL_FLASH_START`, `SKILL_FLASH_RESULT`, `LEADERBOARD_UPDATE`).
2. Frontend `MatchMiniGameModal` shell with countdown + `SkillFlashBadge` shell.
3. Passive scoring connected to leaderboard (`<SuccessfulShot>`, `<SavedShot>`, `<Caution>`).
4. Penalty Shootout end-to-end (`<Penalty>` → modal → result → leaderboard).
5. Solo bot support for all game types.
6. Offside Reflex (`<Offside>` → timing modal → leaderboard).
7. Shot Call (`<ShotAtGoal>` xG filter → prediction modal → leaderboard).
8. VAR Verdict (`<VideoAssistantAction>` → verdict modal → leaderboard).
9. Skill Flash (`<Nutmeg>` / `<SpectacularPlay>` → corner badge → leaderboard).
10. Quiz Battle (`<FinalWhistle>` halftime + fulltime → context questions → leaderboard).
11. Rule-based AI-compatible `START_MINIGAME` action layer.
12. AI Match Host panel (commentary referencing fantasy ownership).
13. Visual polish — animations, result banners, point fly-ins.
14. Dev test controls panel (hidden behind `VITE_DEV_CONTROLS=true`).
