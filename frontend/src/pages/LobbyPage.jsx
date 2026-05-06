import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom'
import { useMatch } from '../hooks/useMatch'
import { useAuth } from '../hooks/useAuth'
import { roomsApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'
import TeamSelectionModal from '../components/lobby/TeamSelectionModal'

export default function LobbyPage() {
  const { matchId } = useParams()
  const { user } = useAuth()
  const { room, loading, createRoom, joinRoom, leaveRoom } = useRoom(null, user?.userId)
  const { match } = useMatch(matchId)
  const [mode, setMode] = useState('create')
  const [error, setError] = useState('')
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState(5)
  const navigate = useNavigate()

  const myMember = room?.members?.find(m => m.userId === user?.userId)
  const hasTeam  = myMember?.teamSelection?.length === 11
  const teamReadyIds = new Set(
    (room?.members ?? []).filter(m => m.teamSelection?.length === 11).map(m => m.userId)
  )

  const isHost   = room?.hostUserId === user?.userId
  const isLive   = match?.status === 'live'
  const canStart = isHost && (room?.members?.length ?? 0) >= 1 && !starting && !isLive // DEV: solo allowed

  const handleCreate = async () => {
    setError('')
    try { await createRoom(matchId) } catch (e) { setError(e.message) }
  }

  const handleJoin = async (code) => {
    setError('')
    try { await joinRoom(code) } catch (e) { setError(e.message) }
  }

  const handleStart = async () => {
    setError('')
    setStarting(true)
    try {
      await roomsApi.startMatch(room.roomCode, speedMultiplier)
      navigate(`/match/${matchId}`, { state: { initialRoom: room } })
    } catch (e) {
      setError(e.message)
      setStarting(false)
    }
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
              {isLive
                ? 'Match is live!'
                : isHost
                  ? (room?.members?.length ?? 0) >= 2
                    ? 'Ready to start — press the button when everyone is set'
                    : 'Waiting for more players to join…'
                  : 'Waiting for the host to start the match…'}
            </p>
          </div>

          <RoomCodeDisplay code={room.roomCode} />
          <MembersList members={room.members} hostUserId={room.hostUserId} teamReadyIds={teamReadyIds} />

          {/* Team selection CTA */}
          <button
            onClick={() => setTeamModalOpen(true)}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
              ${hasTeam
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-green-500 hover:bg-green-400 active:bg-green-600 text-white'}`}
          >
            {hasTeam ? '✓ Squad selected — Edit' : 'Pick Your Squad'}
          </button>

          {/* Start / Watch live */}
          {isLive ? (
            <button
              onClick={() => navigate(`/match/${matchId}`, { state: { initialRoom: room } })}
              className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white transition-all"
            >
              Watch Live →
            </button>
          ) : isHost ? (
            <>
              {/* Replay speed (dev/testing). 1× = real time; higher = compressed playback. */}
              <div className="flex items-center justify-between px-1">
                <label htmlFor="speed-select" className="text-gray-500 text-xs uppercase tracking-widest font-semibold">
                  Replay speed
                </label>
                <select
                  id="speed-select"
                  value={speedMultiplier}
                  onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                  disabled={starting}
                  className="bg-white/5 border border-white/10 text-white text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-white/30"
                >
                  <option value={1}>1× — real time (90 min)</option>
                  <option value={2}>2× (~45 min)</option>
                  <option value={5}>5× (~18 min) — recommended</option>
                  <option value={10}>10× (~9 min)</option>
                  <option value={30}>30× (~3 min) — stress test</option>
                </select>
              </div>
              <button
                onClick={handleStart}
                disabled={!canStart}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                  ${canStart
                    ? 'bg-white text-black hover:bg-gray-100 active:bg-gray-200'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
              >
                {starting ? 'Starting…' : 'Start Match'}
              </button>
            </>
          ) : null}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={() => setError('')} className="text-red-500 ml-3 text-lg leading-none">×</button>
            </div>
          )}

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

      {/* Team selection modal — rendered outside the flow so it covers full screen */}
      {teamModalOpen && room && (
        <TeamSelectionModal
          matchId={matchId}
          roomCode={room.roomCode}
          existingSelection={myMember?.teamSelection ?? []}
          onDone={() => setTeamModalOpen(false)}
        />
      )}
    </div>
  )
}
