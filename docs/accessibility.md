# Accessibility audit + polish — Brezn

The DFL × Adidas challenge brief explicitly calls out **accessibility and
inclusion** as a theme. This doc lists the audit findings and the polish
landed in pass 39 (final submission sprint).

---

## Audit findings (pre-pass-39)

| Surface | Issue | Severity |
|---|---|---|
| `DirectorCommentary.jsx` (live AI commentary stack) | Screen readers don't announce new commentary lines as they arrive — important context for visually-impaired users following along | Medium |
| `MatchEndCelebration.jsx` (red confetti + sting) | Confetti animation has no `prefers-reduced-motion` opt-out — risk for vestibular-disorder users | Medium |
| `ReactionsButton.jsx` (FAB + emoji picker) | Already has `aria-label`s on each emoji button (verified) | OK |
| Badge PNGs | Already have `alt` text from `badge.title` on every BadgeCard | OK |
| Brezn Agent mascot | Most usages have `alt=""` (decorative) — correct | OK |
| Tier badges (bronze / silver / gold) | Rim colours `#cd7f32 / #c0c0c0 / #ffd700` against the dark card backgrounds pass WCAG AA contrast for non-text decorative UI | OK |
| Buttons (active scale, hover) | React standard keyboard nav works (Tab, Enter, Space) | OK |
| Form inputs (login, room code) | Standard `<input>` elements, browser handles focus + screen reader announcements | OK |

---

## Polish landed in pass 39

### 1. `aria-live="polite"` on the commentary stack

Screen readers now announce each new Brezn Agent line as it arrives. The
`polite` politeness level means the announcement waits for the user's
current speech to finish — no rude interruptions.

[`frontend/src/components/match/DirectorCommentary.jsx`](../frontend/src/components/match/DirectorCommentary.jsx):
the outer container has `aria-live="polite"`. The inner `<p>` carries the
text in `entry.text`, so the announcement is the commentary itself —
"Olise doubles Bayern's lead — clinical!"

### 2. `prefers-reduced-motion` guard on the match-end confetti

[`frontend/src/components/match/MatchEndCelebration.jsx`](../frontend/src/components/match/MatchEndCelebration.jsx):
the confetti emitter wraps its CSS animation in a `@media (prefers-reduced-motion: reduce)` block. When the OS-level toggle is on, no confetti renders. The summary popup + audio fade-in still play (those don't trigger vestibular issues).

### 3. Verified existing accessibility wins

- Every reaction-picker emoji button has `aria-label={`React with ${e}`}` — screen reader users hear "React with beer", "React with wurst", etc.
- Every `BadgeCard` has `alt={badge.title}` on the image — Maiden Victory, Hat Trick Hero, etc.
- The Brezn Agent mascot in `DirectorCommentary` uses `alt=""` + `aria-hidden="true"` — correctly marked decorative since the label text "Brezn Agent" is read by the screen reader instead.
- `BadgePreviewModal` and `ItemPreviewModal` use `role="dialog"` + `aria-modal="true"` + `aria-label="Close preview"` on the X button.

---

## Areas left for a future pass

- **High-contrast mode toggle** — at present, all visual states pass WCAG AA contrast on the default dark theme. A user-toggleable high-contrast mode would help users with low vision or in bright sunlight. ~4 hours.
- **Keyboard shortcuts** — the only keyboard-relevant flow today is form input + tab navigation. Adding shortcuts (e.g. `R` for reactions picker, `1-7` for emoji selection, `Esc` for modals) would improve power-user accessibility. ~2 hours.
- **Live captions for match audio** — the in-match music tracks have no captions, and the match-end TikTok sting is decorative-only. The current SFX is short and not informational, so this is low-priority. ~3 hours if added.
- **Voice-over of commentary for fully-blind users** — TTS readout of the agent's lines on a hotkey. ~4 hours.

The intent is to keep iterating after the submission window closes.
