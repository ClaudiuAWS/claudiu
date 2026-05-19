# Brezn — Session Handoff (2026-05-19)

## TL;DR

- Active branch: `claude/inspiring-solomon-4e2a0e`, HEAD `8b66139`
- **5 commits ahead of `origin/main`, PR open** (passes 66-70)
- App deployed at CloudFront `d1t5xvsturq92p.cloudfront.net`
- AWS World Sports Innovation Cup 2026 submission window closed 2026-05-17

## Pending action (user)

### 1. Merge the open PR (passes 66-70)

The 5 unmerged commits ship:
- Pretzel mascot with double-sized eyes (cache-bust `?v=6`)
- Captain "C" badge on the Squad-tab combined pitch
- Per-component score timeline (scorer / assist / concede rows split out)
- Consumable match perks released at fulltime
- Lower emoji FAB position
- Correct summed delta in HighlightOverlay chip + ScoreToast

### 2. Run the data loader on the deployed AWS account

`claudiu-player-lookup` is still empty on prod (passes 46-48). Live draft falls back to empty pair lists until loaded.

From `inspiring-solomon-4e2a0e/` worktree root, PowerShell:

```powershell
cd data\loader
$env:AWS_PROFILE = "hackathon"
$env:MATCHES_TABLE = "claudiu-matches"
$env:MATCH_EVENTS_TABLE = "claudiu-match-events"
$env:PLAYER_LOOKUP_TABLE = "claudiu-player-lookup"
$env:PLAYER_IMAGES_BUCKET = "claudiu-player-images-507609143109"
python main.py
```

Gotcha: use a single `$` not `$$` — `$$` is PowerShell's PID auto-variable, silently no-ops the assignment (see pass 27).

## Open PR commits (oldest → newest)

| SHA | Title |
|---|---|
| `510902b` | fix(invite): harden the accept flow + add diagnostic logs |
| `2a2529e` | feat(brand, match): double pretzel eyes + lower emoji FAB + captain marker on pitch |
| `7415abf` | fix(score timeline): split goal into per-component entries so the math is visible |
| `b6a55f3` | fix(perks): release consumable perks at fulltime so they can be re-bought |
| `8b66139` | fix(match): sum per-component deltas in HighlightOverlay + ScoreToast |

## Architectural patterns to preserve

### Fantasy scoring

- Goal values: GK +10 / DEF +6 / MID +5 / FWD +4
- Other: assist +3, save +2 (GK only), yellow −1, red −3, conceded −1 (GK only), reaction-tap +2
- Captain multiplier: ×2 baseline, ×3 with `captain-triple` perk armed
- **Per-component split (pass 68)**: a single goal emits up to 3 entries per user — scorer, assist, concede. The dedup key in `useRoom.js` includes `reason` so all 3 survive the dedup window.
- **Must stay synced**: frontend `computeOptimisticDeltas` (`frontend/src/utils/fplScoring.js`) ↔ backend `_calculate_member_changes` (`backend/event-processor/service.py`).

### Inventory lifecycle (consumable perks)

1. Buy → `inventory[itemId] = { kind: 'consumable', consumedForMatch: '', usedAt: '' }`
2. Squad-lock → `inventory[itemId].consumedForMatch = matchId` (`rooms/service.py::_arm_user_perks`)
3. Fulltime → `consume_perks_for_match` DELETES the entry (`backend/shared/credits.py`, wired in `event-processor/service.py::_end_rooms`)

### Cache-busting

- Static images bump a `?v=N` query string when content changes (`brezn-agent ?v=6`, badges `?v=4`)
- CloudFront serves the new URL as a cache miss → S3 fresh → instant propagation

### API Gateway deploy quirk

- `AWS::ApiGateway::Deployment` does NOT republish on Method / Resource changes — only when its LogicalId changes
- Pattern: rename `RestApiDeploymentYYYYMMDD` on every infra change that adds routes (passes 63-64)

### Workflow path filters

- Every backend Lambda has its own deploy workflow scoped by `paths:` filter
- `deploy-matches-infra.yml` had to be manually kicked (pass 54) because the workflow was added AFTER the file's last edit — no diff to trigger it
- For new infra: touch the watched file (e.g., dated comment) in the same commit so the filter trips

## Tooling

### Deferred tools

The harness lazy-loads many tools. Load schemas before calling:

```
ToolSearch(query="select:ExitPlanMode,WebFetch,TaskCreate", max_results=3)
```

Frequently needed:
- `ExitPlanMode` — required at end of plan-mode turn
- `TaskCreate / TaskUpdate / TaskList / TaskGet` — work tracking (replaced TodoWrite)
- `WebFetch`, `WebSearch` — research
- `mcp__54c13b88__generate_image` — high-quality image gen (use `nano_banana_2` model)
- `mcp__Claude_Preview__preview_*` — DOM-aware preview against a running dev server

### Image generation

- Primary: `mcp__54c13b88__generate_image` with `nano_banana_2`
- Fallback: Pollinations FLUX at `https://pollinations.ai/p/<encoded-prompt>?seed=<n>&width=512&height=512&model=flux&nologo=true`
- **Hardening MANDATORY** for every download: HTTP 200 + Content-Type `image/*` + magic bytes (PNG `89 50 4E 47…`) + size > 5 KB + retry-with-backoff
- Reference scripts: `scripts/generate-brezn-agent.py`, `scripts/regen-counter-badges.py`
- Chroma-key transparent corners: perimeter-median bg sampling, distance < 80, 1.2 px Gaussian-blur AA

### Bedrock (Brezn Commentator AI)

- Model: Nova Micro via EU inference profile
- Lambda: `claudiu-director-handler`
- Two modes branched on POST body `mode` field:
  - `tick` → match commentary + mini-game triggers (default)
  - `captain-suggestion` → recommend a captain from the 11 starters
- Anti-hallucination layers in `backend/director-handler/service.py`:
  - JSON schema gate
  - No-duplicate options
  - Confidence ≥ 0.7 filter
  - Player-bio names must appear in `playerDirectory`
  - At least one Type A (safe, match-event) question must survive

## Critical files

| Path | Why |
|---|---|
| `backend/event-processor/service.py` | XML replay → DDB writes → WS fanout. Heart of scoring. |
| `backend/rooms/service.py` | Room lifecycle, draft, perk arming, free-hit swap, draft re-roll |
| `backend/shared/credits.py` | Brezn economy: balance, inventory, consumable lifecycle |
| `backend/shared/badges.py` | 33 badge catalog + counter ladders |
| `backend/director-handler/{prompts.py,service.py,handler.py}` | Brezn Commentator AI |
| `frontend/src/hooks/useRoom.js` | WS state machine for live match — score events, leaderboard, minigames |
| `frontend/src/hooks/useMatch.js` | Reveal-clock-driven event filter |
| `frontend/src/utils/fplScoring.js` | Frontend mirror of backend scoring |
| `frontend/src/components/match/CombinedPitchView.jsx` | Squad-tab pitch (captain badge added pass 67) |
| `frontend/src/components/lobby/TeamSelectionModal.jsx` | Draft + select-XI + preview + captain suggestion |
| `frontend/src/pages/MatchPage.jsx` | Top-level live-match orchestration |
| `infra/compute/api-gateway.yml` | REST + WS endpoints (republish quirk: passes 63-64) |
| `infra/compute/lambdas-matches.yml` | Event-processor + matches Lambdas + IAM |

## Known landmines

- **Local `.env` missing** in `inspiring-solomon-4e2a0e/frontend/` — copy from `gifted-lumiere-d682fc/frontend/.env` if needed for local dev (pass 15). User prefers prod testing.
- **PowerShell `$$` trap** — PID auto-variable; always single `$` (pass 27)
- **JMESPath object projection** needs explicit `{newKey: source}` form, NOT bare key list (pass 55)
- **DDB `SET map.key = …`** requires `map` to exist on the row first — use `if_not_exists` pre-init (pass 65)
- **CICD IAM stack** requires a one-time manual seed via `aws cloudformation deploy` before workflows can run (passes 24-28)
- **Submission deadline passed** — focus is on stability and polish, not new features

## Recent pass index (60-71)

| Pass | Title | Status |
|---|---|---|
| 60 | Buy any unearned badge via `/badges/buy` | Shipped (PR #111) |
| 61 | Real points in match-popups (no more hardcoded +5) | Shipped (PR #111) |
| 62 | Diagnose deploy gap on Buy buttons | Shipped (PR #111) |
| 63 | API Gateway Deployment LogicalId rename | Shipped (PR #111) |
| 64 | Merge conflict on `api-gateway.yml` | Resolved manually |
| 65 | Inventory map pre-init on first purchase | Shipped (PR #112) |
| 66 | Invite-accept harden + diagnostic logs | **PENDING MERGE** |
| 67 | Double pretzel eyes + lower FAB + captain badge | **PENDING MERGE** |
| 68 | Per-component score timeline split | **PENDING MERGE** |
| 69 | Consumable perks released at fulltime | **PENDING MERGE** |
| 70 | Sum per-component deltas in chip + toast | **PENDING MERGE** |
| 71 | Handoff doc + worktree cleanup | (this pass) |

For the full pass history (1-71), see the plan file:
`C:\Users\Mihai\.claude\plans\edited-glimmering-noodling-treasure-md-9-peppy-sky.md`

## How to start the next session

1. `cd C:\Users\Mihai\OneDrive\Desktop\AWS\claudiu\.claude\worktrees\inspiring-solomon-4e2a0e`
2. `git status` — confirm clean tree on `claude/inspiring-solomon-4e2a0e`
3. `git log --oneline origin/main..HEAD` — see what's pending merge
4. `git pull` if the open PR was merged since this handoff
5. Read this doc + `docs/architecture.md` for the system map
6. Tell the new session: **"Read `docs/SESSION_HANDOFF.md`, then [your task]"**
