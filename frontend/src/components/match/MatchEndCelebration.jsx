import { useEffect, useRef } from 'react'

// Full-time celebration — fires once when the match transitions to "ended".
// Plays the TikTok-sourced end-of-match sound effect and rains red confetti
// across the whole viewport for ~3 seconds.
//
// Driven by `shown` prop from useRoom's `matchJustEnded` flag, which the
// hook auto-resets after 5s. The audio plays exactly once per "shown=true"
// rising edge thanks to playedRef, so a parent re-render won't double-trigger.

const CONFETTI_COUNT = 36

// Pre-computed pieces — varied left position, fall delay, duration, size,
// and rotation so the burst feels organic rather than a perfectly even grid.
const PIECES = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  left:     `${((i * 7.3) + (i % 5) * 1.9) % 98}%`,
  delay:    +((i * 0.07) % 1.2).toFixed(2),
  duration: +(1.8 + (i % 5) * 0.22).toFixed(2),
  size:     6 + (i % 4) * 2,
  rotEnd:   360 + (i % 3) * 360,
}))

export default function MatchEndCelebration({ shown }) {
  const playedRef = useRef(false)

  useEffect(() => {
    if (!shown) {
      playedRef.current = false
      return
    }
    if (playedRef.current) return
    playedRef.current = true
    try {
      const audio = new Audio('/songs/sfx-match-end.mp3')
      audio.volume = 0.6
      audio.play().catch(() => {
        // Browser autoplay policy may block if there's been no user
        // gesture this session — silent failure is the right behaviour;
        // the visual confetti still fires.
      })
    } catch {
      // Audio constructor failed (very old browser) — just skip the sfx.
    }
  }, [shown])

  if (!shown) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[100] overflow-hidden"
      aria-hidden="true"
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute -top-4 block"
          style={{
            left:            p.left,
            width:           p.size,
            height:          p.size * 0.55,
            backgroundColor: '#dc2626',
            borderRadius:    '2px',
            // The keyframe references --rot-end so each piece spins by a
            // different amount; CSS custom prop set per-instance below.
            '--rot-end':     `${p.rotEnd}deg`,
            animation:       `matchEndConfetti ${p.duration}s cubic-bezier(.45,.05,.55,.95) ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes matchEndConfetti {
          0%   { transform: translateY(0)     rotate(0deg);          opacity: 0; }
          8%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(var(--rot-end)); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
