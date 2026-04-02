import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useRoom } from '../hooks/useRoom'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'
import ErrorBanner from '../components/ui/ErrorBanner'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect } from 'react'

export default function LobbyPage() {
  const { user } = useAuth()
  const { room, loading, error, clearError, createRoom, joinRoom, leaveRoom } = useRoom()
  const [mode, setMode] = useState('create')

  useEffect(() => {
  fetchAuthSession().then(s => {
    console.log('tokens:', s.tokens)
    console.log('idToken:', s.tokens?.idToken)
    console.log('idToken string:', s.tokens?.idToken?.toString())
  })
}, [])
  if (room) {
    return (
      <div className="px-6 pt-12 space-y-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Your Squad</h1>
          <p className="text-gray-400 text-sm mt-1">
            Waiting for players to join
          </p>
        </div>

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
        <h1 className="text-white text-2xl font-bold">
          Hey, {user?.displayName} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Create or join a squad to play
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={clearError} />

      {mode === 'create' ? (
        <CreateRoom
          onJoin={createRoom}
          onSwitch={() => setMode('join')}
          loading={loading}
          error={error}
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