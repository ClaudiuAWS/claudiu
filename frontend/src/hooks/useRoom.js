import { useState, useEffect, useCallback } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'
import toast from 'react-hot-toast'

const ROOM_CODE_KEY = 'fan_squad_room_code'

// Listeners for mini-game lifecycle messages. Hooks like useMiniGame can
// subscribe via useRoom's `onMinigameMessage` callback so the WS connection
// stays single (one channel subscription per room).

export function useRoom(onChatMessage, currentUserId, initialRoom = null, onMinigameMessage = null) {
  const [room, setRoom] = useState(initialRoom)
  const [loading, setLoading] = useState(initialRoom ? false : true)

  // Restore room from sessionStorage on mount (skip if we already have room from nav state)
  useEffect(() => {
    if (initialRoom) return

    const savedCode = sessionStorage.getItem(ROOM_CODE_KEY)
    if (!savedCode) {
      setLoading(false)
      return
    }

    const controller = new AbortController()

    roomsApi.get(savedCode)
      .then(data => {
        if (!controller.signal.aborted) {
          setRoom(data)
          logger.success('useRoom', 'Room restored', data)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          logger.warn('useRoom', 'Saved room gone, clearing', err)
          sessionStorage.removeItem(ROOM_CODE_KEY)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  // Real-time updates via WebSocket
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'room_update') {
      setRoom(msg.room)
      logger.success('useRoom', 'WS room_update', msg.room)
    } else if (msg.type === 'room_closed') {
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast('Room was closed')
      logger.info('useRoom', 'WS room_closed')
    } else if (msg.type === 'match_ended') {
      toast('Full time! 🏁')
      logger.info('useRoom', 'WS match_ended', msg.finalResult)
    } else if (msg.type === 'chat_message') {
      onChatMessage?.(msg)
    } else if (msg.type === 'score_update') {
      // Keep the leaderboard in sync — but no toast. Score deltas now
      // surface through the per-event mini-games rather than a popup
      // tied to backend WS arrival (which had inconsistent timing
      // relative to the displayed match clock).
      const scoreMap = Object.fromEntries(msg.leaderboard.map(e => [e.userId, e.score]))
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.map(m => ({ ...m, score: scoreMap[m.userId] ?? m.score }))
      } : prev)
      logger.info('useRoom', 'WS score_update', msg.changes)
    } else if (msg.type === 'minigame_start' || msg.type === 'minigame_result' || msg.type === 'minigame_expired') {
      // Mini-game lifecycle messages — forward to the dedicated useMiniGame
      // hook via the optional callback. Keeping the room WS connection
      // single-purpose for state sync; mini-game UI lives elsewhere.
      onMinigameMessage?.(msg)
      logger.info('useRoom', `WS ${msg.type}`, msg)
    }
  }, [onChatMessage, currentUserId, onMinigameMessage])

  useWebSocket(room?.roomCode ? `room#${room.roomCode}` : null, handleMessage)

  const createRoom = async (matchId) => {
    setLoading(true)
    try {
      const data = await roomsApi.create(matchId)
      setRoom(data)
      sessionStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room created', data)
      toast.success('Room created!')
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to create room', err)
      toast.error(err.message || 'Failed to create room')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (roomCode) => {
    setLoading(true)
    try {
      const data = await roomsApi.join(roomCode)
      setRoom(data)
      sessionStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room joined', data)
      toast.success('Joined room!')
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to join room', err)
      toast.error(err.message || 'Failed to join room')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const leaveRoom = async () => {
    if (!room?.roomCode) return

    setLoading(true)
    try {
      const result = await roomsApi.leave(room.roomCode)
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)

      if (result.deleted) {
        logger.info('useRoom', 'Room was deleted')
        toast.success('Room destroyed')
      } else {
        logger.success('useRoom', 'Left room')
        toast.success('Left room')
      }
    } catch (err) {
      logger.error('useRoom', 'Failed to leave room', err)
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast.error(err.message || 'Failed to leave room')
    } finally {
      setLoading(false)
    }
  }

  return {
    room,
    loading,
    createRoom,
    joinRoom,
    leaveRoom,
  }
}
