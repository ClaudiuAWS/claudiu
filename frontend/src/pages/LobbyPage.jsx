import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRoom } from '../hooks/useRoom'
import { useMatch } from '../hooks/useMatch'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'
import ErrorBanner from '../components/ui/ErrorBanner'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function LobbyPage() {
  const { matchId } = useParams()
  const { user } = useAuth()
  const { room, loading, error, clearError, createRoom, joinRoom, leaveRoom } = useRoom()
  const { match } = useMatch(matchId)
  const [mode, setMode] = useState('create')
  const navigate = useNavigate()

  // Navigate to match page when match goes live
  useEffect(() => {
    if (match?.status === 'live' && room) {
      navigate(`/match/${matchId}`)
    }
  }, [match?.status, room, matchId, navigate])

  if (loading) return <LoadingSpinner />

  if (room) {
    return (
      <div className="px-6 pt-12 space-y-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Your Squad</h1>
          <p className="text-gray-400 text-sm mt-1">
            {match?.status === 'upcoming'
              ? 'Waiting for the match to start'
              : 'Match is starting...'}
          </p>
        </div>

        {match && (
          <div className="bg-gray-900 rounded-2xl p-4 flex justify-between items-center">
            <span className="text-white font-semibold">{match.homeTeamName}</span>
            <span className="text-gray-400 text-sm">vs</span>
            <span className="text-white font-semibold">{match.awayTeamName}</span>
          </div>
        )}

        <RoomCodeDisplay code={room.roomCode} />
        <MembersList members={room.members} hostUserId={room.hostUserId} />

        <button
          onClick={leaveRoom}
          className="w-full text-gray-500 text-sm py-3"
        >
          Leave room
        </button>
      </div>
    )
  }

  return (
    <div className="px-6 pt-12 space-y-6">
      <div>
        {match && (
          <div className="bg-gray-900 rounded-2xl p-4 flex justify-between items-center mb-6">
            <span className="text-white font-semibold">{match.homeTeamName}</span>
            <span className="text-gray-400 text-sm">vs</span>
            <span className="text-white font-semibold">{match.awayTeamName}</span>
          </div>
        )}
        <h1 className="text-white text-2xl font-bold">Join the Squad</h1>
        <p className="text-gray-400 text-sm mt-1">
          Create a room or join with a code
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={clearError} />

      {mode === 'create' ? (
        <CreateRoom
          onJoin={() => createRoom(matchId)}
          onSwitch={() => setMode('join')}
          loading={loading}
        />
      ) : (
        <JoinRoom
          onJoin={joinRoom}
          onSwitch={() => setMode('create')}
          loading={loading}
        />
      )}
    </div>
  )
}