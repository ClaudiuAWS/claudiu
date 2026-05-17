# Brezn — AWS World Sports Innovation Cup 2026

**Track:** DFL × Adidas — *Beyond the 90 minutes* (A Real Time Social Match Experience)

---

## The problem

Watching a Bundesliga match alone with the TV is one screen. Modern fans live on a second — phone in hand, group chat humming, half-watching highlights, half-arguing with friends. That second screen is mostly wasted: scattered between Twitter, WhatsApp, a fantasy app, a streaming service. None of it is *the match*, in real time, *with your friends*.

We built **Brezn**: a Bundesliga-themed second-screen app where you draft squads, watch matches live with a friend, react with German-football emojis, play AI-driven mini-games triggered by what's happening on the pitch, and chase a brezn-credit economy that keeps the loop running between matches.

---

## The three pillars the challenge asks for

| Pillar | How Brezn delivers |
|---|---|
| **Real-time** | XML-replay engine + EventBridge scheduled dispatch, scaled by a host-chosen speed (1× → 30×). WebSocket fanout on `room#{code}` so every member sees the match minute, score, commentary, and mini-game triggers in lockstep. CAS-retried draft picks with sub-second multi-user state sync. |
| **Social** | Party rooms with friend invites (instant-navigate optimistic UI), coordinated draft (FIFA-UT pair pick'em with a 15s auto-pick timer), reactions overlay synced across all members (German football emoji pack: 🍺 🌭 👑 🐐 🎺 🏆), Brezn Agent's captain suggestion banner, shared match-end celebration. |
| **Match experience enrichment** | Bedrock Nova Micro powers a "Brezn Agent" that narrates each event with personalized hooks for players you own. The same agent generates match-aware halftime quizzes (mix of confirmed first-half events + stable bio trivia about players actually on the rosters) with multi-layer hallucination guards. Mini-games fire on offsides, shots, penalties, and halftime. |

---

## Accessibility, inclusion, fan loyalty

These three are called out explicitly in the brief.

- **Accessibility:** `aria-live` on the live commentary stack so screen readers announce new lines. `aria-label` on every reaction FAB and emoji button. Alt text on every badge, mascot, and brand asset. `prefers-reduced-motion` opt-out disables confetti animations on the match-end celebration. High-contrast tier badges (bronze/silver/gold with WCAG AA-passing rim colours).

- **Inclusion:** the AI commentary is hallucination-guarded so a player who hasn't played in this match isn't invented out of thin air — the prompt forbids team attributions outside the authoritative `playerDirectory` and rejects any answer not grounded in confirmed match events. Builds trust with users who care about facts.

- **Fan loyalty:** a full earn/spend economy. 33 achievements (bronze → silver → gold) with disc-unlock chains. A Brezn shop with cosmetics (name colours, avatar frames), match-perks (triple captain, pick re-roll, free hit, premium German-emoji pack), and badge buyout paths. A history page that tracks wins, streaks, and credits earned over time.

---

## AWS architecture (short version)

| Service | Role |
|---|---|
| **Bedrock — Nova Micro** | Brezn Agent: commentary, captain suggestion, match-aware halftime quiz |
| **Lambda** | `event-processor`, `rooms`, `friends`, `credits`, `badges`, `director-handler` |
| **API Gateway** | REST endpoints + WebSocket fanout (`room#{code}`, `user#{userId}`) |
| **DynamoDB** | 7 tables: rooms, matches, match-events, credits (balance + inventory map), badges, friends, player-lookup |
| **EventBridge** | Per-event scheduled dispatch — scales the match clock by the host's chosen speed |
| **Cognito** | User Pool, JWT for API Gateway authorizer |
| **CloudFront + S3** | Frontend distribution + asset hosting |
| **CloudFormation** | Infra-as-code (every backend stack) |
| **GitHub Actions OIDC** | CI/CD per stack, no long-lived secrets |

See [docs/architecture.md](architecture.md) for the data-flow diagram and sequence diagrams (event ingest → fanout, invite → navigate, draft pick → resolution, halftime → quiz generation).

---

## What's distinctive

1. **Hallucination-proof generative AI in a sports context.** The Brezn Agent never invents a player's team. The halftime quiz only asks bio trivia about players whose names appear in the authoritative `playerDirectory` — and each question carries a model-self-rated confidence score that the backend filters at ≥ 0.7. If grounding fails, the quiz falls back to the static pool instead of shipping a wrong answer.

2. **Optimistic UI with server-stamped deadlines.** The 15s pick timer is server-stamped (`pairStartedAtMs`) so all clients agree on the deadline regardless of clock skew. Auto-pick is client-driven but races are handled by backend CAS + a soft-ack on stale picks — no error toasts ever fire for benign races between two simultaneous clicks.

3. **Brezn pretzel everything.** A cartoon-pretzel mascot, a BREZN wordmark made of five pretzel-letter PNGs, German football emoji pack (beer, wurst, GOAT, vuvuzela, Pokal), Bundesliga-red theme, Bebas Neue stadium font. The brand reads as "Bavarian football, but playful" — not generic-sports-app.

4. **Full IaC + auto-deploy.** Every stack (rooms-Lambda, credits-Lambda, badges-Lambda, friends-Lambda, director-Lambda, event-processor, frontend) auto-deploys via its own GitHub Actions workflow on merge to main. New contributors can ship a feature end-to-end without ever touching the AWS Console.

---

## Demo + repo

- **Live app:** *(CloudFront URL)*
- **Demo video (2-3 min):** *(YouTube unlisted / S3 link)*
- **Repo:** [github.com/ClaudiuAWS/claudiu](https://github.com/ClaudiuAWS/claudiu) — branch `claude/inspiring-solomon-4e2a0e`
- **Architecture deep-dive:** [docs/architecture.md](architecture.md)
- **Accessibility audit:** [docs/accessibility.md](accessibility.md)
