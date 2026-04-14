import { useMatchClock } from '../../hooks/useMatchClock'

const STATUS = {
  live:     { label: 'LIVE',      dot: true,  clockColor: 'text-green-400' },
  halftime: { label: 'HALF TIME', dot: false, clockColor: 'text-yellow-400' },
  fulltime: { label: 'FULL TIME', dot: false, clockColor: 'text-gray-500' },
}

export default function Scoreboard({ match, events }) {
  const clock = useMatchClock(match, events)
  if (!match) return null

  const s = STATUS[match.status]
  const isLive = match.status === 'live'

  return (
    <div
      className="relative overflow-hidden px-6 pt-8 pb-7"
      style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #060a12 100%)' }}
    >
      {/* Ambient glow behind score */}
      {isLive && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 80%, rgba(34,197,94,0.07) 0%, transparent 70%)' }}
        />
      )}

      {/* Status + clock */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {s && (
          <>
            {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" />}
            <span className={`text-[11px] font-bold tracking-widest ${s.dot ? 'text-green-400' : 'text-gray-500'}`}>
              {s.label}
            </span>
            {match.currentMinute && s.clockColor && (
              <span className={`text-[11px] tabular-nums ${s.clockColor}`}>{clock}</span>
            )}
          </>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-2">
        {/* Home */}
        <div className="flex-1 text-center">
          <p className="text-white font-bold text-sm leading-tight">{match.homeTeamName}</p>
          {match.homeFormation && (
            <p className="text-gray-600 text-[10px] mt-1 tracking-wider">{match.homeFormation}</p>
          )}
        </div>

        {/* Score */}
        <div className="px-4 text-center">
          {match.status === 'upcoming' ? (
            <p className="text-gray-600 text-sm font-medium tracking-widest">VS</p>
          ) : (
            <p className={`font-black tabular-nums leading-none tracking-tight ${isLive ? 'text-white text-6xl' : 'text-gray-300 text-5xl'}`}>
              {match.homeScore ?? 0}
              <span className="text-gray-700 mx-3 font-light">:</span>
              {match.awayScore ?? 0}
            </p>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 text-center">
          <p className="text-white font-bold text-sm leading-tight">{match.awayTeamName}</p>
          {match.awayFormation && (
            <p className="text-gray-600 text-[10px] mt-1 tracking-wider">{match.awayFormation}</p>
          )}
        </div>
      </div>
    </div>
  )
}
