import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, Navigate, useLocation } from 'react-router-dom'
import { useMatch } from '../hooks/useMatch'
import { useRoom } from '../hooks/useRoom'
import { useChat } from '../hooks/useChat'
import { useAuth } from '../hooks/useAuth'
import { matchesApi, roomsApi } from '../services/api'
import { logger } from '../services/logger'
import toast from 'react-hot-toast'
import { emitScoreToast } from '../components/ScoreToast'
import Scoreboard from '../components/match/Scoreboard'
import MatchFeed from '../components/match/MatchFeed'
import ChatPanel from '../components/match/ChatPanel'
import ChatBubbles from '../components/match/ChatBubbles'
import { SquadVisualization } from '../components/match/SquadVisualization'
import SkillFlashBadge from '../components/match/SkillFlashBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import MatchMiniGameModal from '../components/minigame/MatchMiniGameModal'
import DirectorCommentary from '../components/match/DirectorCommentary'
import ReactionsOverlay, { pushCheer } from '../components/match/ReactionsOverlay'
import ReactionsButton from '../components/match/ReactionsButton'
import MatchEndCelebration from '../components/match/MatchEndCelebration'
import MemberAvatar from '../components/ui/MemberAvatar'
import { useMiniGame } from '../hooks/useMiniGame'
import { useDirector } from '../hooks/useDirector'
import { useHighlights, buildHighlightFromEvent } from '../hooks/useHighlights'
import HighlightOverlay from '../components/match/HighlightOverlay'
import { computeOptimisticDeltas } from '../utils/fplScoring'

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500']

export default function MatchPage() {
  const { matchId } = useParams()
  const location    = useLocation()
  const [tab, setTab] = useState('feed')

  // Full player lookup: playerId → player object (has stats, displayName, etc.)
  const [playerMap, setPlayerMap] = useState({})

  const { user }                                = useAuth()
  // useChat needs a matchEnded signal so it can demolish persisted chat
  // history. That signal originates in useRoom (declared below), which we
  // can't move above useChat without breaking the onChatMessage wiring.
  // Bridge: local boolean state that we flip via a useEffect once
  // matchJustEnded turns true. Re-renders cascade into useChat which
  // then clears its sessionStorage entry + messages.
  const [chatDemolished, setChatDemolished] = useState(false)
  const { messages, bubbles, onChatMessage, sendMessage } = useChat(matchId, chatDemolished)
  // useRoom's WS handler will forward minigame messages via the optional 4th
  // arg. We construct a ref-stable forwarder here and feed it both ways.
  const minigameMsgRef = useRef(null)
  const minigameMsgHandler = useCallback((msg) => minigameMsgRef.current?.(msg), [])
  // Cheer messages from party members flow into the floating ReactionsOverlay.
  // The local push (sender-side optimistic floater) is handled inside
  // ReactionsButton itself; here we only forward the WS-side message.
  const onCheerHandler = useCallback((msg) => {
    if (msg?.userId === user?.userId) return  // skip own echo to avoid duplicate
    pushCheer(msg)
  }, [user?.userId])
  const { room, loading: roomLoading, scoreEvents, matchJustEnded, applyOptimisticDeltas, applyAuthoritativeScoreChange } = useRoom(onChatMessage, user?.userId, location.state?.initialRoom, minigameMsgHandler, null, onCheerHandler)

  // Frontend-driven match-end trigger. The fulltime event becomes visible
  // to the user when the reveal clock (in useMatch) crosses its gameTime —
  // typically BEFORE the backend's `match_ended` WS broadcast lands, because
  // the event-processor often cold-starts on fulltime (10-30s delay).
  // Flipping this flag locally fires the celebration overlay at the EXACT
  // moment the displayed match clock concludes; the backend `matchJustEnded`
  // from useRoom catches up later and the OR'd flag below stays true.
  const [endedFromFeed, setEndedFromFeed] = useState(false)
  const matchEnded = matchJustEnded || endedFromFeed

  // Bridge: flip the chat-demolished flag the first time the match ends
  // (whether via local fulltime detection or backend `match_ended` WS).
  // The useChat hook above watches this and clears its sessionStorage
  // entry + in-memory messages on the next render.
  useEffect(() => {
    if (matchEnded && !chatDemolished) setChatDemolished(true)
  }, [matchEnded, chatDemolished])

  // Highlight overlay queue — broadcast-style fullscreen card for goals
  // and red cards. Driven entirely client-side from the same reveal
  // pipeline that fires `handleScoreEvent` below.
  const highlights = useHighlights()

  // Set of playerIds the current user drafted, used to flag goals as
  // "for your squad". Refs keep the closure of `handleScoreEvent`
  // stable while always reading the latest squad — same pattern as
  // `roomMembersRef` immediately below.
  const userPlayerIdsRef = useRef(new Set())
  useEffect(() => {
    const me = room?.members?.find(m => m.userId === user?.userId)
    const ids = (me?.teamSelection || []).filter(Boolean)
    userPlayerIdsRef.current = new Set(ids)
  }, [room?.members, user?.userId])

  // Optimistic local scoring — when an event reveals on the displayed clock,
  // compute deltas client-side and bump the leaderboard immediately. The
  // backend score_update WS still arrives later and silently reconciles to
  // the authoritative DDB value. The ref keeps the callback identity stable
  // so useMatch's effect never re-runs on every render.
  const roomMembersRef = useRef(room?.members)
  roomMembersRef.current = room?.members
  const handleScoreEvent = useCallback((event) => {
    const members = roomMembersRef.current
    if (!members?.length) return
    // Attach the source event id so applyOptimisticDeltas can stamp a
    // stable dedup key on each scoreEvents entry. The eventual WS
    // score_update broadcast may not carry the id (yet) — useRoom's
    // dedup falls back to a 30s reason/delta window in that case.
    const deltas = computeOptimisticDeltas(event, members)
      .map(d => ({ ...d, _sourceEventId: event.eventId || '' }))
    if (deltas.length) applyOptimisticDeltas(deltas)

    // Broadcast-style highlight overlay (goals + red cards only). The
    // builder returns null for any other event type, which the queue
    // treats as a no-op. forYourSquad uses the user's current draft;
    // userDelta carries the CURRENT user's real points delta for the
    // event so the chip reads exactly the same value the leaderboard
    // and ScoreToast bump by (no more hardcoded "+5").
    const myDelta = deltas.find(d => d.userId === user?.userId)?.delta || 0
    const highlight = buildHighlightFromEvent(event, {
      userPlayerIds: userPlayerIdsRef.current,
      userDelta:     myDelta,
    })
    if (highlight) highlights.pushHighlight(highlight)
  }, [applyOptimisticDeltas, highlights])

  const { match, events, loading, flashEvent }  = useMatch(matchId, handleScoreEvent)

  // Watch the locally-revealed events for the fulltime event — that's the
  // exact moment the displayed clock concludes the match. Fires the
  // celebration without waiting for the backend WS round-trip.
  useEffect(() => {
    if (endedFromFeed) return
    if (events.some(e => e.eventType === 'fulltime')) setEndedFromFeed(true)
  }, [events, endedFromFeed])

  const minigame = useMiniGame(room, user?.userId, events, matchId, match?.startedAt)
  minigameMsgRef.current = minigame.onMinigameMessage

  // AI Match Director — only the host's tab posts ticks (Lambda fans the
  // result out to all room members via WS, so non-host tabs would just
  // multiply Bedrock cost). Fire-and-forget; commentary surfaces in
  // <MatchFeed>, AI mini-game prompts replace the rule-based ones.
  useDirector(room, events, user?.userId, match)

  // Fetch full player roster once (for enriching teamSelectionDetails)
  useEffect(() => {
    if (!matchId) return
    matchesApi.getPlayers(matchId)
      .then(players => {
        const map = {}
        for (const p of players) map[p.playerId] = p
        setPlayerMap(map)
      })
      .catch(() => {/* silently ignore — popup just shows less info */})
  }, [matchId])

  // Enrich teamSelectionDetails: sessionStorage draft picks (imageUrl) → playerMap (stats) → details (position/shirt)
  const enrichPlayers = (details, localPicks = []) => {
    if (!Array.isArray(details) || !details.length) return []
    const localMap = {}
    for (const p of localPicks) localMap[p.playerId] = p
    return details.map(d => ({
      ...localMap[d.playerId],
      ...playerMap[d.playerId],
      ...d,
    }))
  }

  const homeLocalPicks = useMemo(() => {
    try {
      const s = sessionStorage.getItem(`draft_my_picks_${room?.roomCode}`)
      return s ? JSON.parse(s) : []
    } catch { return [] }
  }, [room?.roomCode])

  const awayLocalPicks = useMemo(() => {
    try {
      const s = sessionStorage.getItem(`draft_opponent_picks_${room?.roomCode}`)
      return s ? JSON.parse(s) : []
    } catch { return [] }
  }, [room?.roomCode])

  const homeTeamPlayers = useMemo(
    () => enrichPlayers(room?.members?.[0]?.teamSelectionDetails, homeLocalPicks),
    [room, playerMap, homeLocalPicks],
  )
  const awayTeamPlayers = useMemo(() => {
    const member1 = room?.members?.[1]
    if (member1?.teamSelectionDetails?.length) {
      return enrichPlayers(member1.teamSelectionDetails, awayLocalPicks)
    }
    // Fallback: full draft picks from sessionStorage
    if (awayLocalPicks.length) return awayLocalPicks.map(p => ({ ...p, ...playerMap[p.playerId] }))
    return []
  }, [room, playerMap, awayLocalPicks])

  const homeBenchPlayers = useMemo(() => {
    const starterIds = new Set(homeTeamPlayers.map(p => p.playerId))
    return homeLocalPicks.filter(p => !starterIds.has(p.playerId))
      .map(p => ({ ...p, ...playerMap[p.playerId] }))
  }, [homeTeamPlayers, homeLocalPicks, playerMap])

  const awayBenchPlayers = useMemo(() => {
    const starterIds = new Set(awayTeamPlayers.map(p => p.playerId))
    return awayLocalPicks.filter(p => !starterIds.has(p.playerId))
      .map(p => ({ ...p, ...playerMap[p.playerId] }))
  }, [awayTeamPlayers, awayLocalPicks, playerMap])

  // Reaction tap on a nutmeg / spectacular_play badge → +2 backend bonus.
  // Three things happen on success:
  //  1. The reactor's leaderboard + scoreEvents are bumped from the HTTP
  //     response immediately via applyAuthoritativeScoreChange. This
  //     guarantees the +2 lands in the per-user timeline even if AWS
  //     API Gateway WS drops the follow-up broadcast (which used to
  //     leave the timeline's sum lower than the leaderboard total).
  //  2. The toast fires for instant visual feedback.
  //  3. The backend's WS score_update arrives ~500ms later; useRoom's
  //     ±2.5s dedup on (userId, reason, delta) drops the duplicate.
  // Other room members still see this user's reaction via the WS path
  // (their tab didn't run #1 so no dedup conflict on their end).
  const handleReactTap = useCallback((event) => {
    if (!room?.roomCode || !event?.eventId) return
    roomsApi.react(room.roomCode, event.eventId, event.eventType)
      .then(result => {
        if (result?.duplicate) return
        for (const c of (result?.changes || [])) {
          applyAuthoritativeScoreChange(c)
        }
        const reasonText = event.eventType === 'nutmeg'
          ? 'reacted to nutmeg'
          : 'reacted to spectacular play'
        emitScoreToast({ delta: 2, reason: reasonText })
      })
      .catch(err => {
        logger.warn('MatchPage', 'react tap failed', err)
        const msg = String(err?.message || '').toLowerCase()
        if (msg.includes('duplicate')) return
        toast.error('Reaction did not register', { duration: 2500 })
      })
  }, [room?.roomCode, applyAuthoritativeScoreChange])

  if (loading || roomLoading) return <LoadingSpinner />
  if (!room) return <Navigate to={`/lobby/${matchId}`} replace />

  return (
    <div className="flex flex-col min-h-screen">
      <SkillFlashBadge event={flashEvent} onReact={handleReactTap} />
      <HighlightOverlay
        highlight={highlights.current}
        onDismiss={highlights.dismiss}
        reducedMotion={highlights.reducedMotion}
      />
      <MatchMiniGameModal
        state={minigame.state}
        onSubmit={minigame.submit}
        onClose={minigame.close}
        playerMap={playerMap}
        currentUserId={user?.userId}
        members={room?.members}
      />
      {/* AI Director commentary — fixed-position pop-up overlay so it shows
          on every tab (feed, squad, chat) and never blocks the user from
          interacting with content underneath. */}
      <DirectorCommentary stack={room?.commentaryStack} />
      <Scoreboard match={match} events={events} />

      {/* Watchers strip */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.04]">
        <div className="flex -space-x-2">
          {room.members?.slice(0, 5).map((m, i) => (
            <MemberAvatar
              key={m.userId}
              member={m}
              size={28}
              colorIndex={i}
              ring="ring-2 ring-gray-950"
            />
          ))}
        </div>
        <p className="text-gray-500 text-xs">
          {room.members?.length === 1
            ? 'Just you watching'
            : `${room.members?.length} watching together`}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.04]">
        {['feed', 'squad', 'chat'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-semibold tracking-widest uppercase transition-colors relative ${
              tab === t ? 'text-white' : 'text-gray-600'
            }`}
          >
            {t === 'chat' && messages.length > 0 && tab !== 'chat' && (
              <span className="absolute top-2.5 right-[calc(50%-22px)] w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-px bg-white" />
            )}
          </button>
        ))}
      </div>

      {/* Content. Chat tab is height-bounded so the page can't scroll past
          the input bar — only the conversation itself scrolls. Feed +
          squad keep their natural scroll behavior. */}
      <div className={tab === 'chat' ? 'flex-1 min-h-0 overflow-hidden relative' : 'relative'}>
        {tab === 'feed' && <MatchFeed events={events} playerMap={playerMap} />}

        {tab === 'squad' && (
          <div className="px-2 py-3">
            <SquadVisualization
              match={match}
              homeTeamPlayers={homeTeamPlayers}
              awayTeamPlayers={awayTeamPlayers}
              homeBenchPlayers={homeBenchPlayers}
              awayBenchPlayers={awayBenchPlayers}
              events={events}
              homeMemberName={room?.members?.[0]?.displayName}
              awayMemberName={room?.members?.[1]?.displayName}
              members={room?.members}
              currentUserId={user?.userId}
              scoreEvents={scoreEvents}
              playerMap={playerMap}
            />
          </div>
        )}

        {tab === 'chat' && (
          <ChatPanel
            messages={messages}
            onSend={text => sendMessage(room.roomCode, text)}
            room={room}
          />
        )}

        {tab === 'feed' && bubbles.length > 0 && (
          <ChatBubbles bubbles={bubbles} />
        )}
      </div>

      {/* Floating-emoji reactions — party members tap the button bottom-right
          to fire one of 6 emojis; every member sees it animate up the right
          edge of the screen. Purely cosmetic, no scoring side-effects. */}
      <ReactionsOverlay />
      <ReactionsButton roomCode={room?.roomCode} />

      {/* Full-time celebration: red confetti (5s) + looped match-end sting
          + full-screen summary modal (final score, per-member credits,
          win streak, badges earned this match). Owns the app-music duck +
          celebration song fade lifecycle; dismissed only via "Back to
          Home". The matchJustEnded flag stays true until MatchPage
          unmounts on navigate. */}
      <MatchEndCelebration
        shown={matchEnded}
        match={match}
        room={room}
        scoreEvents={scoreEvents}
      />
    </div>
  )
}
