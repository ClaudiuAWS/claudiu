import { useEffect, useState } from 'react'
import OffsideReflex from './OffsideReflex'
import PenaltyShootout from './PenaltyShootout'
import HalftimeQuiz from './HalftimeQuiz'
import { scoreIcon, styleForReason, formatDelta, EVENT_STYLES } from '../../utils/scoreFormatting'

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

// Derive the headline "outcome verb" (GOAL! / SAVE! / OFFSIDE! …) from
// the game type plus whichever delta dominates. Used both for the big
// banner and for choosing the header gradient.
function _outcomeFor(gameType, deltas) {
  const total = deltas.reduce((acc, d) => acc + (Number(d.delta) || 0), 0)
  const reasons = deltas.map(d => (d.reason || '').toLowerCase())
  if (gameType === 'PENALTY_SHOOTOUT') {
    if (reasons.some(r => r.includes('save'))) return { verb: 'SAVE',     emoji: '🧤', tone: 'sky',    sub: 'Keeper guessed right' }
    if (reasons.some(r => r.includes('goal'))) return { verb: 'GOAL',     emoji: '⚽', tone: 'emerald', sub: 'Back of the net' }
    return                                              { verb: 'MISS',     emoji: '🚫', tone: 'slate',   sub: 'No one committed' }
  }
  if (gameType === 'OFFSIDE_REFLEX') {
    if (total > 0)                              return { verb: 'OFFSIDE!', emoji: '🚩', tone: 'orange',  sub: 'Sharp eye on the line' }
    return                                              { verb: 'TOO LATE', emoji: '🐢', tone: 'slate',   sub: 'Reaction was off' }
  }
  if (gameType === 'HALFTIME_QUIZ') {
    if (total > 0)                              return { verb: 'QUIZ',     emoji: '🧠', tone: 'indigo',  sub: 'Brain power on form' }
    return                                              { verb: 'QUIZ',     emoji: '🧠', tone: 'slate',   sub: 'Tough round' }
  }
  return                                                { verb: total > 0 ? 'WIN' : 'DONE', emoji: '✨', tone: 'emerald', sub: '' }
}

function ResultBanner({ state, onClose }) {
  const deltas = state.deltas || []
  const totalAwarded = deltas.reduce((acc, d) => acc + (Number(d.delta) || 0), 0)
  const outcome = _outcomeFor(state.gameType, deltas)
  const headerStyle = EVENT_STYLES[outcome.tone] || EVENT_STYLES.emerald
  const showConfetti = totalAwarded > 0

  return (
    <div className="relative pt-1 pb-1 overflow-hidden">
      {/* Confetti — only when someone scored. 5 emoji spans with staggered
          fall + spin keyframes. Pure CSS, no JS animation deps. */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {[
            { left: '12%', delay: 0.05, emoji: '✨' },
            { left: '28%', delay: 0.30, emoji: '🎉' },
            { left: '48%', delay: 0.00, emoji: '⚡' },
            { left: '68%', delay: 0.45, emoji: '🎊' },
            { left: '86%', delay: 0.20, emoji: '✨' },
          ].map((c, i) => (
            <span
              key={i}
              className="absolute -top-2 text-base"
              style={{
                left: c.left,
                animation: `confettiFall 1.6s cubic-bezier(.45,.05,.55,.95) ${c.delay}s forwards`,
              }}
            >{c.emoji}</span>
          ))}
        </div>
      )}

      {/* Outcome banner */}
      <div
        className={`relative rounded-2xl border ${headerStyle.border} px-4 py-3 mt-1
                    bg-gradient-to-r ${headerStyle.gradient}`}
        style={{
          boxShadow: '0 12px 30px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
          animation: 'resultBannerIn 320ms cubic-bezier(.22,1.4,.36,1)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ring-2 ${headerStyle.ring} flex-shrink-0`}>
            <span className="text-2xl leading-none">{outcome.emoji}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black tracking-widest uppercase text-white/60">Result</p>
            <h3 className={`text-xl font-black leading-tight ${headerStyle.text}`}>
              {outcome.verb}
            </h3>
            {outcome.sub && (
              <p className="text-[10.5px] text-white/55 mt-0.5">{outcome.sub}</p>
            )}
          </div>
        </div>
      </div>

      {/* Per-participant delta cards */}
      <div className="mt-3 space-y-1.5">
        {deltas.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-2">
            No points awarded this round.
          </p>
        ) : (
          deltas.map((d, i) => {
            const delta = Number(d.delta) || 0
            const style = styleForReason(d.reason, delta)
            const icon  = scoreIcon(d.reason, delta)
            const deltaColor = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-400'
            return (
              <div
                key={d.userId || i}
                className={`relative flex items-center gap-2.5 rounded-xl border ${style.border}
                            bg-gradient-to-r ${style.gradient} px-2.5 py-2`}
                style={{
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  animation: `resultRowIn 320ms cubic-bezier(.22,1.4,.36,1) ${0.08 * i}s both`,
                }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ring-2 ${style.ring} flex-shrink-0`}>
                  <span className="text-sm leading-none">{icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13px] font-bold truncate leading-tight">
                    {d.displayName || d.userId || 'Player'}
                  </p>
                  {d.reason && (
                    <p className="text-[10px] text-white/55 truncate leading-tight mt-0.5">
                      {d.reason}
                    </p>
                  )}
                </div>
                <span className={`font-black tabular-nums text-base ${deltaColor}`}>
                  {formatDelta(delta)}
                </span>
              </div>
            )
          })
        )}
      </div>

      <button
        onClick={onClose}
        className="relative w-full mt-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all
                   bg-gradient-to-r from-emerald-500 to-emerald-700
                   hover:from-emerald-400 hover:to-emerald-600
                   active:scale-[0.98]
                   shadow-[0_10px_24px_-12px_rgba(16,185,129,0.55)]"
      >
        Close
      </button>

      <style>{`
        @keyframes resultBannerIn {
          0%   { opacity: 0; transform: translateY(8px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes resultRowIn {
          0%   { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: translateX(0);    }
        }
        @keyframes confettiFall {
          0%   { transform: translateY(0)    rotate(0deg);   opacity: 0;   }
          15%  { opacity: 1; }
          100% { transform: translateY(140px) rotate(360deg); opacity: 0;  }
        }
      `}</style>
    </div>
  )
}
