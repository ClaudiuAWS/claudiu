import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
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
import FreeHitModal from '../components/lobby/FreeHitModal'

export default function LobbyPage() {
  const { matchId } = useParams()
  const { user } = useAuth()
  const { match } = useMatch(matchId)
  const location = useLocation()
  const [mode, setMode] = useState('create')
  const [error, setError] = useState('')
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState(5)
  const [revealOpen, setRevealOpen] = useState(false)
  const [freeHitOpen, setFreeHitOpen] = useState(false)
  const navigate = useNavigate()

  const handleMatchStarted = (mid) => {
    if (!mid) return
    const flagKey = `lobby_auto_redirected_${mid}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    // Pass state.initialRoom so the non-host's MatchPage skips its
    // loading-spinner gate (same pattern as handleStart and the isLive
    // auto-redirect useEffect). Without this, the friend's tab flashed
    // a blank spinner between WS arrival and useRoom's API restore.
    navigate(`/match/${mid}`, { state: { initialRoom: room } })
  }
  // Pass nav-state initialRoom (e.g. from InviteListener accepting an
  // invite) to useRoom so the loading-spinner gate doesn't fire while
  // the API restore round-trips. Mirrors MatchPage.jsx:60.
  const { room, loading, createRoom, joinRoom, leaveRoom } = useRoom(
    null,
    user?.userId,
    location.state?.initialRoom || null,
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
  // canStart is no longer surfaced in UI (manual Start button removed),
  // but the same conditions still gate the auto-start fired from
  // handleRevealClose, so we leave the predicate inline there.

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

      {/* Match fixture — same dark-gradient vocabulary as everywhere else
          in the app, with a faint red top-line accent to tie it to the
          page header below. */}
      {match && (
        <div
          className="relative rounded-2xl p-4 mb-6 flex items-center justify-between overflow-hidden"
          style={{
            background: 'linear-gradient(145deg,#111827,#0d1117)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 20px -12px rgba(0,0,0,0.65)',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/35 to-transparent pointer-events-none" />
          <span className="text-white font-semibold text-sm flex-1">{match.homeTeamName}</span>
          <div className="px-4 text-center">
            {match.status === 'upcoming'
              ? <span className="text-gray-600 text-[10px] font-bold tracking-widest uppercase">Upcoming</span>
              : <span className="text-white font-stadium text-2xl leading-none tabular-nums" style={{ letterSpacing: '0.05em' }}>
                  {match.homeScore ?? 0} : {match.awayScore ?? 0}
                </span>
            }
          </div>
          <span className="text-white font-semibold text-sm flex-1 text-right">{match.awayTeamName}</span>
        </div>
      )}

      {room ? (
        <div className="flex flex-col flex-1 gap-5">
          {/* Glossy branded header — same shape as BadgesPage / TracksPage
              so the lobby reads as a "real" page in the app, not a
              loose collection of buttons. */}
          <div className="relative overflow-hidden rounded-2xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
            <div
              className="relative px-5 py-4"
              style={{
                background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
                border: '1px solid rgba(220,38,38,0.25)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -12px rgba(220,38,38,0.50)',
              }}
            >
              <h1
                className="text-white font-stadium text-2xl leading-none"
                style={{
                  letterSpacing: '0.10em',
                  textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
                }}
              >
                YOUR PARTY
              </h1>
              <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
                {isLive
                  ? 'Match is live!'
                  : isHost
                    ? memberCount >= 2
                      ? 'Ready up to start the draft'
                      : 'Invite friends or share the code below'
                    : 'Waiting for everyone to lock in…'}
              </p>
            </div>
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

          {/* Free Hit perk — visible once squad is locked, gated on the
              armed perk + not yet used. One-tap opens the swap modal. */}
          {hasTeam && myMember?.armedPerks?.includes?.('free-hit') && !myMember?.usedFreeHit && !isLive && (
            <button
              onClick={() => setFreeHitOpen(true)}
              className="w-full mt-2 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.10) 100%)',
                border: '1px solid rgba(245,158,11,0.40)',
                color: '#fcd34d',
              }}
            >
              ⚡ Use Free Hit · swap one player
            </button>
          )}

          {/* Start / Watch live. Both the manual Start button and the
              Watch Live blue button are removed — the sequence is now
              fully continuous:
                Ready Up -> coordinated draft -> Draft Reveal Show ->
                handleRevealClose (host fires startMatch) -> match_started
                WS broadcast OR isLive flip -> auto-redirect both tabs to
                /match. No taps in between.
              While isLive is true but the redirect hasn't yet flushed,
              show a status pill so the user sees the handoff happening. */}
          {isLive ? (
            <div
              className="w-full py-3 rounded-2xl text-center text-sm font-semibold tracking-wide"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.20) 0%, rgba(127,29,29,0.10) 100%)',
                border: '1px solid rgba(248,113,113,0.45)',
                color: '#fca5a5',
              }}
            >
              Kicking off — taking you to the match…
            </div>
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
              <div
                className="w-full py-3 rounded-2xl text-center text-sm font-semibold tracking-wide"
                style={{
                  background: starting
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(21,128,61,0.10) 100%)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${starting ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  color: starting ? '#86efac' : '#9ca3af',
                }}
              >
                {starting
                  ? 'Kicking off…'
                  : 'Match auto-starts once both squads lock in'}
              </div>
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
              className="w-full py-3 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.10) 0%, rgba(127,29,29,0.05) 100%)',
                border: '1px solid rgba(248,113,113,0.28)',
                color: '#fca5a5',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
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

      <FreeHitModal
        open={freeHitOpen}
        onClose={() => setFreeHitOpen(false)}
        room={room}
        matchId={matchId}
        currentUserId={user?.userId}
      />

      <DraftRevealShow
        open={revealOpen}
        room={room}
        onClose={handleRevealClose}
      />
    </div>
  )
}
