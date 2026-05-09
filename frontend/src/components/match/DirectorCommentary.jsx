/**
 * AI Match Director commentary stack — newest at top (fixed position),
 * older entries flow down. Each entry self-purges after 7s via useRoom's
 * setTimeout, so the stack is always shown as-is here.
 *
 * Source of truth: `room.commentaryStack` from useRoom (an array of
 * {id, text, relatedEventId, ts} entries, newest first).
 */
export default function DirectorCommentary({ stack }) {
  if (!stack || !stack.length) return null

  return (
    <div className="mb-3 mx-1 flex flex-col gap-2">
      {stack.map(entry => (
        <div
          key={entry.id}
          className="match-event-in px-3 py-2.5 rounded-2xl flex items-start gap-2.5"
          style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(124, 58, 237, 0.06) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.30)',
          }}
        >
          <span
            className="flex-shrink-0 text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#d8b4fe' }}
          >
            🎙️ AI Director
          </span>
          <p className="text-gray-200 text-sm italic leading-snug flex-1">
            {entry.text}
          </p>
        </div>
      ))}
    </div>
  )
}
