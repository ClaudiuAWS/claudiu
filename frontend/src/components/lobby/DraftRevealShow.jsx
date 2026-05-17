import { useEffect, useState } from 'react'
import { PitchView } from '../match/PitchView'

// Reveal needs longer dwell now that we actually show the squads on a
// pitch — readers need time to scan formations + spot captain rings.
const COUNTDOWN_S = 3
const REVEAL_MS   = 5500
const KICKOFF_MS  = 1500
const TOTAL_MS    = COUNTDOWN_S * 1000 + REVEAL_MS + KICKOFF_MS

// Position groups, used only for deriving the formation label string
// (e.g. "4-3-3"). The actual on-pitch placement is owned by PitchView's
// assignPlayersToFormation helper.
const POS_GROUP = {
  TW:  'GK',
  IVZ: 'DEF', IVL: 'DEF', IVR: 'DEF', IV: 'DEF', LV: 'DEF', RV: 'DEF',
  DMZ: 'MID', DML: 'MID', DMR: 'MID', DLM: 'MID', DRM: 'MID',
  ZO:  'MID', OLM: 'MID', ORM: 'MID',
  LA:  'FWD', RA: 'FWD', STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}

function formationString(details = []) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const p of details) {
    counts[POS_GROUP[p.position] || 'MID']++
  }
  // Skip GK in the conventional formation label (e.g. "4-3-3" = 4 DEF + 3 MID + 3 FWD).
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`
}

/**
 * DraftRevealShow — the pre-match "all squads locked" moment.
 *
 * Fires once per room session when every member has confirmed their
 * 11-player teamSelection. Hot beats:
 *   1. Stadium-font countdown 3-2-1 (red glow)
 *   2. "TEAMS REVEALED" banner + each member's full XI as a position-
 *      grouped row of player avatars with their detected formation.
 *   3. "KICKOFF" pulse, then auto-close
 *
 * Skip control (corner X) for impatient hosts.
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
    const toKickoff = setTimeout(() => setPhase('kickoff'), COUNTDOWN_S * 1000 + REVEAL_MS)
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
        <div className="text-center px-4 max-h-[90vh] overflow-y-auto py-6">
          <p
            className="text-white font-stadium text-3xl leading-none mb-6"
            style={{
              letterSpacing: '0.08em',
              textShadow: '0 0 24px rgba(220,38,38,0.55), 0 4px 0 rgba(0,0,0,0.6)',
            }}
          >
            TEAMS REVEALED
          </p>
          <div className="flex flex-col gap-3 max-w-md mx-auto">
            {members.map((m, i) => {
              const details   = m.teamSelectionDetails || []
              const captain   = m.captainPlayerId || null
              const formation = details.length === 11 ? formationString(details) : '4-2-3-1'
              return (
                <div
                  key={m.userId}
                  className="rounded-2xl px-3 py-3"
                  style={{
                    background: 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)',
                    border: '1px solid rgba(248,113,113,0.40)',
                    animation: `slideIn 350ms ${i * 180}ms ease-out backwards`,
                  }}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-white text-sm font-bold tracking-wide truncate text-left flex-1">
                      {m.displayName}
                    </span>
                    {details.length === 11 && (
                      <span className="text-gray-400 text-[10px] font-bold tracking-widest tabular-nums">
                        {formation}
                      </span>
                    )}
                    <span
                      className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full text-amber-300 flex-shrink-0"
                      style={{
                        background: 'rgba(252,211,77,0.10)',
                        border: '1px solid rgba(252,211,77,0.35)',
                      }}
                    >
                      11/11
                    </span>
                  </div>

                  {/* Full pitch with the locked XI in formation. PitchView
                      handles position assignment + captain highlight; we
                      hide its built-in header since the member name above
                      already serves that role. */}
                  <PitchView
                    teamPlayers={details}
                    teamRole="home"
                    formation={formation}
                    captainPlayerId={captain}
                    maxHeight="260px"
                    showHeader={false}
                  />
                </div>
              )
            })}
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
