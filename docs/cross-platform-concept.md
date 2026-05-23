# Brezn beyond the browser — TV-anchored AR concept

> **One-line pitch:** while you watch the match on your TV, point your phone
> (or wear your Vision Pro) at the screen — your Brezn party's live
> leaderboard, captain pick, friends' reactions, and AI commentary float in
> 3D space anchored to the TV's edges. Same backend, new surface.

---

## The concept

Brezn is a real-time multiplayer watch-party app. Today it lives entirely in
the browser. The TV — where you're actually watching the match — is the
center of gravity for the social moment, but the app sits on a separate
phone screen.

AR collapses the two. The TV becomes the canvas; Brezn's live state floats
around it.

```
        ┌───────────────────────────────────────┐
        │ 🥨 BREZN — Bayern vs Hamburger SV     │  ← floating header
        │                                        │
        │   1. mmm    +42 pts  🥨 86 brezn      │  ← live leaderboard
        │   2. Mihai  +30 pts  🥨 68 brezn      │     pinned LEFT of TV
        │                                        │
        │      ┌──────────────────────────┐     │
        │      │                          │     │
        │      │     [TV broadcast        │     │
        │      │      of the match]       │     │
        │      │                          │     │
        │      └──────────────────────────┘     │
        │                                        │
        │   ⚽ GOAL  ·  Olise +10 (captain)      │  ← event toast
        │   🎺 Mihai reacted  · +2 brezn         │  ← friend reaction
        │                                        │
        └───────────────────────────────────────┘
```

When your friend taps the reaction button on their phone, you see their
emoji float up next to the goal on YOUR TV — even if they're in a different
city. The TV remains the broadcast; everything around it is your group's
social layer.

---

## Three form factors of the same concept

### 1. Phone AR (iOS ARKit / Android ARCore)

```
   ┌──── PHONE SCREEN (camera viewfinder) ────┐
   │                                            │
   │   1. mmm     +42 🥨                       │  ← rendered on top
   │                                            │     of camera feed
   │      [─── TV in the room ───]              │
   │      │                       │             │
   │      │   (live broadcast)    │             │
   │      │                       │             │
   │      [────────────────────────]            │
   │                                            │
   │   ⚽  Olise GOAL  +10                     │
   │   [🎺] [🍺] [🐐]  ← tap to react           │
   │                                            │
   └────────────────────────────────────────────┘
```

- TV recognised via `ARImageTrackingConfiguration` (iOS) or `ARCore
  Augmented Images` (Android).
- UI anchors stick to the TV's plane: when you move the phone, the
  leaderboard moves with the TV in the frame.
- Reaction buttons render as floating chips just below the TV. Tap → the
  existing `/react` endpoint fires.
- **Best for:** casual fans who already have a smartphone — zero
  hardware ask.

### 2. Apple Vision Pro / mixed-reality headset

```
   ┌────────────── YOUR LIVING ROOM ──────────────┐
   │                                                │
   │   ┌───────────────┐                            │
   │   │  Mihai's      │   [─── TV ───]             │
   │   │  avatar       │   │           │            │
   │   │   (eye-       │   │  match    │            │
   │   │   contact     │   │ broadcast │            │
   │   │   reactions)  │   │           │            │
   │   └───────────────┘   [───────────]            │
   │                                                │
   │   Leaderboard panel                            │
   │   floats above TV                              │
   │                                                │
   │   🎺 (auto-emoji bubble from Mihai's            │
   │      tap, drifts up & fades)                   │
   │                                                │
   └────────────────────────────────────────────────┘
```

- Spatial windows arranged around the TV — `RealityKit` + `visionOS`
  natively support this.
- Friends' face avatars sit on your couch (Persona / SharePlay style)
  and react in real time.
- Gestures: eye + pinch to apply captain, raise hand to react, voice
  ("Brezn, react nutmeg") for fast moments.
- **Best for:** the demo wow-factor; matches Apple Sports' direction
  with the Vision Pro.

### 3. Smart glasses (Meta Ray-Ban, Snapdragon AR1, Xreal)

```
   ┌──── HUD (low-info, glanceable) ────┐
   │                                      │
   │   1 mmm   42                         │  ← single-line HUD
   │   2 you   30        ⚽ Olise +10     │     anchored to upper
   │                                      │     edge of TV
   └──────────────────────────────────────┘
```

- Lightweight HUD with score and last event. No interaction (or
  voice-only).
- **Best for:** hands-free; sub-second glance during a goal
  celebration.

---

## Architecture — same backend, new client

The AR layer is a **subscriber** to Brezn's existing WebSocket channel.
Zero backend changes.

```
┌─────────────────┐                          ┌──────────────────┐
│ event-processor │   ──score_update──▶      │ phone AR client  │
│   Lambda        │   ──commentary_update──▶ │ (ARKit / ARCore) │
│                 │   ──minigame_start────▶  │                  │
│  (existing)     │   ──reaction broadcast─▶ │  renders         │
└─────────────────┘                          │  TV-anchored     │
        │                                    │  overlays via    │
        │ already pushes to                  │  RealityKit /    │
        │ room#{code} channel                │  Sceneform       │
        ▼                                    └──────────────────┘
┌─────────────────┐                                    │
│ API Gateway WS  │ ◀───── /react POST                 │
│                 │ ◀───── /cheer POST  ────  same     │
│ (existing)      │ ◀───── /minigame-score  endpoints  │
└─────────────────┘                                    │
        ▲                                              │
        │                                              │
        └──── reuses Cognito JWT ──────────────────────┘
```

Implementation steps for a phone AR companion (the lowest-effort form
factor):

1. New Swift / Kotlin app project — NOT React Native, since AR needs
   native frameworks.
2. Authenticate with the same Cognito user pool (existing auth, no infra
   change).
3. Open the same WebSocket:
   `wss://<ws-endpoint>/prod?token=<jwt>&channel=room#<code>`.
4. Translate the existing message types (`score_update`,
   `commentary_update`, `minigame_start`, etc.) into 3D anchor updates
   instead of DOM updates.
5. Reuse REST endpoints for actions (`/react`, `/cheer`, `/captain`).

**Critical:** because the existing WS channel is the source of truth, all
surfaces (web browser, phone AR, Vision Pro) stay in sync automatically —
no new "AR state" to manage.

---

## Roadmap

| Phase | Surface | Effort | Why |
|---|---|---|---|
| **0 — Today** | Responsive React SPA (browser) | shipped | What you have now |
| **1 — Phone AR companion** | iOS app w/ ARKit; same backend | ~3 weeks | Lowest-effort entry point; biggest install base |
| **2 — visionOS spatial app** | Vision Pro native | ~2 weeks atop Phase 1 | Reuses Phase 1's WS client + asset pipeline; killer demo |
| **3 — Smart glasses HUD** | Meta Ray-Ban / Xreal | ~1 week | Limited interaction surface — score + last event only |
| **4 — Stadium screen** | LED jumbotron API + display server | ~4 weeks | Operator-facing; needs club partnership |

Phase 1 ships independently. Phases 2-4 are optional and don't require
backend changes.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| TV image recognition needs the user to register their TV once (or aim for ~3 seconds) | One-tap "Anchor here" gesture that pins to the TV's plane manually |
| Vertical phone-holding fatigue while watching | Phone AR is **optional** — the web app stays primary; AR is a glance-up moment for goals & reactions |
| Privacy: camera always-on | All processing on-device; no frames leave the phone. Camera permission is per-session |
| Vision Pro / smart-glasses hardware reach | Stay phone-AR-first; the Vision Pro story is a vision-doc highlight, not a launch requirement |

---

## Why this is the right cross-platform extension for Brezn specifically

| Touchpoint | Fit |
|---|---|
| Stadium screen | Weak — fans at the stadium are not the target user; they're watching live |
| Push notifications | Useful but generic — every fantasy app already does this |
| Wearable alerts | Niche — small smartwatch fantasy-fan segment |
| **TV-anchored AR** | **Strongest** — Brezn IS a watch-party app. The TV is already where users look. Overlaying friends' reactions and the live leaderboard onto the broadcast turns the multiplayer experience spatial without leaving the couch. |

The AR concept doubles down on Brezn's core identity (shared moments around
a shared screen) instead of bolting on a feature that lives elsewhere.

---

## Status

This document describes a **concept** for Phase 1+. No AR code is shipped
today. The current Brezn product is the responsive web SPA documented in
the main [`README.md`](../README.md).
