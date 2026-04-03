import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useRoom } from '../hooks/useRoom'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function LobbyPage() {
  const { user } = useAuth()
  const { room, loading, createRoom, joinRoom, leaveRoom } = useRoom()
  const [mode, setMode] = useState('create')

  if (loading) {
    return <LoadingSpinner />
  }

  if (room) {
    const isHost = room.hostUserId === user?.userId

    return (
      <div className="px-6 pt-12 space-y-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Your Squad</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isHost ? 'You are the host' : 'Waiting for players to join'}
          </p>
        </div>

        <RoomCodeDisplay code={room.roomCode} />
        <MembersList members={room.members} hostUserId={room.hostUserId} />

        <button
          onClick={leaveRoom}
          disabled={loading}
          className="w-full text-red-400 text-sm py-3 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'Leaving...' : isHost ? 'Destroy room' : 'Leave room'}
        </button>
      </div>
    )
  }

  return (
    <div className="px-6 pt-12 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">
          Hey, {user?.displayName} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Create or join a squad to play
        </p>
      </div>

      {mode === 'create' ? (
        <CreateRoom
          onJoin={createRoom}
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