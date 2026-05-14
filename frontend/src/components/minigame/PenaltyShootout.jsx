import { useRef, useState } from 'react'

/**
 * PENALTY_SHOOTOUT game UI.
 *
 * One side plays the SHOOTER, the other the KEEPER. Role assigned by
 * ownership (whoever owns the penaltyTakerId is the shooter, opponent is
 * keeper; if neither, deterministic fallback by userId lex order).
 *
 * Mechanic — parallel commit within a 10s window:
 *   - Shooter: tap one of 9 target zones on the 3×3 goal grid.
 *   - Keeper: tap one of the same 9 zones to dive.
 *   - When BOTH have committed (or timer expires), the animation runs:
 *       ball flies to the shooter's zone, keeper silhouette dives to
 *       their zone. Match = SAVE, mismatch = GOAL.
 *
 * The 3×3 grid (TL/TM/TR, ML/MM/MR, BL/BM/BR) follows the football
 * analytics standard used by Opta, StatsBomb, and modern football
 * video games for goal-mouth shot-zone segmentation.
 *
 * Scoring (computed in minigameBot.js::_penaltyShootoutDeltas):
 *   Top corners (TL/TR)          → shooter +8 (riskiest)
 *   Top middle (TM, Panenka)     → shooter +7
 *   Bottom corners (BL/BR)       → shooter +6
 *   Mid-row sides (ML/MR)        → shooter +5
 *   Bottom middle (BM)           → shooter +4
 *   Dead centre (MM)             → shooter +3 (keeper's default)
 *   Save (keeper correct)         → keeper +5
 *   Both timed out                → 0 to both
 *
 * Visual language: tasteful mobile-game polish — gradient-tinted tiles
 * by reward, glossy crossbar + posts, diamond-stitch net mesh, a swaying
 * keeper silhouette for the shooter (decorative), ball that "kicks" to
 * the picked zone on commit.
 */

// 3×3 goalmouth grid (Opta / StatsBomb analytics convention).
//
// Coordinates are percentages of the goal-panel container.
// Goal frame occupies x ∈ [8, 92], y ∈ [8, 68].
// Tiles are 24% wide × 16% tall (half-width 12, half-height 8). Centres
// chosen so the 3 columns sit flush with the posts and 3 rows fit
// between crossbar and goal-line with even 6% gaps.
//   x centres: {20, 50, 80} → spans 8–32, 38–62, 68–92.
//   y centres: {16, 38, 60} → spans 8–24, 30–46, 52–68.
const ZONES = [
  { key: 'TL', label: '◤', x: 20, y: 16, points: 8 },
  { key: 'TM', label: '▲', x: 50, y: 16, points: 7 },
  { key: 'TR', label: '◥', x: 80, y: 16, points: 8 },
  { key: 'ML', label: '◀', x: 20, y: 38, points: 5 },
  { key: 'MM', label: '●', x: 50, y: 38, points: 3 },
  { key: 'MR', label: '▶', x: 80, y: 38, points: 5 },
  { key: 'BL', label: '◣', x: 20, y: 60, points: 6 },
  { key: 'BM', label: '▼', x: 50, y: 60, points: 4 },
  { key: 'BR', label: '◢', x: 80, y: 60, points: 6 },
]

// Per-zone gradient + border tint. Coherent three-tier warm→cool palette
// keyed off reward:
//   high (+7/+8 corners + Panenka)  → amber
//   medium (+5/+6 sides + bottom corners) → emerald
//   low (+3/+4 centre + bottom-mid) → slate
// Fewer hues feel more designed. Tailwind JIT needs literal class names.
const TILE_GRADIENT = {
  TL: 'from-amber-400/35 to-amber-600/10 border-amber-300/40',
  TM: 'from-amber-400/30 to-amber-600/10 border-amber-300/40',
  TR: 'from-amber-400/35 to-amber-600/10 border-amber-300/40',
  ML: 'from-emerald-400/30 to-emerald-600/10 border-emerald-300/40',
  MM: 'from-slate-400/25 to-slate-600/10 border-slate-300/40',
  MR: 'from-emerald-400/30 to-emerald-600/10 border-emerald-300/40',
  BL: 'from-emerald-400/28 to-emerald-600/10 border-emerald-300/40',
  BM: 'from-slate-400/22 to-slate-600/10 border-slate-300/40',
  BR: 'from-emerald-400/28 to-emerald-600/10 border-emerald-300/40',
}

// Glow colour applied to the radiating box-shadow on pick — matches the
// tile tier so the burst feels native to the zone.
const TILE_GLOW = {
  TL: 'rgba(251,191,36,0.55)', TM: 'rgba(251,191,36,0.55)', TR: 'rgba(251,191,36,0.55)',
  ML: 'rgba(16,185,129,0.50)', MM: 'rgba(148,163,184,0.45)', MR: 'rgba(16,185,129,0.50)',
  BL: 'rgba(16,185,129,0.45)', BM: 'rgba(148,163,184,0.40)', BR: 'rgba(16,185,129,0.45)',
}

const BALL_START = { x: 50, y: 90 } // bottom of the goal panel, on the spot

export default function PenaltyShootout({ config, startedAtMs, durationMs, onSubmit, role, takerDisplay, keeperDisplay }) {
  const [pick, setPick] = useState(null) // zone key
  const submitMs = useRef(null)

  const pickedZone = pick ? ZONES.find(z => z.key === pick) : null
  const isShooter = role === 'shooter'

  function _commit(zoneKey) {
    if (pick !== null) return
    submitMs.current = Date.now() - (startedAtMs ?? Date.now())
    setPick(zoneKey)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15) } catch {}
    }
    onSubmit({ zone: zoneKey, role, submittedAtMs: submitMs.current })
  }

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
          <p className={`text-[9px] font-black tracking-widest uppercase ${isShooter ? 'text-emerald-400' : 'text-sky-400'}`}>
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
          background:
            // Faint vertical mowing stripes layered on the existing radial
            // grass gradient — adds stadium feel without heavy texture.
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 6%, transparent 6% 12%),' +
            'radial-gradient(ellipse at 50% 30%, #16753c 0%, #0f5722 45%, #093913 100%)',
          aspectRatio: '5 / 3',
          boxShadow: 'inset 0 -20px 40px rgba(0,0,0,0.38), 0 18px 40px -18px rgba(0,0,0,0.55)',
          animation: 'penModalIn 320ms cubic-bezier(.22,1.4,.36,1)',
        }}
      >
        {/* Pitch lines: faint penalty arc + 6-yard box hint */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '20%', right: '20%', top: '70%', bottom: '6%',
            borderTop: '2px solid rgba(255,255,255,0.18)',
            borderLeft: '2px solid rgba(255,255,255,0.18)',
            borderRight: '2px solid rgba(255,255,255,0.18)',
            borderTopLeftRadius: '40%',
            borderTopRightRadius: '40%',
          }}
        />

        {/* Goal frame: top crossbar + posts */}
        <div className="absolute" style={{ left: '8%', top: '8%', width: '84%', height: '60%' }}>
          {/* posts — thin gradient gloss + soft drop-shadow */}
          <div
            className="absolute top-0 left-0 bottom-0"
            style={{
              width: '4px',
              background: 'linear-gradient(90deg, #f4f4f5 0%, #ffffff 50%, #d4d4d8 100%)',
              boxShadow: '0 0 8px rgba(255,255,255,0.45)',
              borderRadius: '2px',
            }}
          />
          <div
            className="absolute top-0 right-0 bottom-0"
            style={{
              width: '4px',
              background: 'linear-gradient(90deg, #d4d4d8 0%, #ffffff 50%, #f4f4f5 100%)',
              boxShadow: '0 0 8px rgba(255,255,255,0.45)',
              borderRadius: '2px',
            }}
          />
          {/* crossbar */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '4px',
              background: 'linear-gradient(180deg, #ffffff 0%, #f4f4f5 50%, #d4d4d8 100%)',
              boxShadow: '0 2px 8px rgba(255,255,255,0.35)',
              borderRadius: '2px',
            }}
          />
          {/* net — denser crossing diamond stitch */}
          <div
            className="absolute inset-[4px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.20) 0, rgba(255,255,255,0.20) 1px, transparent 1px, transparent 10px),' +
                'repeating-linear-gradient(-45deg, rgba(255,255,255,0.20) 0, rgba(255,255,255,0.20) 1px, transparent 1px, transparent 10px)',
            }}
          />
        </div>

        {/* Keeper silhouette — shooter mode only (decorative opponent).
            Lives behind the zone tiles via DOM order. Sways gently. */}
        {isShooter && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: '50%',
              top: '46%',
              width: '11%',
              transform: 'translate(-50%, -50%)',
              animation: pick ? 'none' : 'penKeeperSway 2.4s ease-in-out infinite',
              opacity: 0.85,
              transition: 'left 0.35s ease-out',
              ...(pick && pickedZone ? { left: `${pickedZone.x}%`, top: `${pickedZone.y}%` } : null),
            }}
          >
            <svg viewBox="0 0 30 50" className="w-full h-auto" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
              {/* head */}
              <circle cx="15" cy="7" r="5.2" fill="#1f2937" />
              {/* body */}
              <rect x="7" y="12" width="16" height="20" rx="4" fill="#1f2937" />
              {/* shirt yellow stripe (keeper jersey) */}
              <rect x="7" y="18" width="16" height="3" fill="#fbbf24" opacity="0.7" />
              {/* arms / gloves */}
              <rect x="1.5" y="14" width="6.5" height="16" rx="3" fill="#1f2937" />
              <rect x="22" y="14" width="6.5" height="16" rx="3" fill="#1f2937" />
              <circle cx="4.7" cy="29.5" r="3.5" fill="#fbbf24" />
              <circle cx="25.3" cy="29.5" r="3.5" fill="#fbbf24" />
              {/* legs */}
              <rect x="9.5" y="31" width="5" height="16" rx="2" fill="#0f172a" />
              <rect x="15.5" y="31" width="5" height="16" rx="2" fill="#0f172a" />
            </svg>
          </div>
        )}

        {/* Penalty spot + ring */}
        <div
          className="absolute"
          style={{
            left: '50%', top: '85%',
            width: 16, height: 16,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.35)',
          }}
        />
        <div
          className="absolute rounded-full bg-white/85"
          style={{ left: '50%', top: '85%', width: 6, height: 6, transform: 'translate(-50%, -50%)' }}
        />

        {/* Grass shadow under the ball */}
        {!pick && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${BALL_START.x}%`,
              top: `${BALL_START.y + 3}%`,
              width: '8%',
              height: '2%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, transparent 70%)',
              animation: 'penBallShadow 1.2s ease-in-out infinite',
            }}
          />
        )}

        {/* The ball (shooter) or keeper-glove icon (keeper) */}
        <div
          className="absolute"
          style={{
            left: pick && pickedZone ? `${pickedZone.x}%` : `${BALL_START.x}%`,
            top:  pick && pickedZone ? `${pickedZone.y}%` : `${BALL_START.y}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.35s cubic-bezier(.4,1.4,.6,1), top 0.35s cubic-bezier(.4,1.4,.6,1)',
          }}
        >
          {isShooter ? (
            <div
              className="text-3xl drop-shadow-lg"
              style={{
                animation: pick ? 'penBallSpin 0.35s linear' : 'penBallBounce 1.2s ease-in-out infinite',
                filter: pick ? 'drop-shadow(0 0 12px rgba(251,191,36,0.6))' : undefined,
              }}
            >⚽</div>
          ) : (
            <div className="text-2xl drop-shadow-lg">🧤</div>
          )}
        </div>

        {/* Zone overlay buttons */}
        {ZONES.map((z, idx) => {
          const picked = pick === z.key
          const pickedClass = picked
            ? (isShooter
                ? 'border-emerald-200 ring-2 ring-emerald-300/70 bg-gradient-to-br from-emerald-300/55 to-emerald-500/20'
                : 'border-sky-200 ring-2 ring-sky-300/70 bg-gradient-to-br from-sky-300/55 to-sky-500/20')
            : `bg-gradient-to-br ${TILE_GRADIENT[z.key]}`
          const dim = pick !== null && !picked ? 'opacity-30' : ''
          // Stagger reveal: row*3 + col gives a left-to-right, top-to-bottom
          // ripple (0ms, 60ms, 120ms … 480ms).
          const staggerDelay = idx * 50
          const glow = picked ? TILE_GLOW[z.key] : null
          return (
            <button
              key={z.key}
              type="button"
              onClick={() => _commit(z.key)}
              disabled={pick !== null}
              className={`absolute rounded-xl border-2 transition-all
                ${pickedClass}
                ${pick === null ? 'hover:brightness-125 hover:scale-[1.04] active:scale-95' : ''}
                ${dim}
                flex flex-col items-center justify-center
                backdrop-blur-[1px]
              `}
              style={{
                // 3×3 grid: each tile 24% wide × 16% tall, half-width 12,
                // half-height 8. Centres in ZONES are positioned so tiles
                // sit flush with goal posts/bar with 6% gaps between rows
                // and columns. See ZONES comment for the math.
                left: `${z.x - 12}%`,
                top: `${z.y - 8}%`,
                width: '24%',
                height: '16%',
                animation: picked
                  ? `penTilePop 0.32s ease-out, penTileGlow 0.9s ease-out`
                  : `penTileReveal 360ms cubic-bezier(.22,1.4,.36,1) ${staggerDelay}ms both`,
                boxShadow: glow ? `0 0 0 0 ${glow}` : undefined,
                ['--pen-glow']: glow || undefined,
              }}
            >
              <span
                className="font-black text-white leading-none"
                style={{
                  fontSize: '1.35rem',
                  textShadow: '0 1px 3px rgba(0,0,0,0.55), 0 0 8px rgba(0,0,0,0.25)',
                }}
              >{z.label}</span>
              {isShooter && (
                <span className="text-[10px] text-white/90 font-extrabold uppercase tracking-wider mt-0.5 drop-shadow">
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
            {isShooter
              ? 'Top corners +8 · sides +5 · centre +3'
              : 'Pick a zone to dive — match the shooter for +5'}
          </p>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full border ${
                isShooter
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                  : 'bg-sky-500/20 text-sky-200 border-sky-400/50'
              }`}
              style={{ animation: 'penLockedPulse 1.4s ease-in-out infinite' }}
            >
              <span>{isShooter ? '🎯' : '🤲'}</span>
              <span>{isShooter ? `Aiming ${pick}` : `Diving ${pick}`}</span>
              <span className="opacity-70">· Locked</span>
            </span>
          </div>
        )}
        {pick !== null && (
          <p className="text-gray-500 text-[10px] mt-1.5">Waiting for opponent…</p>
        )}
      </div>

      <style>{`
        @keyframes penModalIn {
          0%   { opacity: 0; transform: translateY(10px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes penBallBounce {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50%      { transform: translate(-50%, -54%) scale(1.06); }
        }
        @keyframes penBallShadow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; }
          50%      { transform: translate(-50%, -50%) scale(0.78); opacity: 0.85; }
        }
        @keyframes penBallSpin {
          0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
          100% { transform: translate(-50%, -50%) rotate(220deg) scale(0.85); }
        }
        @keyframes penKeeperSway {
          0%, 100% { transform: translate(-50%, -50%) translateX(-7px) rotate(-3deg); }
          50%      { transform: translate(-50%, -50%) translateX( 7px) rotate( 3deg); }
        }
        @keyframes penTileReveal {
          0%   { opacity: 0; transform: scale(0.86); }
          100% { opacity: 1; transform: scale(1);    }
        }
        @keyframes penTilePop {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.10); }
          100% { transform: scale(1.02); }
        }
        @keyframes penTileGlow {
          0%   { box-shadow: 0 0 0 0   var(--pen-glow, rgba(16,185,129,0.55)); }
          70%  { box-shadow: 0 0 0 24px var(--pen-glow, rgba(16,185,129,0)),
                              0 0 36px var(--pen-glow, rgba(16,185,129,0)); }
          100% { box-shadow: 0 0 0 0   transparent; }
        }
        @keyframes penLockedPulse {
          0%, 100% { opacity: 1;   transform: scale(1);     }
          50%      { opacity: 0.82; transform: scale(0.97); }
        }
      `}</style>
    </div>
  )
}
