import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom'
import { useMatch } from '../hooks/useMatch'
import { useAuth } from '../hooks/useAuth'
import { useDraft } from '../hooks/useDraft'
import { roomsApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import RoomCodeDisplay from '../components/lobby/RoomCodeDisplay'
import MembersList from '../components/lobby/MembersList'
import CreateRoom from '../components/lobby/CreateRoom'
import JoinRoom from '../components/lobby/JoinRoom'
import TeamSelectionModal from '../components/lobby/TeamSelectionModal'
import InviteFriendsModal from '../components/lobby/InviteFriendsModal'
import DraftRevealShow from '../components/lobby/DraftRevealShow'

export default function LobbyPage() {
  const { matchId } = useParams()
  const { user } = useAuth()
  const { match } = useMatch(matchId)
  const [mode, setMode] = useState('create')
  const [error, setError] = useState('')
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState(5)
  const [revealOpen, setRevealOpen] = useState(false)
  const navigate = useNavigate()

  const handleMatchStarted = (mid) => {
    if (!mid) return
    const flagKey = `lobby_auto_redirected_${mid}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    navigate(`/match/${mid}`)
  }
  const { room, loading, createRoom, joinRoom, leaveRoom } = useRoom(
    null,
    user?.userId,
    null,
    null,
    handleMatchStarted,
  )

  const myMember = room?.members?.find(m => m.userId === user?.userId)
  const hasTeam  = myMember?.teamSelection?.length === 11
  const teamReadyIds = new Set(
    (room?.members ?? []).filter(m => m.teamSelection?.length === 11).map(m => m.userId)
  )

  const isHost   = room?.hostUserId === user?.userId
  const isLive   = match?.status === 'live'
  const canStart = isHost && (room?.members?.length ?? 0) >= 1 && !starting && !isLive

  const draft = useDraft(room, user?.userId)
  const memberCount = room?.members?.length ?? 0
  const useCoordinatedDraft = memberCount >= 2
  const draftReadying = (draft.status === 'waiting' || draft.status === 'idle') && draft.isReady
  const draftActive   = draft.status === 'active' || draft.status === 'complete'

  useEffect(() => {
    if (draftActive && !teamModalOpen && !hasTeam) setTeamModalOpen(true)
  }, [draftActive, teamModalOpen, hasTeam])

  // Fire the pre-match Draft Reveal Show once all members have locked
  // their 11. Uses sessionStorage to guarantee it only plays once per
  // room session — re-opening the lobby on a refresh doesn't re-trigger.
  useEffect(() => {
    if (!room?.roomCode) return
    const members = room.members ?? []
    if (members.length === 0) return
    const allLocked = members.every(m => (m.teamSelection?.length ?? 0) === 11)
    if (!allLocked) return
    const flagKey = `lobby_reveal_shown_${room.roomCode}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    setRevealOpen(true)
  }, [room?.roomCode, room?.members])

  useEffect(() => {
    if (!isLive || !room?.roomCode) return
    const flagKey = `lobby_auto_redirected_${matchId}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    navigate(`/match/${matchId}`, { state: { initialRoom: room } })
  }, [isLive, matchId, room, navigate])

  const handleReadyUp = async () => {
    setError('')
    try { await draft.ready() } catch (e) { setError(e.message || 'Failed to ready up') }
  }

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
      sessionStorage.setItem(`lobby_auto_redirected_${matchId}`, '1')
      navigate(`/match/${matchId}`, { state: { initialRoom: room } })
    } catch (e) {
      setError(e.message)
      setStarting(false)
    }
  }

  // Closes the Draft Reveal Show and — on the host's tab — auto-fires the
  // match start so the lobby doesn't sit there waiting for a manual button
  // tap once both squads are locked. Non-host tabs receive the match_started
  // WS broadcast and redirect themselves. SessionStorage flag prevents
  // re-firing across remounts (StrictMode, hot reload).
  const handleRevealClose = () => {
    setRevealOpen(false)
    if (!isHost || !room?.roomCode || isLive || starting) return
    const flagKey = `lobby_auto_started_${room.roomCode}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    handleStart()
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
        <div className="flex flex-col flex-1 gap-5">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Your Party</h1>
            <p className="text-gray-500 text-sm mt-1">
              {isLive
                ? 'Match is live!'
                : isHost
                  ? memberCount >= 2
                    ? 'Ready to start — press the button when everyone is set'
                    : 'Invite friends or share the code below'
                  : 'Waiting for the host to start the match…'}
            </p>
          </div>

          <RoomCodeDisplay code={room.roomCode} />
          <MembersList members={room.members} hostUserId={room.hostUserId} teamReadyIds={teamReadyIds} />

          {/* Invite friends button */}
          {!isLive && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}
            >
              + Invite Friends
            </button>
          )}

          {/* Team selection CTA */}
          {useCoordinatedDraft && !draftActive && !hasTeam ? (
            <button
              onClick={handleReadyUp}
              disabled={draftReadying}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                ${draftReadying
                  ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                  : 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'}`}
            >
              {draftReadying
                ? `⏳ Waiting for opponent (${draft.readyUserIds.length}/${memberCount} ready)`
                : '⚡ Ready Up — Start Draft'}
            </button>
          ) : (
            <button
              onClick={() => setTeamModalOpen(true)}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                ${hasTeam
                  ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'
                  : 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'}`}
            >
              {hasTeam ? '✓ Squad selected — Edit' : 'Pick Your Squad'}
            </button>
          )}

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
              Leave party
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 gap-6">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">
              {mode === 'create' ? 'Create a Party' : 'Join a Party'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {mode === 'create' ? 'Start a party and invite your friends' : 'Enter the code your friend shared'}
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

      {teamModalOpen && room && (
        <TeamSelectionModal
          matchId={matchId}
          roomCode={room.roomCode}
          room={room}
          currentUserId={user?.userId}
          existingSelection={myMember?.teamSelection ?? []}
          onDone={() => setTeamModalOpen(false)}
        />
      )}

      {inviteModalOpen && room && (
        <InviteFriendsModal
          roomCode={room.roomCode}
          onClose={() => setInviteModalOpen(false)}
        />
      )}

      <DraftRevealShow
        open={revealOpen}
        room={room}
        onClose={handleRevealClose}
      />
    </div>
  )
}
