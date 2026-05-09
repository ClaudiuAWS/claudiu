/**
 * AI Match Director commentary stack — fixed-position pop-up overlay.
 * Newest at top (anchored), older entries flow down. Each entry self-
 * purges after 7s via useRoom's setTimeout.
 *
 * Rendered as a `position: fixed` toast overlay so commentary is visible
 * across all tabs (feed, squad, chat) — the user never misses a beat
 * regardless of where they are in the match page. Container has
 * pointer-events:none so taps pass through to underlying content; the
 * cards themselves opt back into pointer events.
 *
 * Source of truth: `room.commentaryStack` from useRoom (an array of
 * {id, text, relatedEventId, ts} entries, newest first).
 */
export default function DirectorCommentary({ stack }) {
  if (!stack || !stack.length) return null

  return (
    <div
      className="fixed inset-x-0 top-2 z-40 flex flex-col items-center gap-2 px-3 pointer-events-none"
      aria-live="polite"
    >
      {stack.map(entry => (
        <div
          key={entry.id}
          className="match-event-in pointer-events-auto w-full max-w-md px-3 py-2.5 rounded-2xl flex items-start gap-2.5 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.92) 0%, rgba(76, 29, 149, 0.88) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.50)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            className="flex-shrink-0 text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(168, 85, 247, 0.40)', color: '#e9d5ff' }}
          >
            🎙️ AI Director
          </span>
          <p className="text-white text-sm italic leading-snug flex-1">
            {entry.text}
          </p>
        </div>
      ))}
    </div>
  )
}
