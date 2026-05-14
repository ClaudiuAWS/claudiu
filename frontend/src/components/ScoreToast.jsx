import toast from 'react-hot-toast'
import { scoreIcon, styleForReason, formatDelta } from '../utils/scoreFormatting'

/**
 * Mobile-game-grade toast card for in-match score events. Composed via
 * `toast.custom(t => <ScoreToast t={t} ... />)`. Auto-dismisses (the
 * dismiss is driven by `t.visible` so hover-pause behaviour from
 * react-hot-toast still works).
 *
 * Visual: 3 columns —
 *   [emoji-in-soft-ring] [delta + reason text] [tap-to-dismiss ×]
 * with a class-tinted gradient background per event family (goal=emerald,
 * save=sky, yellow=amber, etc; mapping lives in `scoreFormatting.js`).
 */
export default function ScoreToast({ t, reason, delta, playerName, subtitle }) {
  const icon  = scoreIcon(reason, delta)
  const style = styleForReason(reason, delta)
  const delta_s = formatDelta(delta)
  const deltaColor = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-300'

  return (
    <div
      className={`pointer-events-auto relative flex items-center gap-3 min-w-[260px] max-w-[360px]
                  rounded-2xl border px-3 py-2.5
                  ${style.border}
                  bg-gradient-to-r ${style.gradient}
                  backdrop-blur-md`}
      style={{
        background: undefined, // gradient handled by classes
        boxShadow: '0 18px 40px -16px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        animation: t.visible
          ? 'scoreToastIn 260ms cubic-bezier(.22,1.4,.36,1)'
          : 'scoreToastOut 200ms ease-in forwards',
      }}
    >
      {/* base darker background plate so the gradient overlay has contrast */}
      <span
        className="absolute inset-0 rounded-2xl -z-10"
        style={{ background: 'linear-gradient(180deg, #0e1426 0%, #060a14 100%)' }}
      />

      {/* Icon in soft ring */}
      <div className={`relative flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ring-2 ${style.ring}`}>
        <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-lg font-black tabular-nums leading-none ${deltaColor}`}>
            {delta_s}
          </span>
          <span className="text-white/90 text-[12px] font-semibold leading-tight truncate">
            {reason || (delta > 0 ? 'Awarded' : 'Penalty')}
          </span>
        </div>
        {(playerName || subtitle) && (
          <p className="text-[10.5px] text-gray-400 mt-0.5 truncate">
            {[playerName, subtitle].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        className="flex-shrink-0 w-6 h-6 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center text-sm"
        aria-label="Dismiss"
      >×</button>

      {/* Inline keyframes — match the existing PenaltyShootout convention
          of inline <style> tags so we don't introduce a new animation dep. */}
      <style>{`
        @keyframes scoreToastIn {
          0%   { opacity: 0; transform: translateY(-12px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes scoreToastOut {
          0%   { opacity: 1; transform: translateY(0)     scale(1);    }
          100% { opacity: 0; transform: translateY(-8px)  scale(0.96); }
        }
      `}</style>
    </div>
  )
}

/**
 * Convenience emitter: call from anywhere with a `change`-shaped object.
 *
 *   emitScoreToast({ delta, reason, playerName })
 */
export function emitScoreToast({ delta, reason, playerName, subtitle, duration = 3200 }) {
  toast.custom(
    (t) => (
      <ScoreToast
        t={t}
        delta={delta}
        reason={reason}
        playerName={playerName}
        subtitle={subtitle}
      />
    ),
    { duration }
  )
}
