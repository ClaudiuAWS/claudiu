import { useState } from 'react'

/**
 * AI Match Director commentary stack — fixed-position pop-up overlay.
 * Newest at top (anchored), older entries flow down. Each entry self-
 * purges after 7s via useRoom's setTimeout.
 *
 * Each card has a "Why?" expand that reveals the AI's `reasoning` field —
 * a one-sentence explanation of why it chose to commentate on this event.
 * Useful for demos / debugging: judges can see the agent's decision trace.
 *
 * Visual language matches the new ScoreToast cards (`ScoreToast.jsx`) —
 * left emoji-in-ring + bold body + side pill — but tinted violet so the
 * Director feels distinct from in-feed score events.
 *
 * Source of truth: `room.commentaryStack` from useRoom (an array of
 * {id, text, reasoning, relatedEventId, ts} entries, newest first).
 */
export default function DirectorCommentary({ stack }) {
  if (!stack || !stack.length) return null

  return (
    // aria-live="polite" so screen readers announce each new commentary
    // line as it arrives (e.g. "Olise doubles Bayern's lead — clinical!").
    // 'polite' politeness level waits for the user's current speech to
    // finish before reading — no rude interruptions mid-action.
    <div
      className="fixed inset-x-0 top-20 z-[45] flex flex-col items-center gap-2 px-3 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
      role="status"
    >
      {stack.map(entry => (
        <CommentaryCard key={entry.id} entry={entry} />
      ))}

      <style>{`
        @keyframes directorCommentaryIn {
          0%   { opacity: 0; transform: translateY(-14px) scale(0.94); }
          100% { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes directorRingPulse {
          0%   { box-shadow: 0 0 0 0   rgba(168, 85, 247, 0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(168, 85, 247, 0);   }
          100% { box-shadow: 0 0 0 0   rgba(168, 85, 247, 0);    }
        }
        @keyframes directorReasoningIn {
          0%   { opacity: 0; transform: translateY(-4px); max-height: 0; }
          100% { opacity: 1; transform: translateY(0);    max-height: 160px; }
        }
      `}</style>
    </div>
  )
}

function CommentaryCard({ entry }) {
  const [showReasoning, setShowReasoning] = useState(false)
  // Personal commentary — the WS broadcast was tagged for this user
  // specifically (their drafted player did something). Swap the violet
  // ambient palette for a gold-tinged "this is about YOU" treatment.
  const personal = !!entry.personal

  const ring     = personal ? 'ring-amber-300/50 bg-amber-500/20' : 'ring-violet-400/40 bg-violet-500/20'
  const border   = personal ? 'border-amber-300/40' : 'border-violet-400/30'
  const overlay  = personal ? 'from-amber-500/20 via-amber-500/10' : 'from-violet-500/20 via-violet-500/10'
  const labelText = personal ? 'For You · Brezn Agent' : 'Brezn Agent'
  const labelClr  = personal ? 'text-amber-300/90' : 'text-violet-300/85'
  const pillBg    = personal
    ? 'border-amber-300/50 bg-amber-500/15 text-amber-100/90 hover:bg-amber-500/25 hover:text-amber-50'
    : 'border-violet-400/40 bg-violet-500/15 text-violet-200/90 hover:bg-violet-500/25 hover:text-violet-100'

  return (
    <div
      className={`pointer-events-auto relative w-full max-w-md rounded-2xl border overflow-hidden ${border}`}
      style={{
        background: personal
          ? 'linear-gradient(180deg, #1f160a 0%, #140a02 100%)'
          : 'linear-gradient(180deg, #110a1f 0%, #060214 100%)',
        boxShadow:
          '0 20px 40px -16px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        animation: 'directorCommentaryIn 260ms cubic-bezier(.22,1.4,.36,1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span
        className={`absolute inset-0 pointer-events-none rounded-2xl bg-gradient-to-r to-transparent ${overlay}`}
        aria-hidden="true"
      />

      <div className="relative px-3 py-2.5 flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ring-2 ${ring} overflow-hidden`}
          style={{ animation: 'directorRingPulse 1.8s ease-out 1' }}
        >
          <img
            src="/brezn-agent.png?v=4"
            alt=""
            aria-hidden="true"
            className="w-7 h-7 object-contain"
            style={{ filter: personal ? 'drop-shadow(0 0 4px rgba(252,211,77,0.6))' : 'none' }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-[9px] font-black tracking-widest uppercase ${labelClr}`}>
              {labelText}
            </p>
            {entry.reasoning && (
              <button
                onClick={() => setShowReasoning(v => !v)}
                className={`text-[9.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${pillBg}`}
                aria-label="Show AI reasoning"
              >
                {showReasoning ? 'Hide' : 'Why?'}
              </button>
            )}
          </div>
          <p className="text-white/90 text-[13px] font-semibold leading-snug">
            {entry.text}
          </p>
        </div>
      </div>

      {showReasoning && entry.reasoning && (
        <div
          className="relative px-3 pb-2.5"
          style={{ animation: 'directorReasoningIn 220ms ease-out' }}
        >
          <div
            className="rounded-lg px-2.5 py-1.5 border-l-2 border-violet-400/55"
            style={{
              background:
                'linear-gradient(90deg, rgba(168, 85, 247, 0.18) 0%, rgba(168, 85, 247, 0.05) 100%)',
            }}
          >
            <p className="text-[9px] font-black tracking-widest uppercase text-violet-300/70 mb-0.5">
              Brezn thoughts
            </p>
            <p className="text-[11.5px] text-violet-100/90 leading-snug">
              {entry.reasoning}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
