import { useEffect, useState } from 'react'

// Reveal needs longer dwell now that we actually show the squads — the
// member tile + 11-avatar strip needs time to read.
const COUNTDOWN_S = 3
const REVEAL_MS   = 5500
const KICKOFF_MS  = 1500
const TOTAL_MS    = COUNTDOWN_S * 1000 + REVEAL_MS + KICKOFF_MS

// Position-bucket map — keep in sync with formationPositions but inlined
// so DraftRevealShow stays self-contained.
const POS_GROUP = {
  TW:  'GK',
  IVZ: 'DEF', IVL: 'DEF', IVR: 'DEF', IV: 'DEF', LV: 'DEF', RV: 'DEF',
  DMZ: 'MID', DML: 'MID', DMR: 'MID', DLM: 'MID', DRM: 'MID',
  ZO:  'MID', OLM: 'MID', ORM: 'MID',
  LA:  'FWD', RA: 'FWD', STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}
const GROUP_ORDER = ['GK', 'DEF', 'MID', 'FWD']
const GROUP_TINT = {
  GK:  'rgba(234,179,8,0.20)',   // yellow
  DEF: 'rgba(59,130,246,0.20)',  // blue
  MID: 'rgba(16,185,129,0.20)',  // emerald
  FWD: 'rgba(239,68,68,0.20)',   // red
}

function groupPlayers(details = []) {
  const out = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of details) {
    const g = POS_GROUP[p.position] || 'MID'
    out[g].push(p)
  }
  return out
}

function formationString(details = []) {
  const g = groupPlayers(details)
  // Skip GK in the conventional formation label (e.g. "4-3-3" = 4 DEF + 3 MID + 3 FWD).
  return `${g.DEF.length}-${g.MID.length}-${g.FWD.length}`
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
              const details  = m.teamSelectionDetails || []
              const grouped  = groupPlayers(details)
              const captain  = m.captainPlayerId || ''
              const formation = details.length === 11 ? formationString(details) : ''
              return (
                <div
                  key={m.userId}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)',
                    border: '1px solid rgba(248,113,113,0.40)',
                    animation: `slideIn 350ms ${i * 150}ms ease-out backwards`,
                  }}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-white text-sm font-bold tracking-wide truncate text-left flex-1">
                      {m.displayName}
                    </span>
                    {formation && (
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

                  {/* Position-grouped player rows */}
                  <div className="flex flex-col gap-1.5">
                    {GROUP_ORDER.map(group => {
                      const players = grouped[group] || []
                      if (!players.length) return null
                      return (
                        <div key={group} className="flex items-center gap-1.5">
                          <span
                            className="text-[8px] font-black tracking-widest text-white/70 w-7 text-center py-0.5 rounded flex-shrink-0"
                            style={{ background: GROUP_TINT[group] }}
                          >
                            {group}
                          </span>
                          <div className="flex gap-1 flex-wrap flex-1 justify-start">
                            {players.map(p => {
                              const isCaptain = p.playerId && captain === p.playerId
                              return (
                                <div
                                  key={p.playerId || p.shirtNumber}
                                  className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                                  style={{
                                    border: `1.5px solid ${isCaptain ? '#60a5fa' : 'rgba(255,255,255,0.20)'}`,
                                    boxShadow: isCaptain
                                      ? '0 0 8px rgba(96,165,250,0.85)'
                                      : '0 2px 6px rgba(0,0,0,0.5)',
                                  }}
                                  title={p.displayName || p.shirtNumber}
                                >
                                  {p.imageUrl ? (
                                    <img
                                      src={p.imageUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover object-top"
                                    />
                                  ) : (
                                    <div
                                      className="w-full h-full flex items-center justify-center text-[9px] font-black text-white"
                                      style={{ background: 'rgba(8,12,26,0.92)' }}
                                    >
                                      {p.shirtNumber || '?'}
                                    </div>
                                  )}
                                  {isCaptain && (
                                    <span
                                      className="absolute -top-1 left-1/2 -translate-x-1/2 text-[7px] font-black"
                                      style={{
                                        color: '#0b1330',
                                        background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
                                        border: '1px solid #bfdbfe',
                                        width: 11,
                                        height: 11,
                                        borderRadius: '50%',
                                        lineHeight: '9px',
                                        textAlign: 'center',
                                      }}
                                      aria-hidden="true"
                                    >
                                      C
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
