import { useEffect, useRef, useState } from 'react'

/**
 * OFFSIDE_REFLEX game UI.
 *
 * A horizontal pitch lane. The defender line is at x=60% (fixed). The
 * attacker marker animates left-to-right from x=0 over `durationMs`. The
 * "true offside moment" is `config.offsideMomentMs` after game start —
 * which is when the attacker's CSS x position equals the defender line
 * (so the visual prompt matches the bracket math).
 *
 * User taps the TAP button. We record `clickedAt = Date.now() - startedAtMs`
 * and call `onSubmit({clickedAt})`. Backend / `useMiniGame` then computes
 * the bracket score from the delta to `offsideMomentMs`.
 *
 * Visual layering (no gameplay changes):
 *   - Stadium pitch background with touchlines, stripes, and a faint shadow.
 *   - Scoring brackets rendered as translucent bands behind the defender line
 *     (green ±150ms, yellow ±300ms, orange ±600ms). Derived directly from
 *     durationMs + offsideMomentMs so they stay exact.
 *   - Attacker is a runner silhouette with the offside player's face (if
 *     available) as a head. Falls back to the original yellow dot.
 *   - After tap: a vertical "stamp" tick drops at the striker's x position
 *     and another at the defender line (ideal moment). The gap between them
 *     visualises the delta.
 */

// Map a time-delta-from-moment (ms) to an x-offset relative to the defender
// line (60%). Uses the same piecewise linear mapping as the animation so the
// bracket bands perfectly align with what the striker is doing on-screen.
function msToPitchX(deltaMs, offsideMomentMs, durationMs) {
  const total = durationMs
  const moment = offsideMomentMs / total
  const targetT = (offsideMomentMs + deltaMs) / total
  const t = Math.max(0, Math.min(1, targetT))
  if (t <= moment) return 4 + (60 - 4) * (t / moment)
  return 60 + (95 - 60) * ((t - moment) / (1 - moment))
}

export default function OffsideReflex({ config, startedAtMs, durationMs, onSubmit, offsidePlayer }) {
  const [submitted, setSubmitted] = useState(false)
  const [tapAtMs, setTapAtMs] = useState(null)
  const [expired, setExpired] = useState(false)
  const startMs = useRef(startedAtMs ?? Date.now())
  startMs.current = startedAtMs ?? startMs.current

  const offsideMomentMs = config?.offsideMomentMs ?? Math.floor((durationMs ?? 8000) / 2)
  const total = durationMs ?? 8000

  const [attackerX, setAttackerX] = useState(4)
  useEffect(() => {
    if (submitted) return
    let raf
    const tick = () => {
      const elapsed = Date.now() - startMs.current
      const t = Math.max(0, Math.min(1, elapsed / total))
      const moment = offsideMomentMs / total
      let x
      if (t <= moment) x = 4 + (60 - 4) * (t / moment)
      else             x = 60 + (95 - 60) * ((t - moment) / (1 - moment))
      setAttackerX(x)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else if (!submitted) {
        setExpired(true)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [total, offsideMomentMs, submitted])

  // Proximity to the moment drives a subtle tension glow on the defender line.
  const elapsed = Date.now() - startMs.current
  const msToMoment = Math.abs(offsideMomentMs - elapsed)
  const tension = Math.max(0, 1 - msToMoment / 800) // 0..1 in the last 800ms before/after

  // Fuse: 3 dots lit when we're >1500ms from the moment, 2 at 1500, 1 at 750, 0 at the line.
  const msBefore = offsideMomentMs - elapsed
  const fuseRemaining =
    msBefore >= 1500 ? 3 :
    msBefore >=  750 ? 2 :
    msBefore >=    0 ? 1 :
                       0

  const handleTap = () => {
    if (submitted || expired) return
    const t = Date.now() - startMs.current
    setSubmitted(true)
    setTapAtMs(t)
    // Haptic buzz on mobile — no-op on desktop.
    try { navigator.vibrate?.(20) } catch {}
    onSubmit({ clickedAt: t })
  }

  const deltaMs = tapAtMs != null ? tapAtMs - offsideMomentMs : null
  const bracket =
    deltaMs == null ? null :
    Math.abs(deltaMs) <= 150 ? 'perfect' :
    Math.abs(deltaMs) <= 300 ? 'great'   :
    Math.abs(deltaMs) <= 600 ? 'ok'      : 'miss'

  // Bracket band widths anchored to the defender line (60%)
  const bandGreen  = { left: msToPitchX(-150, offsideMomentMs, total), right: msToPitchX( 150, offsideMomentMs, total) }
  const bandYellow = { left: msToPitchX(-300, offsideMomentMs, total), right: msToPitchX( 300, offsideMomentMs, total) }
  const bandOrange = { left: msToPitchX(-600, offsideMomentMs, total), right: msToPitchX( 600, offsideMomentMs, total) }

  return (
    <div className="select-none">
      {/* Pitch lane */}
      <div
        className="relative w-full h-28 rounded-xl overflow-hidden"
        style={{
          background: `
            linear-gradient(90deg, rgba(0,0,0,0.20) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.20) 100%),
            repeating-linear-gradient(90deg, #0e5320 0px, #0e5320 28px, #0c4a1c 28px, #0c4a1c 56px),
            linear-gradient(180deg, #0a3a14 0%, #0e5320 50%, #0a3a14 100%)
          `,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        {/* Top + bottom touchline */}
        <div className="absolute left-0 right-0 top-0 h-px" style={{ background: 'rgba(255,255,255,0.22)' }} />
        <div className="absolute left-0 right-0 bottom-0 h-px" style={{ background: 'rgba(255,255,255,0.22)' }} />

        {/* Bracket bands (widest first so narrower sits on top) */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${bandOrange.left}%`,
            width: `${bandOrange.right - bandOrange.left}%`,
            background: 'linear-gradient(180deg, rgba(249,115,22,0.14) 0%, rgba(249,115,22,0.06) 100%)',
          }}
        />
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${bandYellow.left}%`,
            width: `${bandYellow.right - bandYellow.left}%`,
            background: 'linear-gradient(180deg, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0.07) 100%)',
          }}
        />
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${bandGreen.left}%`,
            width: `${bandGreen.right - bandGreen.left}%`,
            background: 'linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.10) 100%)',
          }}
        />

        {/* Defender line */}
        <div
          className="absolute top-1 bottom-1"
          style={{
            left: '60%',
            width: '2px',
            background: 'rgba(255, 255, 255, 0.9)',
            boxShadow: `0 0 ${8 + tension * 12}px rgba(255, 255, 255, ${0.55 + tension * 0.4})`,
          }}
        />

        {/* Attacker runner */}
        <Runner
          x={attackerX}
          imageUrl={offsidePlayer?.imageUrl}
          running={!submitted && !expired}
          fuseRemaining={submitted || expired ? null : fuseRemaining}
        />

        {/* Linesman flag — up for a hit, crossed/low for a miss */}
        {submitted && bracket && (
          <LinesmanFlag verdict={bracket === 'miss' ? 'miss' : 'good'} />
        )}
        {expired && <LinesmanFlag verdict="miss" />}

        {/* Tap stamp: vertical tick at user's tap x + at the ideal moment */}
        {submitted && tapAtMs != null && (
          <>
            <div
              className="absolute top-0 bottom-0 pointer-events-none stamp-in"
              style={{
                left: `${msToPitchX(deltaMs, offsideMomentMs, total)}%`,
                width: '2px',
                background: bracket === 'miss' ? '#ef4444' : '#fde047',
                boxShadow: `0 0 6px ${bracket === 'miss' ? 'rgba(239,68,68,0.8)' : 'rgba(253,224,71,0.8)'}`,
              }}
            >
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                style={{ background: bracket === 'miss' ? '#ef4444' : '#fde047' }}
              />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                style={{ background: bracket === 'miss' ? '#ef4444' : '#fde047' }}
              />
            </div>
          </>
        )}

        {/* Labels */}
        <div className="absolute bottom-1 left-[60%] -translate-x-1/2 text-[8px] text-white/70 font-bold tracking-wider">
          LINE
        </div>
      </div>

      {/* Tap button */}
      <button
        onClick={handleTap}
        disabled={submitted || expired}
        className={`w-full mt-4 py-4 rounded-xl text-lg font-extrabold tracking-widest transition-all ${
          submitted
            ? (bracket === 'perfect' ? 'bg-emerald-500 text-black'
              : bracket === 'great'  ? 'bg-lime-500 text-black'
              : bracket === 'ok'     ? 'bg-amber-500 text-black'
              :                        'bg-gray-700 text-gray-400')
            : expired
              ? 'bg-red-900/40 text-red-400 border border-red-500/30 cursor-default'
              : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg active:scale-95'
        }`}
        style={!submitted && !expired ? { boxShadow: `0 0 ${8 + tension * 20}px rgba(250,204,21,${0.3 + tension * 0.5})` } : {}}
      >
        {submitted
          ? (bracket === 'perfect' ? 'PERFECT ✓'
            : bracket === 'great'  ? 'GREAT ✓'
            : bracket === 'ok'     ? 'OK ✓'
            :                        'TAPPED')
          : expired ? '⏰ TOO SLOW' : 'TAP NOW'}
      </button>

      {/* Feedback after tap */}
      {submitted && deltaMs != null && (
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-400">Your tap was</p>
          <p className="text-lg font-black tabular-nums text-white">
            {Math.abs(deltaMs)}ms
            <span className="text-sm font-normal text-gray-400 ml-1">
              {deltaMs > 0 ? 'late' : 'early'}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Waiting for opponent…</p>
        </div>
      )}

      {expired && !submitted && (
        <div className="mt-3 text-center">
          <p className="text-xs text-red-400/80">You missed the window</p>
          <p className="text-[11px] text-gray-500 mt-1">Resolving with no points…</p>
        </div>
      )}
    </div>
  )
}

// -------- helpers --------

function Runner({ x, imageUrl, running, fuseRemaining }) {
  // fuseRemaining is 0..3 (dots still lit). null = hide fuse entirely (post-tap).
  const showFuse = fuseRemaining != null && running
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
      style={{ left: `${x}%`, transition: 'none' }}
    >
      {/* Fuse dots */}
      {showFuse && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-5 flex items-center gap-1">
          {[0, 1, 2].map(i => {
            const lit = i < fuseRemaining
            return (
              <div
                key={i}
                className="rounded-full transition-all duration-150"
                style={{
                  width: lit ? 5 : 3,
                  height: lit ? 5 : 3,
                  background: lit ? '#fde047' : 'rgba(255,255,255,0.18)',
                  boxShadow: lit ? '0 0 6px rgba(253,224,71,0.85)' : 'none',
                }}
              />
            )
          })}
        </div>
      )}

      <div className={running ? 'runner-bob' : ''}>
        {imageUrl ? (
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: 26,
              height: 26,
              background: '#1f2937',
              boxShadow: '0 0 0 2px #fde047, 0 0 14px rgba(253,224,71,0.9)',
            }}
          >
            <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="rounded-full"
            style={{
              width: 20,
              height: 20,
              background: '#fbbf24',
              boxShadow: '0 0 14px rgba(251,191,36,0.95)',
            }}
          />
        )}
      </div>
    </div>
  )
}

// Linesman flag — raised for an in-bracket tap, lowered (crossed through) for miss/expired.
function LinesmanFlag({ verdict }) {
  // verdict: 'good' | 'miss'
  const isGood = verdict === 'good'
  return (
    <div className="absolute top-1 right-2 pointer-events-none flag-pop">
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none">
        {/* pole */}
        <rect x="15" y="4" width="2" height="36" rx="1" fill="#e5e7eb" />
        {/* flag */}
        <path
          d={isGood ? 'M17 6 L33 10 L17 16 Z' : 'M17 22 L29 26 L17 30 Z'}
          fill={isGood ? '#fde047' : '#ef4444'}
          style={{
            filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.4))`,
          }}
        />
        {isGood && (
          <path
            d="M17 6 L33 10 L17 16 Z"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.5"
          />
        )}
      </svg>
    </div>
  )
}
