import { useState, useCallback, useRef } from 'react'
import { roomsApi } from '../services/api'

const MAX_BUBBLE_MESSAGES = 3
const BUBBLE_TTL_MS = 4000

export function useChat() {
  const [messages, setMessages] = useState([])
  const [bubbles, setBubbles]   = useState([])
  const bubbleTimers            = useRef({})

  const onChatMessage = useCallback((msg) => {
    const message = { id: `${msg.userId}-${msg.ts}`, ...msg }

    setMessages(prev => [...prev, message])
    setBubbles(prev => [...prev, message].slice(-MAX_BUBBLE_MESSAGES))

    clearTimeout(bubbleTimers.current[message.id])
    bubbleTimers.current[message.id] = setTimeout(() => {
      setBubbles(prev => prev.filter(b => b.id !== message.id))
    }, BUBBLE_TTL_MS)
  }, [])

  const sendMessage = useCallback(async (roomCode, text) => {
    if (!roomCode || !text.trim()) return
    await roomsApi.sendMessage(roomCode, text.trim())
  }, [])

  return { messages, bubbles, onChatMessage, sendMessage }
}
