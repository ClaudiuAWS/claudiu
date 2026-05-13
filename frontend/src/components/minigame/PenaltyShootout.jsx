import { useEffect, useRef, useState } from 'react'

/**
 * PENALTY_SHOOTOUT game UI.
 *
 * One side plays the SHOOTER, the other the KEEPER. Role assigned by
 * ownership (whoever owns the penaltyTakerId is the shooter, opponent is
 * keeper; if neither, deterministic fallback by userId lex order).
 *
 * Mechanic — parallel commit within a 10s window:
 *   - Shooter: tap one of 5 target zones (TL TM TR BL BR) in the goal.
 *   - Keeper: tap one of the same 5 zones to dive.
 *   - When BOTH have committed (or timer expires), the animation runs:
 *       ball flies to the shooter's zone, keeper silhouette dives to
 *       their zone. Match = SAVE, mismatch = GOAL.
 *
 * Scoring (computed in minigameBot.js::_penaltyShootoutDeltas):
 *   Goal in TL/TR (top corners)  → shooter +8
 *   Goal in BL/BR                 → shooter +6
 *   Goal in TM/BM (middle)        → shooter +4
 *   Save (keeper correct)         → keeper +5
 *   Both timed out                → 0 to both
 *
 * Visual borrows: Angry Birds (trajectory arc on ball release, post shake
 * if it hits the woodwork), Cut the Rope (tactile button squish),
 * Doodle Jump (zero-friction tap with chunky icons), PvZ (lane-card layout).
 */

const ZONES = [
  { key: 'TL', label: '↖',  x: 18, y: 22, points: 8 },
  { key: 'TM', label: '⬆',  x: 50, y: 22, points: 4 },
  { key: 'TR', label: '↗',  x: 82, y: 22, points: 8 },
  { key: 'BL', label: '↙',  x: 18, y: 65, points: 6 },
  { key: 'BR', label: '↘',  x: 82, y: 65, points: 6 },
]

const BALL_START = { x: 50, y: 90 } // bottom of the goal panel

export default function PenaltyShootout({ config, startedAtMs, durationMs, onSubmit, role, takerDisplay, keeperDisplay }) {
  const [pick, setPick] = useState(null) // zone key
  const [phase, setPhase] = useState('aim') // aim → animating → done
  const submitMs = useRef(null)

  function _commit(zoneKey) {
    if (pick !== null) return
    submitMs.current = Date.now() - (startedAtMs ?? Date.now())
    setPick(zoneKey)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15) } catch {}
    }
    // We don't animate here — the modal closes & result panel renders the
    // outcome via minigame_result merge. Submit immediately so the backend
    // can resolve both roles.
    onSubmit({ zone: zoneKey, role, submittedAtMs: submitMs.current })
    setPhase('done')
  }

  const isShooter = role === 'shooter'
  const youHint = isShooter
    ? `You're shooting — pick a corner`
    : `You're in goal — guess the dive`
  const oppHint = isShooter
    ? `Opponent: keeper ${keeperDisplay ? `(${keeperDisplay})` : ''}`
    : `Opponent: shooter ${takerDisplay ? `(${takerDisplay})` : ''}`

  return (
    <div className="select-none">
      {/* Role banner */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <p className={`text-[9px] font-black tracking-widest uppercase ${isShooter ? 'text-emerald-400' : 'text-blue-400'}`}>
            {isShooter ? '⚽ Shooter' : '🧤 Keeper'}
          </p>
          <p className="text-white text-sm font-bold mt-0.5">{youHint}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-gray-500 uppercase tracking-widest">vs</p>
          <p className="text-gray-400 text-[11px] mt-0.5 max-w-[140px] truncate">{oppHint}</p>
        </div>
      </div>

      {/* Goal panel */}
      <div
        className="relative w-full rounded-xl overflow-hidden border-2 border-white/15"
        style={{
          background: 'linear-gradient(180deg, #0a3a14 0%, #0e5320 40%, #0a3a14 100%)',
          aspectRatio: '5 / 3',
        }}
      >
        {/* Goal frame: top crossbar + posts */}
        <div className="absolute" style={{ left: '8%', top: '8%', width: '84%', height: '60%' }}>
          {/* posts */}
          <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-white shadow-lg" />
          <div className="absolute top-0 right-0 bottom-0 w-[3px] bg-white shadow-lg" />
          {/* crossbar */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-white shadow-lg" />
          {/* net (repeating gradient) */}
          <div
            className="absolute inset-[3px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 14px),' +
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 14px)',
            }}
          />
        </div>

        {/* Penalty spot */}
        <div
          className="absolute rounded-full bg-white/80"
          style={{ left: '50%', top: '85%', width: 6, height: 6, transform: 'translate(-50%, -50%)' }}
        />

        {/* The ball at the spot (shooter only — keeper sees a glove icon instead) */}
        <div
          className="absolute"
          style={{ left: `${BALL_START.x}%`, top: `${BALL_START.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          {isShooter ? (
            <div className="text-3xl drop-shadow-lg" style={{ animation: 'penBallBounce 1.2s ease-in-out infinite' }}>⚽</div>
          ) : (
            <div className="text-2xl drop-shadow-lg">🧤</div>
          )}
        </div>

        {/* Zone overlay buttons */}
        {ZONES.map(z => {
          const picked = pick === z.key
          // Both roles see the same tap zones — visual differs by role.
          return (
            <button
              key={z.key}
              type="button"
              onClick={() => _commit(z.key)}
              disabled={pick !== null}
              className={`absolute rounded-xl border-2 transition-all
                ${picked
                  ? (isShooter ? 'border-emerald-300 bg-emerald-400/40' : 'border-blue-300 bg-blue-400/40')
                  : 'border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/60 active:scale-90'}
                ${pick !== null && !picked ? 'opacity-40' : ''}
                flex flex-col items-center justify-center
              `}
              style={{
                left: `${z.x - 11}%`,
                top: `${z.y - 13}%`,
                width: '22%',
                height: '26%',
              }}
            >
              <span className="text-xl font-black text-white drop-shadow leading-none">{z.label}</span>
              {isShooter && (
                <span className="text-[8px] text-white/70 font-bold uppercase tracking-wider mt-0.5">
                  +{z.points}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Status footer */}
      <div className="mt-3 text-center">
        {pick === null ? (
          <p className="text-gray-400 text-xs">
            {isShooter ? 'Top corners worth more · middle is easier' : 'Pick a corner to dive — match for the save'}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-emerald-300 text-xs font-bold">
              {isShooter ? `🎯 Aiming ${pick}` : `🤲 Diving ${pick}`}
            </p>
            <p className="text-gray-500 text-[10px]">Waiting for opponent…</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes penBallBounce {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50%      { transform: translate(-50%, -54%) scale(1.06); }
        }
      `}</style>
    </div>
  )
}
