# Brezn — Fan Squad submission

**Challenge:** *Fan Squad — A Real-Time Social Match Experience* (Level 300, AWS World Sports Innovation Cup 2026)

---

## The problem (from the brief)

> Yet most fan-facing digital products today treat each user as an
> individual in isolation. There is a clear opportunity to build
> experiences where fans engage together — competing, collaborating, and
> sharing moments in real time as the match unfolds.

## The solution

**Brezn** is a Bundesliga-themed second-screen app where 2+ fans:
1. **Draft squads against each other** before kickoff (FIFA-UT-style pair pick'em with a 15s auto-pick timer)
2. **Watch the match together in real time** with WebSocket-synced state, AI commentary, and shared reactions
3. **Play mini-games triggered by what happens on the pitch** (offsides → reflex test, shots → shot-call, halftime → match-aware quiz, penalty → shootout)
4. **Earn brezn credits and badges** that persist across matches, with a shop full of cosmetics and match-perks to spend them on

The brand is unmistakably Bavarian: a cartoon pretzel mascot, a BREZN wordmark made of pretzel-shaped letters, a German football emoji pack (🍺 🌭 👑 🐐 🎺 🏆), and Bundesliga red everywhere.

---

## Coverage vs the three core pillars (verbatim from the brief)

### 🎯 MULTIPLAYER — *"more than one user, connected in real time or near-real time"*

| Feature | Where it lives | Multiplayer mechanic |
|---|---|---|
| Party rooms | `useRoom` + `room#{code}` WS channel | All members see synchronized state |
| Friend invites | `InviteListener` + `friends-handler` Lambda | Instant-navigate optimistic UI |
| Coordinated draft | `TeamSelectionModal` + `submit_draft_pick` Lambda | Both users pick simultaneously, tiebreak on conflict |
| Shared reactions | `ReactionsOverlay` + `cheer` REST + WS broadcast | Cheers float on every member's screen |
| Captain suggestion | Brezn Agent (Bedrock Nova Micro) | Recommends a captain from your XI |
| Match-end celebration | `MatchEndCelebration` | Confetti + sting fires for all members |

### ⚡ REAL-TIME DATA — *"the match data is your heartbeat"*

The XML replay (one Bundesliga match) is parsed into `claudiu-match-events`. On match start, EventBridge schedules each event at `startedAt + (eventTimeSec / speedMultiplier × 1000ms)`. When each schedule fires, `event-processor` Lambda runs:

| Match event | What happens in the app |
|---|---|
| **Goal** | Score header updates, owner gets +fantasy points + credits, owners get personalized AI commentary, match-end celebration tracker updates |
| **Card** | Booked player's fantasy points adjust, AI commentary fires |
| **Saved shot** | Goalkeeper bonus (clean-sheet tracking), AI commentary fires |
| **Offside** | OFFSIDE_REFLEX mini-game fires for all members |
| **Shot on goal** | SHOT_CALL mini-game fires |
| **Penalty (goal w/ isPenalty=true)** | PENALTY_SHOOTOUT mini-game fires |
| **Halftime** | Match-aware HALFTIME_QUIZ fires (mixed match-event + player-bio trivia, hallucination-guarded) |
| **Fulltime** | Award credits + badges + trigger MatchEndCelebration with summary modal |

### 🏆 GAMIFICATION — *"at least one gamification mechanic"*

We have several:

| Mechanic | Detail |
|---|---|
| **Points system** | Fantasy points awarded per match event by player position (striker goal = +4, etc.) |
| **Leaderboard** | Members ranked by score in the room, with score-event timeline |
| **Brezn credits economy** | Earn from match outcomes (participation, win bonus, captain delivered, clean sheet, daily kickoff). Spend in the shop. |
| **33 collectible badges** | Bronze → silver → gold tier progression. Cumulative counter badges (`striker_1, striker_5, goal_machine` etc.). Disc rewards for specific badges (unlocks music tracks). |
| **Streaks** | History page tracks consecutive wins, longest streak. |
| **Captain pick** | 2× scoring boost on a chosen starter — strategic gamification before match. |
| **Match perks** | Triple captain (3× boost), pick re-roll, free hit (swap a drafted player). |
| **Per-pick timer with random auto-pick** | 15s deadline per draft pair keeps engagement tight. |

---

## Evaluation criteria — explicit mapping

| Criterion (from brief) | How we deliver |
|---|---|
| **Multiplayer Experience** — *"Can two fans interact, compete, or share moments together?"* | YES. Coordinated draft (direct competition), reactions overlay (shared moments), shared mini-games, match-end celebration. |
| **Real-Time Data Integration** — *"Does it feel reactive to what's happening on the pitch?"* | YES. 8 distinct event types trigger downstream effects. Score, commentary, mini-games, badges all driven by the replay engine. |
| **Gamification & Engagement Design** — *"Would a fan want to come back next matchday?"* | YES. Brezn credits + 33 badges + streaks + history page + shop = multiple return-engagement loops. |
| **Usability & Polish** — *"Could a casual fan pick it up without instructions?"* | YES. Instant-navigate flows, auto-start match, auto-pick timer, soft-acked races (no scary error toasts), 30+ visual polish passes. |
| **Creativity & Fan-Centricity** — *"Original, fun, rooted in real fan behavior?"* | YES. Brezn pretzel theme + Bavarian emoji pack + AI Brezn Agent mascot + match-aware quiz + FIFA-style draft + music unlocks. |
| **Cross-Platform Thinking** (bonus) | See section below. |

---

## Cross-Platform Thinking (bonus)

Brezn is a phone-first second-screen app, but the core data primitives — party rooms, real-time WS channels, badge system — extend naturally to other touchpoints. We've sketched four:

### 1. Stadium-screen leaderboard
A read-only PWA hosted on `stadium.brezn.app` that subscribes to `room#{code}` WS channels for any party watching the match live in the stadium. The big screen shows the top 10 parties by fantasy score, refreshing in real time. Implementation: a single new Lambda (`stadium-leaderboard`) that aggregates room scores via DynamoDB streams, broadcast on a shared `stadium#{matchId}` channel.

### 2. Push notifications to pull fans back in
SNS topics scoped by user (`user#{userId}`) — already wired for the `room_invite` WS payload — can also fan out to mobile push (APNs/FCM) via SNS platform endpoints. Triggers: friend invites, match starting in 5 min, a badge you're 1 goal away from unlocking, daily kickoff bonus reset. The plumbing is one Lambda + one SNS topic away.

### 3. Wearable alert (Apple Watch / WearOS)
The watch shows a Brezn-red "tap to react" pill whenever the AI Director fires a personalized commentary line for a drafted player you own. One tap = a 🥨 cheer broadcast back to your party room. Stays glanceable, doesn't pull the user off the TV.

### 4. AR overlay (spatial concept)
A Vision Pro / Quest 3 overlay anchors a translucent Brezn party panel above the TV, showing live member avatars + score deltas. When a goal fires, a giant pretzel mascot pops up in 3D space. Mini-games render in spatial cards floating around the user. Requires: Unity + AWS Bedrock + the existing WS API. Out of scope for the prototype but the data plumbing is ready.

---

## AWS architecture (short version)

| Service | Role |
|---|---|
| **Bedrock — Nova Micro** | Brezn Agent: commentary, captain suggestion, match-aware halftime quiz |
| **Lambda** | `event-processor`, `rooms`, `friends`, `credits`, `badges`, `director-handler` |
| **API Gateway** | REST endpoints + WebSocket fanout (`room#{code}`, `user#{userId}`) |
| **DynamoDB** | 7 tables: rooms, matches, match-events, credits (balance + inventory), badges, friends, player-lookup |
| **EventBridge** | Per-event scheduled dispatch — scales the match clock by host's chosen speed |
| **Cognito** | User Pool, JWT for API Gateway authorizer |
| **CloudFront + S3** | Frontend distribution + asset hosting |
| **CloudFormation** | Infra-as-code (every backend stack) |
| **GitHub Actions OIDC** | CI/CD per stack, no long-lived secrets |

See [`architecture.md`](architecture.md) for the full data flow + sequence diagrams.

---

## What's distinctive

1. **Hallucination-proof generative AI.** The Brezn Agent never invents a player's team. Halftime quiz only asks bio trivia about players in the actual `playerDirectory` of THIS match, with confidence-filtered + name-grounded + schema-validated questions. If grounding fails, a static fallback pool fires — users never see a wrong answer.

2. **Optimistic UI with server-stamped deadlines.** Pick timer is server-stamped (`pairStartedAtMs`) so all clients agree on the deadline. Auto-pick is client-driven; backend CAS retries + stale-pair soft-ack handle simultaneous-race cases without error toasts.

3. **Full infra-as-code + auto-deploy.** Every backend stack is a CFN template under `infra/` with a matching GitHub Actions workflow that auto-deploys on push to main via an OIDC role — no long-lived AWS secrets in the repo.

4. **Brezn pretzel everything.** Cartoon mascot, pretzel-letter BREZN wordmark, German football emoji pack, Bundesliga-red theme, Bebas Neue stadium font. Brand reads as *"Bavarian football, but playful"* — not generic-sports-app.

---

## Demo + repo

- **Live app:** *(CloudFront URL — fill in before submission)*
- **Demo video (≤3 min, <720p):** *(YouTube unlisted / S3 link — fill in)*
- **Repo:** [github.com/ClaudiuAWS/claudiu](https://github.com/ClaudiuAWS/claudiu) — branch `claude/inspiring-solomon-4e2a0e` (pre-merge) / `main` (post-merge)
- **Architecture deep-dive:** [`architecture.md`](architecture.md)
- **Accessibility audit:** [`accessibility.md`](accessibility.md)
- **Executive summary (5 slides):** [`../submission/executive_summary.md`](../submission/executive_summary.md)
- **PRFAQ:** [`../submission/prfaq.md`](../submission/prfaq.md)
