import { useEffect, useState } from 'react'

const FLASH_CONFIG = {
  nutmeg: { emoji: '🤌', label: 'NUTMEG!', color: 'bg-purple-600 border-purple-400/40' },
  spectacular_play: { emoji: '✨', label: 'SKILL MOVE!', color: 'bg-pink-600 border-pink-400/40' },
}

export default function SkillFlashBadge({ event }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger entrance on next frame so transition fires
    const enterTimer = requestAnimationFrame(() => setVisible(true))
    const exitTimer  = setTimeout(() => setVisible(false), 2200)
    return () => {
      cancelAnimationFrame(enterTimer)
      clearTimeout(exitTimer)
    }
  }, [event])

  if (!event) return null

  const cfg = FLASH_CONFIG[event.eventType]
  if (!cfg) return null

  const label = event.playType
    ? `${event.playType.toUpperCase()}!`
    : cfg.label

  return (
    <div
      className="fixed top-20 right-0 z-50 pointer-events-none"
      aria-live="polite"
    >
      <div
        className={`
          flex items-center gap-2 px-4 py-3 mr-2 rounded-2xl border
          ${cfg.color} shadow-lg
          transform transition-transform duration-300
          ${visible ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}
        `}
      >
        <span className="text-2xl leading-none">{cfg.emoji}</span>
        <div>
          <p className="text-white text-xs font-black tracking-widest uppercase leading-none">{label}</p>
          {event.playerDisplay && (
            <p className="text-white/70 text-[11px] font-medium mt-0.5 leading-none">{event.playerDisplay}</p>
          )}
        </div>
      </div>
    </div>
  )
}
