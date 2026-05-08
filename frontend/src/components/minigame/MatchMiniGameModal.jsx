import { useEffect, useState } from 'react'
import OffsideReflex from './OffsideReflex'

/**
 * Reusable modal shell for mini-games. Renders backdrop + countdown ring +
 * type-specific child component + result banner.
 *
 * Game-type-specific UIs are mounted via the switch below. Add a new clause
 * + import to support a new mini-game vertical.
 */
export default function MatchMiniGameModal({ state, onSubmit, onClose }) {
  const [now, setNow] = useState(Date.now())

  // 60-fps-ish countdown — only ticks while a game is active so we don't
  // spin re-renders forever after the modal closes.
  useEffect(() => {
    if (state?.status !== 'active') return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [state?.status])

  if (!state) return null
  // Pending: backend pushed the start but the related event hasn't appeared
  // in the feed yet. Stay invisible to avoid showing the modal before the play.
  if (state.status === 'pending') return null

  const remainingMs = Math.max(0, (state.startedAtMs ?? Date.now()) + (state.durationMs ?? 8000) - now)
  const remainingSec = Math.ceil(remainingMs / 1000)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.78)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-[92%] max-w-md rounded-2xl border border-white/10 p-5 shadow-2xl"
        style={{ background: 'linear-gradient(180deg, #0f1729 0%, #050810 100%)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-emerald-400">MINI-GAME</p>
            <h2 className="text-white font-extrabold text-lg leading-tight mt-0.5 truncate">{state.title}</h2>
            {state.prompt && (
              <p className="text-gray-400 text-xs mt-1 leading-snug">{state.prompt}</p>
            )}
          </div>
          {state.status === 'active' && (
            <div className="flex-shrink-0 flex flex-col items-center">
              <div className="text-3xl font-black text-white tabular-nums leading-none">{remainingSec}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">SEC</div>
            </div>
          )}
        </div>

        {state.status === 'active' && state.gameType === 'OFFSIDE_REFLEX' && (
          <OffsideReflex
            config={state.config}
            startedAtMs={state.startedAtMs}
            durationMs={state.durationMs}
            onSubmit={onSubmit}
          />
        )}

        {state.status === 'active' && state.gameType !== 'OFFSIDE_REFLEX' && (
          <div className="text-gray-500 text-sm py-8 text-center">Coming soon…</div>
        )}

        {state.status === 'resolved' && (
          <ResultBanner state={state} onClose={onClose} />
        )}

        {state.status === 'expired' && (
          <div className="py-6 text-center">
            <p className="text-gray-400 text-sm">Time's up — no submissions counted.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultBanner({ state, onClose }) {
  const deltas = state.deltas || []
  return (
    <div className="py-2">
      <p className="text-emerald-400 text-xs font-bold tracking-widest mb-2">RESULT</p>
      {deltas.length === 0 ? (
        <p className="text-gray-400 text-sm">No points awarded this round.</p>
      ) : (
        <div className="space-y-1.5">
          {deltas.map((d, i) => (
            <div key={d.userId || i} className="flex items-baseline justify-between text-sm">
              <span className="text-gray-300 truncate flex-1 mr-3">{d.displayName || d.userId}</span>
              <span className={`font-black tabular-nums ${d.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {d.delta > 0 ? '+' : ''}{d.delta}
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full mt-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition"
      >
        Close
      </button>
    </div>
  )
}
