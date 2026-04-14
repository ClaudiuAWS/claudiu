import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom'
import { useMatch } from '../hooks/useMatch'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'

export default function LobbyPage() {
  const { matchId } = useParams()
  const { room, loading, createRoom, joinRoom, leaveRoom } = useRoom()
  const { match } = useMatch(matchId)
  const [mode, setMode] = useState('create')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (match?.status === 'live' && room) {
      navigate(`/match/${matchId}`)
    }
  }, [match?.status, room, matchId, navigate])

  const handleCreate = async () => {
    setError('')
    try { await createRoom(matchId) } catch (e) { setError(e.message) }
  }

  const handleJoin = async (code) => {
    setError('')
    try { await joinRoom(code) } catch (e) { setError(e.message) }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="min-h-screen flex flex-col px-5 pt-10 pb-8">

      {/* Match fixture */}
      {match && (
        <div className="rounded-2xl p-4 mb-8 flex items-center justify-between"
          style={{ background: 'linear-gradient(145deg,#111827,#0d1117)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-white font-semibold text-sm flex-1">{match.homeTeamName}</span>
          <div className="px-4 text-center">
            {match.status === 'upcoming'
              ? <span className="text-gray-600 text-xs font-medium tracking-widest uppercase">Upcoming</span>
              : <span className="text-white font-bold text-xl tabular-nums">{match.homeScore ?? 0} : {match.awayScore ?? 0}</span>
            }
          </div>
          <span className="text-white font-semibold text-sm flex-1 text-right">{match.awayTeamName}</span>
        </div>
      )}

      {room ? (
        // ── In-room view ──────────────────────────────────────────
        <div className="flex flex-col flex-1 gap-5">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Your Squad</h1>
            <p className="text-gray-500 text-sm mt-1">
              {match?.status === 'upcoming' ? 'Waiting for kick-off…' : 'Match is starting…'}
            </p>
          </div>

          <RoomCodeDisplay code={room.roomCode} />
          <MembersList members={room.members} hostUserId={room.hostUserId} />

          <div className="mt-auto pt-4">
            <button
              onClick={leaveRoom}
              className="w-full py-3 text-gray-600 text-sm hover:text-gray-400 transition-colors"
            >
              Leave squad
            </button>
          </div>
        </div>
      ) : (
        // ── Pre-room view ─────────────────────────────────────────
        <div className="flex flex-col flex-1 gap-6">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">
              {mode === 'create' ? 'Create a Squad' : 'Join a Squad'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {mode === 'create' ? 'Start a room and invite your friends' : 'Enter the code your friend shared'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={() => setError('')} className="text-red-500 ml-3 text-lg leading-none">×</button>
            </div>
          )}

          {mode === 'create'
            ? <CreateRoom onCreate={handleCreate} onSwitch={() => setMode('join')} loading={loading} />
            : <JoinRoom onJoin={handleJoin} onSwitch={() => setMode('create')} loading={loading} />
          }
        </div>
      )}
    </div>
  )
}
