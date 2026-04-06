const STATUS_LABEL = {
  live:     { text: 'LIVE',      color: 'text-green-400 animate-pulse' },
  halftime: { text: 'HALF TIME', color: 'text-yellow-400' },
  fulltime: { text: 'FULL TIME', color: 'text-gray-400' },
}

export default function Scoreboard({ match }) {
  if (!match) return null

  const status = STATUS_LABEL[match.status]

  return (
    <div className="bg-gray-900 rounded-2xl p-6">
      <div className="flex items-center justify-center gap-2 mb-4">
        {status && (
          <>
            <div className={`text-xs font-bold ${status.color}`}>
              {status.text}
            </div>
            {match.currentMinute && (
              <div className="text-gray-500 text-xs">
                {match.currentMinute}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <p className="text-white font-bold text-sm">{match.homeTeamName}</p>
          <p className="text-gray-400 text-xs mt-1">{match.homeFormation}</p>
        </div>

        <div className="px-6 text-center">
          <p className="text-white font-bold text-5xl tracking-wider">
            {match.homeScore ?? 0}
            <span className="text-gray-600 mx-2">:</span>
            {match.awayScore ?? 0}
          </p>
        </div>

        <div className="flex-1 text-center">
          <p className="text-white font-bold text-sm">{match.awayTeamName}</p>
          <p className="text-gray-400 text-xs mt-1">{match.awayFormation}</p>
        </div>
      </div>
    </div>
  )
}