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

        {/* Defender silhouette */}
        <DefenderSilhouette />

        {/* Attacker runner */}
        <Runner x={attackerX} imageUrl={offsidePlayer?.imageUrl} running={!submitted && !expired} />

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

function DefenderSilhouette() {
  return (
    <svg
      className="absolute"
      style={{ left: 'calc(60% - 8px)', bottom: '6px', opacity: 0.55 }}
      width="16" height="36" viewBox="0 0 16 36" fill="none"
    >
      {/* head */}
      <circle cx="8" cy="5" r="3.5" fill="#fff" />
      {/* body */}
      <path d="M3 11 Q8 8 13 11 L12 23 Q8 22 4 23 Z" fill="#fff" />
      {/* legs */}
      <rect x="4" y="22" width="3" height="12" rx="1.2" fill="#fff" />
      <rect x="9" y="22" width="3" height="12" rx="1.2" fill="#fff" />
    </svg>
  )
}

function Runner({ x, imageUrl, running }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
      style={{ left: `${x}%`, transition: 'none' }}
    >
      <div className={`relative ${running ? 'runner-bob' : ''}`} style={{ width: 28, height: 36 }}>
        {/* Head — player photo if we have it, else yellow ball fallback */}
        {imageUrl ? (
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: 0,
              width: 18,
              height: 18,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#1f2937',
              boxShadow: '0 0 0 2px #fde047, 0 0 10px rgba(253,224,71,0.75)',
            }}
          >
            <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: 2,
              width: 16, height: 16,
              borderRadius: '50%',
              background: '#fbbf24',
              boxShadow: '0 0 12px rgba(251,191,36,0.9)',
            }}
          />
        )}
        {/* Body */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: 16,
            width: 12,
            height: 12,
            background: '#fde047',
            borderRadius: '4px 4px 2px 2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
        {/* Legs */}
        <div
          className={`absolute ${running ? 'runner-leg-l' : ''}`}
          style={{
            left: 'calc(50% - 4px)',
            top: 26,
            width: 3,
            height: 10,
            background: '#fde047',
            borderRadius: 1,
          }}
        />
        <div
          className={`absolute ${running ? 'runner-leg-r' : ''}`}
          style={{
            left: 'calc(50% + 1px)',
            top: 26,
            width: 3,
            height: 10,
            background: '#fde047',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  )
}
