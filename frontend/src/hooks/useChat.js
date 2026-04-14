import { useState, useCallback, useRef } from 'react'
import { roomsApi } from '../services/api'

const MAX_BUBBLE_MESSAGES = 3
const BUBBLE_TTL_MS = 4000

export function useChat(room) {
  const [messages, setMessages]       = useState([])  // full history
  const [bubbles, setBubbles]         = useState([])  // last 3, auto-expire
  const bubbleTimers                  = useRef({})

  // Called by useRoom when a chat_message WS message arrives
  const onChatMessage = useCallback((msg) => {
    const message = { id: `${msg.userId}-${msg.ts}`, ...msg }

    setMessages(prev => [...prev, message])

    setBubbles(prev => {
      const next = [...prev, message].slice(-MAX_BUBBLE_MESSAGES)
      return next
    })

    // Auto-remove bubble after TTL
    clearTimeout(bubbleTimers.current[message.id])
    bubbleTimers.current[message.id] = setTimeout(() => {
      setBubbles(prev => prev.filter(b => b.id !== message.id))
    }, BUBBLE_TTL_MS)
  }, [])

  const sendMessage = useCallback(async (text) => {
    if (!room?.roomCode || !text.trim()) return
    await roomsApi.sendMessage(room.roomCode, text.trim())
  }, [room?.roomCode])

  return { messages, bubbles, onChatMessage, sendMessage }
}
