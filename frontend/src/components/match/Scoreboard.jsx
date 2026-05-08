import { useState } from 'react'
import { useMatchClock } from '../../hooks/useMatchClock'

const TEAM_LOGOS = {
  'Bayern Munich': 'https://img.sofascore.com/api/v1/team/2672/image',
  'Hamburger SV':  'https://img.sofascore.com/api/v1/team/2676/image',
}

const STATUS = {
  live:     { label: 'LIVE',      dot: true,  clockColor: 'text-green-400' },
  halftime: { label: 'HT',        dot: false, clockColor: 'text-yellow-400' },
  fulltime: { label: 'FT',        dot: false, clockColor: 'text-gray-500' },
}

function TeamLogo({ name, size = 36 }) {
  const [failed, setFailed] = useState(false)
  const url = TEAM_LOGOS[name]
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()

  if (!url || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: '#1f2937', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9ca3af', fontSize: 8, fontWeight: 900, fontFamily: 'system-ui',
      }}>
        {initials}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, borderRadius: 4 }}
      onError={() => setFailed(true)}
    />
  )
}

export default function Scoreboard({ match, events }) {
  const clock = useMatchClock(match, events)
  if (!match) return null

  // Effective status: derive 2H 'live' from events list because the WS
  // reorder race can leave match.status pinned to 'halftime' even after
  // secondhalf has fired. Once secondhalf is in events (and fulltime isn't),
  // we're back in a live phase regardless of what the snapshot says.
  const evs = events ?? []
  const hasSh = evs.some(e => e.eventType === 'secondhalf')
  const hasFt = evs.some(e => e.eventType === 'fulltime')
  const effectiveStatus = hasFt
    ? 'fulltime'
    : (hasSh && match.status !== 'fulltime')
      ? 'live'
      : match.status

  const s = STATUS[effectiveStatus]
  const isLive = effectiveStatus === 'live'

  // Derive displayed score from revealed goal events. The match record's
  // homeScore/awayScore is updated by the backend event-processor on its own
  // wall-clock (subject to EventBridge dispatch jitter), so a goal can sit
  // visible in the feed for ~2 wall-min before the header catches up. Each
  // goal event carries `currentResult` like "2:0" — taking the max across
  // visible goals + the match record keeps the header in lockstep with the
  // feed without ever going backwards.
  let homeScore = match.homeScore ?? 0
  let awayScore = match.awayScore ?? 0
  for (const e of evs) {
    if (e.eventType !== 'goal' || !e.currentResult) continue
    const [h, a] = String(e.currentResult).split(':').map(n => parseInt(n, 10))
    if (Number.isFinite(h) && h > homeScore) homeScore = h
    if (Number.isFinite(a) && a > awayScore) awayScore = a
  }

  return (
    <div
      className="relative overflow-hidden px-4 py-3"
      style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #060a12 100%)' }}
    >
      {isLive && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 80%, rgba(34,197,94,0.07) 0%, transparent 70%)' }}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TeamLogo name={match.homeTeamName} size={36} />
          <p className="text-white font-bold text-xs leading-tight truncate">{match.homeTeamName}</p>
        </div>

        {/* Score + status */}
        <div className="flex flex-col items-center flex-shrink-0 px-2">
          {match.status === 'upcoming' ? (
            <p className="text-gray-600 text-sm font-medium tracking-widest">VS</p>
          ) : (
            <p className={`font-black tabular-nums leading-none tracking-tight ${isLive ? 'text-white text-5xl' : 'text-gray-300 text-4xl'}`}>
              {homeScore}
              <span className="text-gray-700 mx-1 font-light">:</span>
              {awayScore}
            </p>
          )}
          {s && (
            <div className="flex items-center gap-1 mt-1">
              {s.dot && <span className="w-1 h-1 rounded-full bg-green-400 live-dot" />}
              <span className={`text-[9px] font-bold tracking-widest ${s.dot ? 'text-green-400' : 'text-gray-500'}`}>
                {s.label}
              </span>
              {(match.startedAt || match.currentMinute) && s.clockColor && (
                <span className={`text-[9px] tabular-nums ${s.clockColor}`}>{clock}</span>
              )}
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <p className="text-white font-bold text-xs leading-tight truncate text-right">{match.awayTeamName}</p>
          <TeamLogo name={match.awayTeamName} size={36} />
        </div>
      </div>
    </div>
  )
}
