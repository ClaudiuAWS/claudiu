import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useMatches } from '../hooks/useMatch'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const STATUS_LABEL = {
  upcoming: { text: 'Upcoming', color: 'text-gray-400', dot: 'bg-gray-500' },
  live:     { text: 'Live',     color: 'text-green-400', dot: 'bg-green-500 animate-pulse' },
  halftime: { text: 'Half Time', color: 'text-yellow-400', dot: 'bg-yellow-500' },
  fulltime: { text: 'Full Time', color: 'text-gray-500', dot: 'bg-gray-600' },
}

function MatchCard({ match, onSelect }) {
  const status = STATUS_LABEL[match.status] || STATUS_LABEL.upcoming
  const isFinished = match.status === 'fulltime'

  return (
    <button
      onClick={() => !isFinished && onSelect(match)}
      disabled={isFinished}
      className="w-full bg-gray-900 rounded-2xl p-5 text-left disabled:opacity-50"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={`text-xs font-medium ${status.color}`}>
            {status.text}
          </span>
        </div>
        <span className="text-gray-500 text-xs">Bundesliga</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-white font-semibold text-lg flex-1">
          {match.homeTeamName}
        </span>

        <div className="px-4 text-center">
          {match.status === 'upcoming' ? (
            <span className="text-gray-400 text-sm">vs</span>
          ) : (
            <span className="text-white font-bold text-2xl">
              {match.homeScore ?? 0} : {match.awayScore ?? 0}
            </span>
          )}
          {match.currentMinute && (
            <p className="text-green-400 text-xs mt-1">{match.currentMinute}</p>
          )}
        </div>

        <span className="text-white font-semibold text-lg flex-1 text-right">
          {match.awayTeamName}
        </span>
      </div>

      {match.status === 'upcoming' && (
        <p className="text-gray-500 text-xs mt-3 text-center">
          Tap to create or join a squad
        </p>
      )}

      {match.status === 'live' || match.status === 'halftime' ? (
        <p className="text-green-400 text-xs mt-3 text-center">
          Tap to join the action
        </p>
      ) : null}
    </button>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const { matches, loading, error } = useMatches()
  const navigate = useNavigate()

  const handleSelectMatch = (match) => {
    navigate(`/lobby/${match.matchId}`)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="px-6 pt-12 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">
          Hey, {user?.displayName} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Pick a match to watch with your squad
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {matches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No matches available right now</p>
          </div>
        ) : (
          matches.map(match => (
            <MatchCard
              key={match.matchId}
              match={match}
              onSelect={handleSelectMatch}
            />
          ))
        )}
      </div>
    </div>
  )
}