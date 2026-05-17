import { useState, useCallback, useRef, useEffect } from 'react'
import { roomsApi } from '../services/api'

const MAX_BUBBLE_MESSAGES = 3
const BUBBLE_TTL_MS = 4000

// sessionStorage (not localStorage) is the right scope here: messages
// survive a hard refresh — which is what the user asked for — but a new
// browser tab starts with a clean slate, and the entry clears
// automatically when the user closes the tab.
const storageKey = (matchId) => `chat_history_${matchId || 'default'}`

function loadMessages(matchId) {
  if (!matchId) return []
  try {
    const raw = sessionStorage.getItem(storageKey(matchId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function useChat(matchId, matchEnded = false) {
  const [messages, setMessages] = useState(() => loadMessages(matchId))
  const [bubbles, setBubbles]   = useState([])
  const bubbleTimers            = useRef({})
  // Skip the persist effect on the same tick that clears history,
  // otherwise we'd race the clear and write `[]` to a key we just
  // deleted (harmless but pointless) — or worse, repopulate the key on
  // any straggling WS chat_message that arrives post-fulltime.
  const wipedRef = useRef(false)

  // Persist on every change so a hard refresh restores the conversation.
  // Bubbles are intentionally transient (ephemeral floaters) and not
  // persisted. Skip while the history is in the "demolished" state.
  useEffect(() => {
    if (!matchId || wipedRef.current) return
    try { sessionStorage.setItem(storageKey(matchId), JSON.stringify(messages)) } catch {}
  }, [messages, matchId])

  // Demolish chat history when the match ends. Both the sessionStorage
  // entry AND the live `messages` state get cleared so a user returning
  // to the match page (e.g. via browser back) doesn't see the old
  // conversation. Bubbles also reset for the same reason.
  useEffect(() => {
    if (!matchEnded || !matchId) return
    wipedRef.current = true
    setMessages([])
    setBubbles([])
    try { sessionStorage.removeItem(storageKey(matchId)) } catch {}
  }, [matchEnded, matchId])

  const onChatMessage = useCallback((msg) => {
    // Any post-fulltime WS chat is dropped — once the match is over the
    // history is supposed to stay demolished.
    if (wipedRef.current) return

    const message = { id: `${msg.userId}-${msg.ts}`, ...msg }

    setMessages(prev => {
      // De-dup: a hard refresh restores messages, then the WS handler
      // might re-deliver the same ones. Skip if the id is already there.
      if (prev.some(m => m.id === message.id)) return prev
      return [...prev, message]
    })
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
