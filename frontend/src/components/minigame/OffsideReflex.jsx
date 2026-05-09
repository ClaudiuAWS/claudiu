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
 */
export default function OffsideReflex({ config, startedAtMs, durationMs, onSubmit }) {
  const [submitted, setSubmitted] = useState(false)
  const [tapAtMs, setTapAtMs] = useState(null)
  const [expired, setExpired]   = useState(false)  // dot reached the end without a tap
  const startMs = useRef(startedAtMs ?? Date.now())
  startMs.current = startedAtMs ?? startMs.current

  const offsideMomentMs = config?.offsideMomentMs ?? Math.floor((durationMs ?? 8000) / 2)

  // Animate the attacker marker. We compute its x position from elapsed
  // time so it lines up exactly with the moment of truth, no matter what
  // the user's frame rate is. Visual range: 4% to 95% (5% margin each side).
  // The attacker hits the defender line at x=60% precisely when
  // elapsed === offsideMomentMs.
  const [attackerX, setAttackerX] = useState(4)
  useEffect(() => {
    // Freeze the attacker dot at its tap position so the user can see how
    // close they were to the defender line. Without this guard, the dot
    // keeps gliding to x=95% after submission and the visual feedback is
    // disconnected from the "26ms early" / "150ms late" verdict.
    if (submitted) return
    let raf
    const tick = () => {
      const elapsed = Date.now() - startMs.current
      const total   = durationMs ?? 8000
      const t       = Math.max(0, Math.min(1, elapsed / total))
      // Map t such that t = offsideMomentMs/total → x = 60.
      const moment = offsideMomentMs / total  // ratio 0-1
      let x
      if (t <= moment) {
        x = 4 + (60 - 4) * (t / moment)
      } else {
        x = 60 + (95 - 60) * ((t - moment) / (1 - moment))
      }
      setAttackerX(x)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else if (!submitted) {
        // Animation reached the end and the user didn't tap. Mark expired
        // so the button switches to a disabled "Too slow" state — without
        // this, users keep staring at the frozen dot and tap many seconds
        // late, recording bogus deltas like '11498ms late' on an 8s game.
        setExpired(true)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [durationMs, offsideMomentMs, submitted])

  const handleTap = () => {
    if (submitted) return
    const t = Date.now() - startMs.current
    setSubmitted(true)
    setTapAtMs(t)
    onSubmit({ clickedAt: t })
  }

  const deltaMs = tapAtMs != null ? tapAtMs - offsideMomentMs : null

  return (
    <div className="select-none">
      {/* Pitch lane */}
      <div
        className="relative w-full h-24 rounded-lg overflow-hidden border border-white/10"
        style={{
          background: 'linear-gradient(180deg, #0a3a14 0%, #0e5320 50%, #0a3a14 100%)',
        }}
      >
        {/* Defender line */}
        <div
          className="absolute top-2 bottom-2"
          style={{
            left: '60%',
            width: '2px',
            background: 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 0 8px rgba(255, 255, 255, 0.6)',
          }}
        />
        {/* Attacker marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
          style={{ left: `${attackerX}%`, transition: 'none' }}
        >
          <div
            className="w-5 h-5 rounded-full"
            style={{
              background: '#fbbf24',
              boxShadow: '0 0 12px rgba(251, 191, 36, 0.9)',
            }}
          />
        </div>

        {/* Defender label */}
        <div className="absolute bottom-1 left-[60%] -translate-x-1/2 text-[8px] text-white/70 font-bold tracking-wider">
          DEF
        </div>
      </div>

      {/* Tap button — three states: live, tapped, expired (too slow) */}
      <button
        onClick={handleTap}
        disabled={submitted || expired}
        className={`w-full mt-4 py-4 rounded-xl text-lg font-extrabold tracking-widest transition ${
          submitted
            ? 'bg-gray-700 text-gray-400 cursor-default'
            : expired
              ? 'bg-red-900/40 text-red-400 border border-red-500/30 cursor-default'
              : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg active:scale-95'
        }`}
      >
        {submitted ? 'TAPPED ✓' : expired ? '⏰ TOO SLOW' : 'TAP NOW'}
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

      {/* Feedback when window closed without a tap */}
      {expired && !submitted && (
        <div className="mt-3 text-center">
          <p className="text-xs text-red-400/80">You missed the window</p>
          <p className="text-[11px] text-gray-500 mt-1">Resolving with no points…</p>
        </div>
      )}
    </div>
  )
}
