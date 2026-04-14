import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useMatch } from '../hooks/useMatch'
import { useRoom } from '../hooks/useRoom'
import { useChat } from '../hooks/useChat'
import Scoreboard from '../components/match/Scoreboard'
import MatchFeed from '../components/match/MatchFeed'
import ChatPanel from '../components/match/ChatPanel'
import ChatBubbles from '../components/match/ChatBubbles'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500']

export default function MatchPage() {
  const { matchId } = useParams()
  const [tab, setTab] = useState('feed') // 'feed' | 'chat'

  const { messages, bubbles, onChatMessage, sendMessage } = useChat()
  const { room, loading: roomLoading } = useRoom(onChatMessage)
  const { match, events, loading } = useMatch(matchId)

  if (loading || roomLoading) return <LoadingSpinner />
  if (!room) return <Navigate to={`/lobby/${matchId}`} replace />

  return (
    <div className="flex flex-col pb-28">
      <Scoreboard match={match} events={events} />

      {/* Squad strip */}
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
          {room.members?.length === 1 ? 'Just you watching' : `${room.members?.length} watching together`}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.04]">
        {['feed', 'chat'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-semibold tracking-widest uppercase transition-colors relative ${
              tab === t ? 'text-white' : 'text-gray-600'
            }`}
          >
            {t === 'chat' && messages.length > 0 && (
              <span className="absolute top-2.5 right-[calc(50%-22px)] w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
            {t}
          </button>
        ))}
        {/* Active indicator */}
        <div
          className="absolute h-px bg-white transition-all duration-200"
          style={{ bottom: 0, width: '50%', left: tab === 'feed' ? 0 : '50%' }}
        />
      </div>

      {/* Content */}
      <div className="relative">
        {tab === 'feed'
          ? <MatchFeed events={events} />
          : <ChatPanel messages={messages} onSend={(text) => sendMessage(room.roomCode, text)} room={room} />
        }

        {/* Floating chat bubbles — only on feed tab */}
        {tab === 'feed' && bubbles.length > 0 && (
          <ChatBubbles bubbles={bubbles} />
        )}
      </div>
    </div>
  )
}
