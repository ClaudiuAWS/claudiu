# PR/FAQ — Brezn

> The Amazon "working backwards" format: write the press release first as if
> the product had already launched, then the FAQ judges might ask. Convert
> to `prfaq.pdf` before bundling the zip.

---

# Press Release

## Brezn Launches: The Bundesliga Second-Screen App That Brings Fans Together During Every Match

**MUNICH, Germany — May 17, 2026.** Today, *(team name)* announces Brezn, a real-time social match experience built on AWS for the AWS World Sports Innovation Cup 2026. Brezn lets Bundesliga fans draft fantasy squads against each other, watch matches together with WebSocket-synced state, react with German football emojis, and play AI-driven mini-games triggered by what happens on the pitch — all from a single phone screen that lives next to the TV.

"Watching a match alone is one screen," says *(presenter name)*. "Watching it with three friends, drafting players against each other, reacting to a Kane finish with a 🍺 emoji floater, and seeing 'Brezn Agent' commentate on YOUR player — that's a different sport. Brezn is what the group chat would look like if it knew about football."

Brezn was built around three pillars matching the Fan Squad challenge brief: **multiplayer**, **real-time data**, **gamification**. Every match event from the DFL XML feed — goal, card, save, offside, shot-on-goal, penalty, halftime, fulltime — triggers downstream effects in the app, from score updates to mini-game launches to badge awards. Players earn brezn credits that they spend in an in-app shop on cosmetics, match-perks (triple captain, pick re-roll, free hit), and disc unlocks for in-match music tracks.

The technical centerpiece is the **Brezn Agent**, a generative-AI assistant powered by Amazon Bedrock Nova Micro. The agent narrates each event with personalized commentary for players you've drafted, recommends who should wear the captain armband before kickoff, and generates match-aware halftime quizzes that mix confirmed first-half events with stable bio trivia about players actually on the rosters. Multiple hallucination guards — schema validation, confidence filtering, name-grounding against an authoritative player-team directory — mean users never see a wrong answer.

Brezn runs on a fully serverless AWS stack — Lambda, API Gateway (REST + WebSocket), DynamoDB, EventBridge, Cognito, Bedrock, CloudFront — with every stack defined in CloudFormation and auto-deployed via GitHub Actions OIDC. The branding is unmistakably Bavarian: a cartoon pretzel mascot, a BREZN wordmark made of pretzel-shaped letters, and a German football emoji pack (🍺 wurst, GOAT, Kaiser crown, vuvuzela, Pokal trophy).

Brezn is available now at *(CloudFront URL)*. The full source code, architecture documentation, and accessibility audit are public at *(GitHub URL)*.

---

# FAQ

## Why pretzels?

The Bavarian pretzel ("Brezn" in Bavarian German) is a stadium-food icon at Allianz Arena, Borussia-Park, Veltins-Arena — every Bundesliga match. The mascot, the BREZN-letter wordmark, the in-app currency, the shop ("Brezn Shop"): everything ties back to a recognizably-Bundesliga visual idiom rather than generic-sports-app gradients. Plus, "Brezn" reads as both food and currency — the dual meaning gives the credits economy thematic weight.

## How does the AI Brezn Agent work?

The Brezn Agent runs on **Amazon Bedrock Nova Micro** via the Converse API (model-agnostic — swappable via env var). Three modes today, all gated through a single Lambda (`director-handler`):

1. **Per-event tick** — on each match event, the frontend posts a snapshot to `/rooms/{code}/director-tick`. The agent decides one of three actions: start a mini-game, emit a one-line commentary, or wait. Outputs a JSON object with a `reasoning` field that users can tap "Why?" to expand.
2. **Captain suggestion** — when a user enters the "preview" phase of squad selection, the frontend calls the same endpoint with `mode: 'captain-suggestion'` and the 11 starters. The agent recommends one (must be in the whitelist), with confidence and a one-sentence reasoning.
3. **Halftime quiz** — when the halftime event fires, the agent generates 3 questions: a mix of confirmed first-half events ("Who scored Bayern's first?") + stable bio trivia about players in the match ("Which country does Kane represent internationally?"). Each question carries a confidence score the backend filters at ≥ 0.7.

## What stops the AI from hallucinating?

Five guards in layers:
1. **Schema gate** — each question must have 4 distinct non-empty choices, valid `correctIdx`, a `type` ∈ {match-event, player-bio}, and confidence ∈ [0, 1].
2. **Confidence filter** — drop questions below 0.7.
3. **Name-grounding** — player-bio questions must reference a name from the authoritative `playerDirectory` (the actual rosters of THIS match), built fresh per match from `claudiu-player-lookup`.
4. **Banned phrases** — the prompt explicitly forbids "today", "currently", "this season", trophy counts, current jersey numbers — anything that drifts over time.
5. **Safe-question requirement** — at least one of the 3 surviving questions must be type `match-event` (grounded in confirmed first-half events), else drop the whole quiz so the static fallback fires.

## What about accessibility?

The brief explicitly calls out accessibility. We've landed:
- `aria-live="polite"` on the commentary stack so screen readers announce each new Brezn Agent line
- `aria-label` on every reaction FAB and emoji button (e.g., "React with beer")
- `alt` text on every badge and brand asset
- `@media (prefers-reduced-motion: reduce)` on the confetti emitter — disables motion for users with vestibular disorders
- `role="dialog"` + `aria-modal="true"` on preview modals
- WCAG AA-passing rim colors on bronze/silver/gold tier badges

Still on the roadmap: high-contrast toggle, keyboard shortcuts, voice-over of commentary.

## How does it handle race conditions?

The coordinated draft was the trickiest case. Two users tap their pair simultaneously — without care, the second write clobbers the first and both clients freeze "waiting for opponent". Fix: a 5-attempt CAS retry loop in `submit_draft_pick` with strongly-consistent reads, where the conditional write rejects unless `currentPairIndex` AND `pendingChoices` are still exactly what we read. The loser of the race retries, sees both pending choices, and runs the resolve path. We ALSO soft-ack stale-pair races: if a user submits for a pair that's already advanced, backend returns `{ok: true, stale: true}` instead of raising — no red error toast for benign races.

## What about the pick timer?

15-second deadline per pair, server-stamped (`pairStartedAtMs`) so all clients agree on the same countdown. Auto-pick is client-driven: when the deadline passes, the client fires a random pick from the pair. Simultaneous auto-picks from both clients are handled by the same CAS + stale-pair soft-ack — no double-pick, no toast.

## What about the 705M-point 3D dataset (Challenge 1)?

That's a different track. Brezn targets Fan Squad — multiplayer, real-time, gamified. The 3D data exploration is for analytics-flavored teams; we're building experience-flavored.

## How does it scale?

Today every component is serverless: Lambda + API Gateway + DynamoDB + EventBridge. The hot path during a match is one Lambda per match event (every ~30–60 sec at 5× speed), plus the WS fanout which scales linearly with members. We tested with ≤ 2 users per room as the brief requires; the architecture supports 100+ members per room without code changes (WS fanout is the AWS-managed bottleneck). The Bedrock tick is capped at 30 calls per match to control cost.

## What's next?

1. **Stadium screen leaderboard** — read-only PWA that aggregates the top 10 parties watching the same match
2. **Push notifications** — SNS-driven, reusing existing `user#{userId}` payloads
3. **Wearable tap-to-react** — Apple Watch glanceable cheer button on personalized commentary
4. **AR spatial overlay** — Vision Pro overlay anchored above the TV with floating mini-game cards
5. **More mini-games** — VAR review, predict-the-next-shot, possession-line drawing on a touch overlay
6. **Backend awarders for the 28 stub badges** — `hattrick`, `clean_sheet`, `late_winner` etc. are catalogued but not yet wired. Each is ~50 lines of code in `evaluate_match_end` and `evaluate_minigame`.
7. **Localization** — German UI as a toggle (currently English-only).

## What's something that didn't work?

The badge artwork pipeline. We chroma-keyed all 35 badge PNGs with a "every near-white pixel goes transparent" filter — which catastrophically wiped out the metallic rim highlights on most badges. Some badges ended up 4–28% opaque, with massive holes in the rim. We recovered in two passes: first a "repair" script that flood-fills from the four corners and restores interior holes, then a regenerate-and-edge-key script for the 14 worst-damaged badges. The fix is documented in commits `65c6515` (repair) and `21b21fa` (regen). Lesson: chroma-key on artwork with high-contrast highlights requires edge-connectivity, not pixel-color thresholds.
