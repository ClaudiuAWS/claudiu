import { useEffect, useState } from 'react'

const TOTAL_MS = 6000
const COUNTDOWN_S = 3

/**
 * DraftRevealShow — the pre-match "all squads locked" moment.
 *
 * Fires once per room session when every member has confirmed their
 * 11-player teamSelection. Hot beats:
 *   1. Stadium-font countdown 3-2-1 (red glow)
 *   2. "ALL SQUADS LOCKED" banner with the room name
 *   3. Member tile reel — each `displayName` slides in with a small
 *      crest and a "READY" badge
 *   4. "KICKOFF" pulse, then auto-close
 *
 * Skip control (corner X) for impatient hosts. Total run ~6 s.
 */
export default function DraftRevealShow({ open, room, onClose }) {
  const [phase, setPhase] = useState('countdown') // countdown -> reveal -> kickoff
  const [count, setCount]  = useState(COUNTDOWN_S)

  useEffect(() => {
    if (!open) return
    setPhase('countdown')
    setCount(COUNTDOWN_S)

    const tick = setInterval(() => {
      setCount(c => (c <= 1 ? 0 : c - 1))
    }, 1000)

    const toReveal  = setTimeout(() => setPhase('reveal'),  COUNTDOWN_S * 1000)
    const toKickoff = setTimeout(() => setPhase('kickoff'), COUNTDOWN_S * 1000 + 2500)
    const toClose   = setTimeout(onClose, TOTAL_MS)

    return () => {
      clearInterval(tick)
      clearTimeout(toReveal)
      clearTimeout(toKickoff)
      clearTimeout(toClose)
    }
  }, [open, onClose])

  if (!open) return null

  const members = room?.members ?? []

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'radial-gradient(circle at 50% 30%, rgba(40,12,12,0.85) 0%, rgba(0,0,0,0.97) 75%)' }}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-9 h-9 rounded-full text-gray-400 hover:text-white transition-colors"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        aria-label="Skip"
      >
        ×
      </button>

      {phase === 'countdown' && (
        <div className="text-center">
          <p className="text-red-300 text-xs font-bold tracking-widest uppercase mb-4">
            All Squads Locked
          </p>
          <p
            key={count}
            className="text-white font-stadium leading-none"
            style={{
              fontSize: '12rem',
              letterSpacing: '0.05em',
              textShadow: '0 0 40px rgba(220,38,38,0.6), 0 8px 0 rgba(0,0,0,0.6)',
              animation: 'countTick 1s ease-out forwards',
            }}
          >
            {count || 'GO'}
          </p>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="text-center px-8">
          <p
            className="text-white font-stadium text-4xl leading-none mb-8"
            style={{
              letterSpacing: '0.08em',
              textShadow: '0 0 24px rgba(220,38,38,0.55), 0 4px 0 rgba(0,0,0,0.6)',
            }}
          >
            TEAMS REVEALED
          </p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            {members.map((m, i) => (
              <div
                key={m.userId}
                className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
                style={{
                  background: 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)',
                  border: '1px solid rgba(248,113,113,0.40)',
                  animation: `slideIn 350ms ${i * 120}ms ease-out backwards`,
                }}
              >
                <span className="text-white text-sm font-bold tracking-wide truncate">
                  {m.displayName}
                </span>
                <span
                  className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full text-amber-300"
                  style={{
                    background: 'rgba(252,211,77,0.10)',
                    border: '1px solid rgba(252,211,77,0.35)',
                  }}
                >
                  Ready · 11/11
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'kickoff' && (
        <p
          className="text-white font-stadium leading-none text-center"
          style={{
            fontSize: '7rem',
            letterSpacing: '0.10em',
            textShadow: '0 0 60px rgba(220,38,38,0.75), 0 8px 0 rgba(0,0,0,0.6)',
            animation: 'kickPulse 1.5s ease-out forwards',
          }}
        >
          KICKOFF
        </p>
      )}

      <style>{`
        @keyframes countTick {
          0%   { opacity: 0; transform: scale(0.5); }
          25%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0.95; transform: scale(1); }
        }
        @keyframes slideIn {
          0%   { opacity: 0; transform: translateX(-30px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes kickPulse {
          0%   { opacity: 0; transform: scale(0.6); }
          30%  { opacity: 1; transform: scale(1.1); }
          70%  { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}
