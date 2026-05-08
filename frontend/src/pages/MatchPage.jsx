import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, Navigate, useLocation } from 'react-router-dom'
import { useMatch } from '../hooks/useMatch'
import { useRoom } from '../hooks/useRoom'
import { useChat } from '../hooks/useChat'
import { useAuth } from '../hooks/useAuth'
import { matchesApi } from '../services/api'
import Scoreboard from '../components/match/Scoreboard'
import MatchFeed from '../components/match/MatchFeed'
import ChatPanel from '../components/match/ChatPanel'
import ChatBubbles from '../components/match/ChatBubbles'
import { SquadVisualization } from '../components/match/SquadVisualization'
import SkillFlashBadge from '../components/match/SkillFlashBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import MatchMiniGameModal from '../components/minigame/MatchMiniGameModal'
import { useMiniGame } from '../hooks/useMiniGame'

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500']

export default function MatchPage() {
  const { matchId } = useParams()
  const location    = useLocation()
  const [tab, setTab] = useState('feed')

  // Full player lookup: playerId → player object (has stats, displayName, etc.)
  const [playerMap, setPlayerMap] = useState({})

  const { user }                                = useAuth()
  const { messages, bubbles, onChatMessage, sendMessage } = useChat()
  // useRoom's WS handler will forward minigame messages via the optional 4th
  // arg. We construct a ref-stable forwarder here and feed it both ways.
  const minigameMsgRef = useRef(null)
  const minigameMsgHandler = useCallback((msg) => minigameMsgRef.current?.(msg), [])
  const { room, loading: roomLoading }          = useRoom(onChatMessage, user?.userId, location.state?.initialRoom, minigameMsgHandler)
  const { match, events, loading, flashEvent }  = useMatch(matchId)
  const minigame = useMiniGame(room, user?.userId)
  minigameMsgRef.current = minigame.onMinigameMessage

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

  // Enrich teamSelectionDetails: localStorage draft picks (imageUrl) → playerMap (stats) → details (position/shirt)
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
      const s = localStorage.getItem(`draft_my_picks_${room?.roomCode}`)
      return s ? JSON.parse(s) : []
    } catch { return [] }
  }, [room?.roomCode])

  const awayLocalPicks = useMemo(() => {
    try {
      const s = localStorage.getItem(`draft_opponent_picks_${room?.roomCode}`)
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
    // Fallback: full draft picks from localStorage
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

  if (loading || roomLoading) return <LoadingSpinner />
  if (!room) return <Navigate to={`/lobby/${matchId}`} replace />

  return (
    <div className="flex flex-col">
      <SkillFlashBadge event={flashEvent} />
      <MatchMiniGameModal
        state={minigame.state}
        onSubmit={minigame.submit}
        onClose={minigame.close}
      />
      <Scoreboard match={match} events={events} />

      {/* Watchers strip */}
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
              <span className="absolute top-2.5 right-[calc(50%-22px)] w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-px bg-white" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative">
        {tab === 'feed' && <MatchFeed events={events} />}

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
    </div>
  )
}
