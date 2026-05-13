import { useEffect, useState } from 'react'
import OffsideReflex from './OffsideReflex'
import PenaltyShootout from './PenaltyShootout'
import HalftimeQuiz from './HalftimeQuiz'

/**
 * Reusable modal shell for mini-games. Renders backdrop + countdown ring +
 * type-specific child component + result banner.
 *
 * Game-type-specific UIs are mounted via the switch below. Add a new clause
 * + import to support a new mini-game vertical.
 */
export default function MatchMiniGameModal({ state, onSubmit, onClose, playerMap = {}, currentUserId = null, members = [] }) {
  // Penalty role assignment: ownership wins; deterministic lex fallback when
  // nobody owns the penalty taker so both clients agree on who shoots.
  const penaltyRole = (() => {
    const adv = state?.ownershipContext?.advantagedUserId
    if (adv) return adv === currentUserId ? 'shooter' : 'keeper'
    const ids = (members || []).map(m => m.userId).filter(Boolean).sort()
    if (ids.length === 0) return 'shooter'
    return ids[0] === currentUserId ? 'shooter' : 'keeper'
  })()
  const [now, setNow] = useState(Date.now())
  const [showReasoning, setShowReasoning] = useState(false)

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
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold tracking-widest text-emerald-400">MINI-GAME</p>
              {state.source === 'ai-director' && (
                <>
                  <span
                    className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#d8b4fe' }}
                  >
                    🎙️ AI Director
                  </span>
                  {state.reasoning && (
                    <button
                      onClick={() => setShowReasoning(v => !v)}
                      className="text-[9px] font-semibold uppercase tracking-wider text-purple-300/70 hover:text-purple-200 transition px-1 py-0.5"
                    >
                      {showReasoning ? 'Hide' : 'Why?'}
                    </button>
                  )}
                </>
              )}
            </div>
            <h2 className="text-white font-extrabold text-lg leading-tight mt-0.5 truncate">{state.title}</h2>
            {state.prompt && (
              <p className="text-gray-400 text-xs mt-1 leading-snug">{state.prompt}</p>
            )}
            {showReasoning && state.reasoning && state.source === 'ai-director' && (
              <div
                className="mt-2 rounded-lg px-2.5 py-1.5 border-l-2"
                style={{
                  background: 'rgba(168, 85, 247, 0.10)',
                  borderColor: 'rgba(168, 85, 247, 0.45)',
                }}
              >
                <p className="text-[9px] font-bold tracking-widest uppercase text-purple-300/70 mb-0.5">
                  AI reasoning
                </p>
                <p className="text-[11px] text-purple-100/90 leading-snug">
                  {state.reasoning}
                </p>
              </div>
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
            offsidePlayer={playerMap[state.ownershipContext?.playerId] || null}
          />
        )}

        {state.status === 'active' && state.gameType === 'PENALTY_SHOOTOUT' && (
          <PenaltyShootout
            config={state.config}
            startedAtMs={state.startedAtMs}
            durationMs={state.durationMs}
            onSubmit={onSubmit}
            role={penaltyRole}
            takerDisplay={
              playerMap[state.ownershipContext?.playerId]?.displayName
              || state.ownershipContext?.advantagedDisplayName
              || state.config?.takerName
            }
            keeperDisplay={null}
          />
        )}

        {state.status === 'active' && state.gameType === 'HALFTIME_QUIZ' && (
          <HalftimeQuiz
            config={state.config}
            startedAtMs={state.startedAtMs}
            durationMs={state.durationMs}
            onSubmit={onSubmit}
          />
        )}

        {state.status === 'active'
          && !['OFFSIDE_REFLEX', 'PENALTY_SHOOTOUT', 'HALFTIME_QUIZ'].includes(state.gameType) && (
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
  const totalAwarded = deltas.reduce((acc, d) => acc + (Number(d.delta) || 0), 0)
  return (
    <div className="py-2">
      <p className="text-emerald-400 text-xs font-bold tracking-widest mb-2">RESULT</p>
      {deltas.length === 0 ? (
        <p className="text-gray-400 text-sm">No points awarded this round.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {deltas.map((d, i) => {
              const delta = Number(d.delta) || 0
              // Render every participant, even 0-point taps. Without this,
              // a user who tapped outside the bracket sees an empty result
              // and can't tell whether their opponent scored.
              const colorCls = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'
              const sign     = delta > 0 ? '+' : delta < 0 ? '−' : ''
              const value    = delta === 0 ? '0' : Math.abs(delta)
              return (
                <div key={d.userId || i} className="flex items-baseline justify-between text-sm">
                  <span className="text-gray-300 truncate flex-1 mr-3">{d.displayName || d.userId}</span>
                  <span className={`font-black tabular-nums ${colorCls}`}>{sign}{value}</span>
                </div>
              )
            })}
          </div>
          {totalAwarded === 0 && (
            <p className="text-gray-500 text-xs mt-2">Nobody hit the bracket this round.</p>
          )}
        </>
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
