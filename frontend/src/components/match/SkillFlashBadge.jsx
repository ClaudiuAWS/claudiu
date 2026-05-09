import { useEffect, useState } from 'react'

const FLASH_CONFIG = {
  nutmeg:           { emoji: '🤌', label: 'NUTMEG!',    color: 'bg-purple-600 border-purple-400/40' },
  spectacular_play: { emoji: '✨', label: 'SKILL MOVE!', color: 'bg-pink-600 border-pink-400/40' },
}

// Tap window — tight on purpose so it feels like a reflex challenge.
// Beyond this, the badge stays visible for the exit animation but no longer
// awards points. Window starts the moment the badge mounts (= the moment
// the event reveals on the displayed match clock).
const REACT_WINDOW_MS = 1500
const TOTAL_VISIBLE_MS = 2200

export default function SkillFlashBadge({ event, onReact }) {
  const [visible, setVisible] = useState(false)
  // 'open' (within window) → 'tapped' (claimed) | 'missed' (window expired)
  const [status, setStatus] = useState('open')

  useEffect(() => {
    if (!event) return
    setStatus('open')
    setVisible(false)

    const enterTimer = requestAnimationFrame(() => setVisible(true))
    const windowTimer = setTimeout(() => {
      setStatus(prev => prev === 'open' ? 'missed' : prev)
    }, REACT_WINDOW_MS)
    const exitTimer = setTimeout(() => setVisible(false), TOTAL_VISIBLE_MS)

    return () => {
      cancelAnimationFrame(enterTimer)
      clearTimeout(windowTimer)
      clearTimeout(exitTimer)
    }
  }, [event])

  if (!event) return null

  const cfg = FLASH_CONFIG[event.eventType]
  if (!cfg) return null

  const label = event.playType
    ? `${event.playType.toUpperCase()}!`
    : cfg.label

  const tappable = status === 'open' && onReact
  const handleTap = () => {
    if (status !== 'open') return
    setStatus('tapped')
    onReact?.(event)
  }

  return (
    <div
      className={`fixed top-20 right-0 z-50 ${tappable ? '' : 'pointer-events-none'}`}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleTap}
        disabled={!tappable}
        className={`
          flex items-center gap-2 px-4 py-3 mr-2 rounded-2xl border
          ${cfg.color} shadow-lg
          transform transition-transform duration-300
          ${visible ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}
          ${tappable ? 'cursor-pointer active:scale-95 ring-2 ring-white/30' : 'cursor-default'}
          ${status === 'tapped' ? 'opacity-70' : ''}
        `}
      >
        <span className="text-2xl leading-none">{cfg.emoji}</span>
        <div className="text-left">
          <p className="text-white text-xs font-black tracking-widest uppercase leading-none">
            {status === 'tapped' ? '+2 GOT IT!' : status === 'missed' ? label : `TAP! +2`}
          </p>
          {event.playerDisplay && (
            <p className="text-white/70 text-[11px] font-medium mt-0.5 leading-none">{event.playerDisplay}</p>
          )}
        </div>
      </button>
    </div>
  )
}
