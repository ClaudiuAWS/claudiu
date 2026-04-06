import { useParams } from 'react-router-dom'
import { useMatch } from '../hooks/useMatch'
import { useRoom } from '../hooks/useRoom'
import Scoreboard from '../components/match/Scoreboard'
import MatchFeed from '../components/match/MatchFeed'
import MembersList from '../components/lobby/MembersList'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function MatchPage() {
  const { matchId } = useParams()
  const { match, events, loading } = useMatch(matchId)
  const { room } = useRoom()

  if (loading) return <LoadingSpinner />

  return (
    <div className="px-4 pt-6 space-y-4 pb-24">
      <Scoreboard match={match} events={events} />

      {room && (
        <div className="bg-gray-900 rounded-2xl p-4">
          <p className="text-gray-400 text-sm mb-3">
            Your Squad — {room.members?.length} watching
          </p>
          <div className="flex gap-2 flex-wrap">
            {room.members?.map(member => (
              <div
                key={member.userId}
                className="bg-gray-800 rounded-full px-3 py-1 text-white text-xs"
              >
                {member.displayName}
              </div>
            ))}
          </div>
        </div>
      )}

      <MatchFeed events={events} />
    </div>
  )
}