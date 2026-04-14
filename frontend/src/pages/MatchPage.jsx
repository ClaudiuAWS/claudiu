import { useParams, Navigate } from 'react-router-dom'
import { useMatch } from '../hooks/useMatch'
import { useRoom } from '../hooks/useRoom'
import Scoreboard from '../components/match/Scoreboard'
import MatchFeed from '../components/match/MatchFeed'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500']

export default function MatchPage() {
  const { matchId } = useParams()
  const { match, events, loading } = useMatch(matchId)
  const { room, loading: roomLoading } = useRoom()

  if (loading || roomLoading) return <LoadingSpinner />
  if (!room) return <Navigate to={`/lobby/${matchId}`} replace />

  return (
    <div className="flex flex-col pb-28">
      <Scoreboard match={match} events={events} />

      {/* Squad strip */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.04]">
        <div className="flex -space-x-2">
          {room.members?.slice(0, 5).map((m, i) => (
            <div
              key={m.userId}
              className={`w-7 h-7 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-gray-950`}
            >
              {m.displayName?.[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        <p className="text-gray-500 text-xs">
          {room.members?.length === 1
            ? 'Just you watching'
            : `${room.members?.length} watching together`}
        </p>
      </div>

      <MatchFeed events={events} />
    </div>
  )
}
