# Brezn roadmap — parked / not yet on schedule

Tracking ideas we've validated but haven't built. Each entry has a
rough effort + integration sketch so a future session can pick it up
without re-discovering context.

---

## Daily quest carousel

Bite-sized challenges on the home page that hook day-1 retention.
Three quests rotate daily, completing one mints Brezn.

**Effort**: 2–3 days (greenfield — no existing quest infrastructure).

**Sketch**:
- `backend/shared/quests.py` — canonical catalog (mirrors `badges.py`):
  predicate ("squad scored 3 today", "GK made a save today", "won a
  match today"), target count, Brezn reward.
- New `claudiu-quests` DDB table — PK `userId`, SK `questDate#questId`,
  attrs `progress`, `target`, `claimedAt`. TTL on rows >7 days old.
- New `claudiu-quests` Lambda — `GET /quests/today` (lazy-assigns 3
  random quests for the user-day on first call) + `POST /quests/{id}/claim`
  (validates progress >= target, awards Brezn via `_credits.award()`,
  marks `claimedAt`).
- Quest progression hook in `backend/event-processor/service.py`'s
  `_apply_member_changes` — after each scoring event, tick any active
  quests whose predicate matched. Same try/except discipline as the
  existing badges + credits hooks.
- `frontend/src/hooks/useQuests.jsx` — polls `/quests/today` on focus
  + 60 s interval.
- `frontend/src/components/home/QuestsCarousel.jsx` — horizontal
  scroller above the matches list with progress bars + Brezn-reward
  pills + Claim button when complete.

**Why we parked**: scope (whole new Lambda + DDB stack) didn't fit
the same session as the three smaller features. Quality > speed.

---

## Voice rooms (Discord-style)

Friends watching the match talk live. Biggest possible moat vs the
official Bundesliga Fantasy app.

**Effort**: 1–2 weeks (WebRTC integration, audio mixing).

**Sketch**:
- AWS Chime SDK or Daily.co for the WebRTC layer (Chime ~$0.0017/user-
  minute, manageable at hackathon scale).
- Auth: room membership IS audio room access. No moderation in v1 —
  any party member is auto-admitted, no kick/ban controls. Add later
  if abuse appears.
- UI: small floating "join voice" pill in the match view; once joined,
  a tray of avatar rings (with a mic-on/mic-off toggle per member)
  along the bottom of the screen. Tap an avatar to mute that user
  locally.
- New Lambda (`claudiu-voice`) brokers Chime meeting creation /
  attendee join tokens — Chime SDK's `CreateMeeting` + `CreateAttendee`
  + return the join URL/token to the client.

**Why we parked**: not the highest-leverage next move; the live
emoji-reaction shipping today already covers a lot of the social-
party feel for much less effort.

---

## Card design boost engine (Phase 3 of the FIFA-UT direction)

Collect / equip "card designs" on drafted players. Each design has a
**boost** (e.g. +1 fantasy point when the equipped player scores).
Long-term Brezn-spend vehicle and the meat of the progression layer.

**Effort**: ~1 week.

**Sketch** (full design lives in `glimmering-noodling-treasure.md`
under the FIFA-UT card-collection direction):
- `backend/shared/card_designs.py` — canonical design catalog. Each
  design has `id`, `name`, `image`, `unlockBadge?`, `creditPrice?`,
  `boost` (`{ event: 'goal', delta: +1 }`).
- New `claudiu-inventory` DDB table — PK `userId`, SK `designId`,
  attrs `ownedAt`, `unlockedVia: 'badge'|'purchase'`.
- New `claudiu-inventory` Lambda — `GET /inventory/designs`,
  `POST /inventory/purchase/{id}` (DDB transaction: debit Brezn +
  write inventory row).
- Auto-unlock hook in `backend/shared/badges.py.award()` — if the
  badge has `unlocksDesign`, also write the inventory row.
- Per-room equip: `POST /rooms/{code}/equip { playerId, designId }`
  + new `equippedDesigns: { <playerId>: <designId> }` map on the
  member dict.
- Boost evaluation in `_calculate_member_changes` — already structured
  to apply captain ×2; same pattern: check `equippedDesigns[scoring_pid]`
  and add the design's `boost.delta`.
- `PlayerCardFrame.jsx` reusable component for the visual frame.
- Designs Tab on `/profile` or `/badges` with owned/locked grid.

**Why we parked**: depends on the inventory schema decisions + a fair
chunk of art (the card design PNGs themselves). Worth doing once
the user-base proves engagement with the badge collection.

---

## Done & live (for reference, so the parking lot doesn't list these)

- ✅ Captain (2× boost) — `541a638`
- ✅ Live emoji reactions — `96f227a`
- ✅ Pre-match draft reveal show — `1718684`
- ✅ Personal AI commentary on YOUR picks — `b8327ef`
- ✅ Brezn currency + pretzel coin SVG icon
- ✅ Friend invite links (Web Share + per-platform deep-links)
- ✅ User-curated albums + shuffle + repeat-one in the music library
- ✅ 30-badge catalog with tier prices, all 30 with real artwork
- ✅ Profile crests showcase
