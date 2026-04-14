const EVENT_CONFIG = {
  goal: {
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
        <path d="M12 3C12 3 9 7 9 12s3 9 3 9M12 3c0 0 3 4 3 9s-3 9-3 9M3 12h18M5 7.5C7 9 9.5 9.5 12 9.5s5-0.5 7-2M5 16.5C7 15 9.5 14.5 12 14.5s5 0.5 7 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    bg: 'bg-green-500',
    label: 'Goal',
    accent: 'text-green-400',
    card: 'border-green-500/20 bg-green-500/5',
  },
  card: {
    icon: () => (
      <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
        <rect x="1" y="1" width="12" height="16" rx="2" fill="#eab308"/>
      </svg>
    ),
    bg: 'bg-yellow-500',
    label: 'Card',
    accent: 'text-yellow-400',
    card: 'border-yellow-500/15 bg-yellow-500/5',
  },
  substitution: {
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M7 16V4M7 4L4 7M7 4l3 3" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 8v12M17 20l-3-3M17 20l3-3" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    bg: 'bg-blue-500',
    label: 'Sub',
    accent: 'text-blue-400',
    card: 'border-blue-500/15 bg-blue-500/5',
  },
  halftime: {
    icon: () => <span className="text-base">🔔</span>,
    bg: 'bg-yellow-600',
    label: 'Half Time',
    accent: 'text-yellow-400',
    card: 'border-yellow-600/15 bg-yellow-600/5',
  },
  secondhalf: {
    icon: () => <span className="text-base">▶️</span>,
    bg: 'bg-green-600',
    label: '2nd Half',
    accent: 'text-green-400',
    card: 'border-green-600/15 bg-green-600/5',
  },
  fulltime: {
    icon: () => <span className="text-base">🏁</span>,
    bg: 'bg-gray-600',
    label: 'Full Time',
    accent: 'text-gray-400',
    card: 'border-white/10 bg-white/[0.03]',
  },
}

function getDescription(event) {
  switch (event.eventType) {
    case 'goal':
      return {
        primary: `${event.scoringDisplay}${event.isPenalty ? ' (pen)' : ''}`,
        secondary: event.currentResult ? `Score: ${event.currentResult}` : null,
      }
    case 'card':
      return {
        primary: event.playerDisplay,
        secondary: event.cardColor ? `${event.cardColor.charAt(0).toUpperCase() + event.cardColor.slice(1)} card` : null,
      }
    case 'substitution':
      return {
        primary: `${event.playerInDisplay} on`,
        secondary: `${event.playerOutDisplay} off`,
      }
    case 'halftime':
      return { primary: 'Half Time', secondary: event.finalResult ?? null }
    case 'fulltime':
      return { primary: 'Full Time', secondary: event.finalResult ?? null }
    case 'secondhalf':
      return { primary: 'Second Half Kick-off', secondary: null }
    default:
      return { primary: event.eventType, secondary: null }
  }
}

export default function EventItem({ event }) {
  const cfg = EVENT_CONFIG[event.eventType] ?? {
    icon: () => <span className="text-sm">•</span>,
    bg: 'bg-gray-700',
    label: event.eventType,
    accent: 'text-gray-400',
    card: 'border-white/5 bg-white/[0.02]',
  }

  const { primary, secondary } = getDescription(event)
  const isGoal = event.eventType === 'goal'

  return (
    <div
      className={`match-event-in flex items-center gap-3 px-4 py-3 rounded-2xl border ${cfg.card} ${isGoal ? 'goal-flash' : ''}`}
    >
      {/* Icon bubble */}
      <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
        {cfg.icon()}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold tracking-widest uppercase ${cfg.accent}`}>{cfg.label}</span>
          {secondary && <span className="text-gray-600 text-[10px]">·</span>}
          {secondary && <span className="text-gray-500 text-[10px]">{secondary}</span>}
        </div>
        <p className="text-white text-sm font-medium mt-0.5 truncate">{primary}</p>
      </div>

      {/* Game time */}
      <div className="flex-shrink-0 text-right">
        <span className="text-gray-600 text-xs tabular-nums">{event.gameTime}</span>
      </div>
    </div>
  )
}
