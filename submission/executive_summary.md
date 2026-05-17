# Brezn — Fan Squad Executive Summary

> Convert this markdown to a 5-slide PowerPoint (export → `executive_summary.pdf`)
> before bundling the zip. Each `##` heading is one slide.

---

## Slide 1 — Title

**Brezn**
*A Real-Time Social Match Experience for Bundesliga fans*

> Watch the match. Draft with friends. React together. Earn brezn credits.

**Team:** *(team name)*
**Challenge:** Fan Squad — Level 300

*Visual:* Brezn pretzel mascot + cropped Bundesliga crest + BREZN pretzel-letter wordmark.

---

## Slide 2 — The Problem & The Solution

### Problem
Modern Bundesliga fans want to watch matches **with friends**, not alone on isolated apps. Today's fan-facing products treat each user as a solo viewer — group chats are scattered, fantasy apps don't talk to live data, and there's no shared moment.

### Solution: Brezn — three connected loops
1. **Pre-match:** invite friends → coordinated FIFA-UT-style draft with 15s pick timer → captain suggestion from Brezn Agent (Bedrock Nova Micro)
2. **In-match:** real-time WS-synced lobby + AI commentary + mini-games (offside / shot-call / penalty / halftime quiz) triggered by actual events on the pitch + shared reactions
3. **Post-match:** brezn credits awarded, badges unlocked, history page tracks streaks, shop spends to cosmetics + perks

**One quote:** *"It's the second-screen WhatsApp + fantasy + trivia app you wished existed during every Klassiker."*

---

## Slide 3 — Three Pillars Coverage

### 🎯 Multiplayer
- Party rooms with WebSocket fanout (`room#{code}`)
- Coordinated draft — both users pick simultaneously, tiebreak coin-flip on conflict
- Shared reactions overlay (German football emoji pack: 🍺 🌭 👑 🐐 🎺 🏆)
- Friend invites with instant-navigate optimistic UI
- Match-end celebration shared across all members

### ⚡ Real-Time Data
- XML-replay engine + EventBridge scheduled dispatch (scaled match clock)
- **8 distinct match-event types trigger downstream effects:** goal, card, save, offside, shot-on-goal, penalty, halftime, fulltime
- Score, commentary, mini-game launches, badge awards all clock-aligned

### 🏆 Gamification
- Points system (fantasy scoring per event)
- Per-room leaderboard with timeline
- **33 collectible badges** (bronze → silver → gold)
- Brezn credits economy (earn from match outcomes, spend in shop)
- Streaks tracked on history page
- Captain pick = 2× boost; match perks (triple captain, pick re-roll, free hit)

*Visual:* screenshot grid — draft pair, live commentary, halftime quiz, badges grid.

---

## Slide 4 — AWS Architecture

| Layer | AWS Service | Purpose |
|---|---|---|
| **AI** | **Bedrock — Nova Micro** | Brezn Agent: commentary, captain suggestion, match-aware halftime quiz |
| **Compute** | Lambda × 6 | `event-processor`, `rooms`, `friends`, `credits`, `badges`, `director-handler` |
| **API** | API Gateway REST + WebSocket | `room#{code}`, `user#{userId}` channels |
| **State** | DynamoDB × 7 tables | rooms, matches, match-events, credits (incl. inventory map), badges, friends, player-lookup |
| **Scheduling** | EventBridge | Per-event scheduled dispatch on the speed-scaled match clock |
| **Auth** | Cognito User Pool | JWT for API Gateway authorizer |
| **Edge** | CloudFront + S3 | Frontend distribution + asset hosting |
| **IaC** | CloudFormation | Every backend stack |
| **CI/CD** | GitHub Actions OIDC | Per-stack auto-deploy on push to main, no long-lived secrets |

*Visual:* mermaid service map (see `docs/architecture.md`).

---

## Slide 5 — What's Distinctive + Cross-Platform Future

### 4 things judges should remember
1. **Hallucination-proof generative AI** — Brezn Agent never invents a player's team; halftime quiz only asks bio trivia about players ACTUALLY in this match, with confidence + name-grounding filters. If grounding fails, static fallback fires — users never see a wrong answer.
2. **Optimistic UI with server-stamped deadlines** — pick timer is server-stamped (`pairStartedAtMs`) so all clients agree on the same countdown. Backend CAS + stale-pair soft-ack means simultaneous-race never produces error toasts.
3. **Full IaC + auto-deploy** — every backend stack has its own CFN template + GitHub Actions workflow with OIDC. New features ship without ever opening the AWS Console.
4. **Brezn pretzel everything** — cartoon mascot, pretzel-letter wordmark, German football emoji pack, Bavarian theme. Reads as *"Bundesliga, but playful"*, not generic sports-app.

### Cross-platform (bonus, concept-level)
- **Stadium screen:** `stadium#{matchId}` WS channel aggregates top parties' fantasy scores live
- **Push notifications:** SNS platform endpoints reuse existing `user#{userId}` payloads for APNs/FCM
- **Wearable:** Apple Watch tap-to-react pill on Brezn Agent personalized commentary
- **AR / spatial:** Vision Pro overlay anchors a Brezn party panel above the TV; 3D pretzel pops up on goals; mini-games render as floating spatial cards

*Visual:* a 2×2 cross-platform mockup grid (sketch-level OK).

---

## Notes for the presenter (cut from slide content)

- The app has shipped end-to-end on AWS — live URL works, both users can join from different browsers and play through a complete match.
- 33 commits over the project lifetime including this submission sprint. PR history readable on GitHub.
- The brief explicitly values *"learning from failures"* — call out the chroma-key catastrophe (badges had 4–28% opaque pixels) and how we recovered (audit → repair with corner-flood + interior-hole restoration → regen with edge-connected chroma-key). It's a good narrative beat.
