import { useEffect, useState } from 'react'
import { gameTimeToSeconds, formatFootballTime } from '../../utils/matchEvents'

/**
 * Broadcast-style fullscreen highlight for goals and red cards.
 *
 * Pure presentation: takes a `highlight` payload and an `onDismiss`
 * handler. The queue + auto-dismiss timer live in `useHighlights`.
 *
 * Two visual variants share a layout shell so they animate in/out the
 * same way:
 *   - GOAL    (gold/red, big "GOAL!" or "PENALTY", scorer + minute + score)
 *   - REDCARD (red diagonal stripes, "RED CARD", player name + minute)
 *
 * `forYourSquad` flips the goal variant into Bundesliga-red mode so the
 * user can immediately tell whether they earned points.
 *
 * Tap-anywhere-to-dismiss. Respects reduced-motion via the hook (callers
 * pass it through; here we just honour the `reducedMotion` flag by
 * skipping the entrance scale animation).
 */
export default function HighlightOverlay({ highlight, onDismiss, reducedMotion = false }) {
  const [phase, setPhase] = useState('enter')   // 'enter' → 'hold' → 'exit'

  // After a brief enter window, switch to hold (no transform). When parent
  // sets `highlight = null`, we unmount immediately — no lingering exit
  // animation needed because the queue is already advancing.
  useEffect(() => {
    setPhase('enter')
    const t = setTimeout(() => setPhase('hold'), reducedMotion ? 0 : 280)
    return () => clearTimeout(t)
  }, [highlight?.id, reducedMotion])

  if (!highlight) return null

  const isGoal = highlight.kind === 'goal'
  const isRed  = highlight.kind === 'redCard'

  // Football minute for the corner badge. Falls back to null if we can't
  // parse the gameTime string — minute pill just hides in that case.
  const minute = (() => {
    if (!highlight.gameTime) return null
    const sec = gameTimeToSeconds(highlight.gameTime)
    if (sec < 0) return null
    const formatted = formatFootballTime(sec)
    // formatFootballTime returns e.g. "23'" or "45+2'"; strip the trailing '
    // since we render it ourselves on the badge so the styling is consistent.
    return formatted.replace(/'$/, '') || null
  })()

  // Visual palette
  const palette = isGoal && highlight.forYourSquad
    ? PALETTE.goalForYou
    : isGoal
      ? PALETTE.goalGeneric
      : PALETTE.redCard

  // Animation classes — keyed by `id` so re-mount re-runs them
  const enterTransform = phase === 'enter' && !reducedMotion ? 'scale-90 opacity-0' : 'scale-100 opacity-100'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6 cursor-pointer"
      role="alert"
      aria-live="assertive"
      onClick={onDismiss}
    >
      {/* Backdrop — quick fade in. Pointer-events captured by parent so
          tap-anywhere dismiss works wherever the user taps. */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          background: palette.backdrop,
          opacity: phase === 'enter' && !reducedMotion ? 0 : 1,
        }}
      />

      {/* Optional decorative pattern (red-card diagonal stripes) */}
      {isRed && <DiagonalStripesBackground />}

      {/* Card */}
      <div
        className={`relative max-w-md w-full rounded-3xl overflow-hidden transition-all duration-300 ease-out ${enterTransform}`}
        style={{
          background: palette.cardBg,
          border: `1px solid ${palette.cardBorder}`,
          boxShadow: `0 30px 80px -20px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
      >
        {/* Top sheen — same convention as BadgesPage banner */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="relative px-6 py-7 flex flex-col items-center text-center">
          {/* Minute badge */}
          {minute && (
            <span
              className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full mb-4"
              style={{
                background: palette.minuteBg,
                color: palette.minuteText,
                border: `1px solid ${palette.minuteBorder}`,
              }}
            >
              {minute}'
            </span>
          )}

          {/* Big title */}
          <h2
            className="font-stadium leading-none tracking-wide"
            style={{
              fontSize: 'clamp(48px, 14vw, 72px)',
              color: palette.titleColor,
              textShadow: palette.titleShadow,
              letterSpacing: '0.08em',
            }}
          >
            {highlight.title}
          </h2>

          {/* Sub: player name */}
          <p
            className="mt-3 text-white font-bold text-lg tracking-wide truncate max-w-full"
            style={{ textShadow: '0 2px 0 rgba(0,0,0,0.4)' }}
          >
            {highlight.playerName}
          </p>

          {/* Score line (goals only) */}
          {isGoal && highlight.score && (
            <p
              className="mt-1 font-stadium text-2xl tabular-nums"
              style={{
                letterSpacing: '0.10em',
                color: 'rgba(255,255,255,0.85)',
                textShadow: '0 2px 0 rgba(0,0,0,0.4)',
              }}
            >
              {highlight.score}
            </p>
          )}

          {/* "For your squad" tag */}
          {isGoal && highlight.forYourSquad && (
            <div
              className="mt-4 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.30) 0%, rgba(153,27,27,0.18) 100%)',
                color: '#fca5a5',
                border: '1px solid rgba(248,113,113,0.45)',
                boxShadow: '0 0 18px -4px rgba(220,38,38,0.50)',
              }}
            >
              +5 for your squad
            </div>
          )}
        </div>

        {/* Tap-to-skip hint (subtle) */}
        <div
          className="absolute bottom-2 left-0 right-0 text-center text-[9px] tracking-widest uppercase font-semibold pointer-events-none"
          style={{ color: 'rgba(255,255,255,0.30)' }}
        >
          tap to skip
        </div>
      </div>
    </div>
  )
}

// ---------- Palette ------------------------------------------------------

const PALETTE = {
  // Goal scored by one of YOUR drafted players → Bundesliga red.
  goalForYou: {
    backdrop:     'radial-gradient(ellipse at center, rgba(220,38,38,0.45) 0%, rgba(0,0,0,0.85) 70%)',
    cardBg:       'linear-gradient(180deg, #1a0606 0%, #0d0303 100%)',
    cardBorder:   'rgba(248,113,113,0.45)',
    glow:         'rgba(220,38,38,0.55)',
    titleColor:   '#ffffff',
    titleShadow:  '0 4px 0 rgba(0,0,0,0.55), 0 0 28px rgba(220,38,38,0.55)',
    minuteBg:     'rgba(220,38,38,0.20)',
    minuteText:   '#fca5a5',
    minuteBorder: 'rgba(248,113,113,0.45)',
  },
  // Generic goal (opponent's player or unmapped) → gold accents, neutral.
  goalGeneric: {
    backdrop:     'radial-gradient(ellipse at center, rgba(15,23,42,0.85) 0%, rgba(0,0,0,0.90) 70%)',
    cardBg:       'linear-gradient(180deg, #131720 0%, #0a0d12 100%)',
    cardBorder:   'rgba(234,179,8,0.40)',
    glow:         'rgba(234,179,8,0.40)',
    titleColor:   '#fde68a',
    titleShadow:  '0 4px 0 rgba(0,0,0,0.55), 0 0 22px rgba(234,179,8,0.40)',
    minuteBg:     'rgba(234,179,8,0.15)',
    minuteText:   '#fde68a',
    minuteBorder: 'rgba(234,179,8,0.35)',
  },
  // Red card → red diagonal background, sharp white title.
  redCard: {
    backdrop:     'radial-gradient(ellipse at center, rgba(127,29,29,0.85) 0%, rgba(0,0,0,0.92) 70%)',
    cardBg:       'linear-gradient(180deg, #1a0808 0%, #0d0404 100%)',
    cardBorder:   'rgba(220,38,38,0.55)',
    glow:         'rgba(127,29,29,0.55)',
    titleColor:   '#ffffff',
    titleShadow:  '0 4px 0 rgba(0,0,0,0.55), 0 0 22px rgba(220,38,38,0.45)',
    minuteBg:     'rgba(220,38,38,0.18)',
    minuteText:   '#fca5a5',
    minuteBorder: 'rgba(248,113,113,0.40)',
  },
}

// ---------- Decorative red-card stripe background ------------------------

function DiagonalStripesBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-[0.12]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(220,38,38,0.6) 0 12px, transparent 12px 36px)',
      }}
    />
  )
}
