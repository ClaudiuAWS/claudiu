import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500']

function avatarColor(userId, room) {
  const idx = (room?.members ?? []).findIndex(m => m.userId === userId)
  return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length]
}

export default function ChatPanel({ messages, onSend, room }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 340px)' }}>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
            <p className="text-2xl">💬</p>
            <p className="text-gray-500 text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.userId === user?.userId
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                {!isMe && (
                  <div className={`w-7 h-7 rounded-full ${avatarColor(msg.userId, room)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                    {msg.displayName?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && <span className="text-gray-600 text-[10px] px-1">{msg.displayName}</span>}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-snug ${
                      isMe
                        ? 'bg-green-500 text-black font-medium rounded-br-sm'
                        : 'text-white rounded-bl-sm'
                    }`}
                    style={!isMe ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.06)' } : {}}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/[0.04]">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Say something…"
            maxLength={200}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-600"
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="w-8 h-8 rounded-xl bg-green-500 disabled:opacity-30 flex items-center justify-center transition-opacity flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M7.5 2L13 7l-5.5 5" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
