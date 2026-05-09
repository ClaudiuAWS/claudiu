import { useEffect, useState } from 'react'

/**
 * AI Match Director commentary — italic line above the feed that surfaces
 * Claude's reaction to the latest match event. Fades out after ~7s so stale
 * commentary doesn't linger.
 *
 * Source of truth: `room.commentary` from useRoom (set on each
 * `commentary_update` WS message broadcast by the director-handler Lambda).
 */
const VISIBLE_MS = 7000

export default function DirectorCommentary({ commentary }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!commentary?.text) {
      setVisible(false)
      return
    }
    setVisible(true)
    const t = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(t)
  }, [commentary?.ts])

  if (!visible || !commentary?.text) return null

  return (
    <div
      className="match-event-in mb-3 mx-1 px-3 py-2.5 rounded-2xl flex items-start gap-2.5"
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
        {commentary.text}
      </p>
    </div>
  )
}
