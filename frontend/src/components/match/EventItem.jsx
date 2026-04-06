const EVENT_CONFIG = {
  goal:         { emoji: '⚽', label: 'Goal',         color: 'text-green-400' },
  card:         { emoji: '🟨', label: 'Card',         color: 'text-yellow-400' },
  substitution: { emoji: '🔄', label: 'Substitution', color: 'text-blue-400' },
  halftime:     { emoji: '🔔', label: 'Half Time',    color: 'text-yellow-400' },
  secondhalf:   { emoji: '▶️', label: 'Second Half',  color: 'text-green-400' },
  fulltime:     { emoji: '🏁', label: 'Full Time',    color: 'text-gray-400' },
}

export default function EventItem({ event }) {
  const config = EVENT_CONFIG[event.eventType] || { emoji: '•', label: event.eventType, color: 'text-gray-400' }

  const getDescription = () => {
    if (event.eventType === 'goal') {
      const penalty = event.isPenalty ? ' (pen)' : ''
      return `${event.scoringDisplay}${penalty} — ${event.currentResult}`
    }
    if (event.eventType === 'card') {
      return `${event.playerDisplay} — ${event.cardColor} card`
    }
    if (event.eventType === 'substitution') {
      return `${event.playerInDisplay} ↑  ${event.playerOutDisplay} ↓`
    }
    if (event.eventType === 'halftime') {
      return `Half Time — ${event.finalResult}`
    }
    if (event.eventType === 'fulltime') {
      return `Full Time — ${event.finalResult}`
    }
    return ''
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0">
      <span className="text-lg">{config.emoji}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${config.color}`}>
            {event.gameTime}
          </span>
          <span className="text-gray-500 text-xs">{config.label}</span>
        </div>
        <p className="text-white text-sm mt-0.5">{getDescription()}</p>
      </div>
    </div>
  )
}