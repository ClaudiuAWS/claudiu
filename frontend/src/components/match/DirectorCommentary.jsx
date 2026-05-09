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
 * Source of truth: `room.commentaryStack` from useRoom (an array of
 * {id, text, reasoning, relatedEventId, ts} entries, newest first).
 */
export default function DirectorCommentary({ stack }) {
  if (!stack || !stack.length) return null

  return (
    <div
      className="fixed inset-x-0 top-20 z-[45] flex flex-col items-center gap-2 px-3 pointer-events-none"
      aria-live="polite"
    >
      {stack.map(entry => (
        <CommentaryCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function CommentaryCard({ entry }) {
  const [showReasoning, setShowReasoning] = useState(false)

  return (
    <div
      className="match-event-in pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.92) 0%, rgba(76, 29, 149, 0.88) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.50)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="px-3 py-2.5 flex items-start gap-2.5">
        <span
          className="flex-shrink-0 text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(168, 85, 247, 0.40)', color: '#e9d5ff' }}
        >
          🎙️ AI Director
        </span>
        <p className="text-white text-sm italic leading-snug flex-1">
          {entry.text}
        </p>
        {entry.reasoning && (
          <button
            onClick={() => setShowReasoning(v => !v)}
            className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-purple-200/70 hover:text-purple-100 transition px-1.5 py-0.5 rounded"
            aria-label="Show AI reasoning"
          >
            {showReasoning ? 'Hide' : 'Why?'}
          </button>
        )}
      </div>

      {showReasoning && entry.reasoning && (
        <div
          className="px-3 pb-2.5 pt-0 -mt-1"
        >
          <div
            className="rounded-lg px-2.5 py-1.5 border-l-2"
            style={{
              background: 'rgba(168, 85, 247, 0.10)',
              borderColor: 'rgba(168, 85, 247, 0.45)',
            }}
          >
            <p className="text-[10px] font-bold tracking-widest uppercase text-purple-300/70 mb-0.5">
              AI reasoning
            </p>
            <p className="text-[12px] text-purple-100/90 leading-snug">
              {entry.reasoning}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
