import { useState, useEffect, useCallback } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'
import toast from 'react-hot-toast'

const ROOM_CODE_KEY = 'fan_squad_room_code'

export function useRoom(onChatMessage) {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore room from localStorage on mount
  useEffect(() => {
    const savedCode = localStorage.getItem(ROOM_CODE_KEY)
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
          localStorage.removeItem(ROOM_CODE_KEY)
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
      localStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast('Room was closed')
      logger.info('useRoom', 'WS room_closed')
    } else if (msg.type === 'match_ended') {
      toast('Full time! 🏁')
      logger.info('useRoom', 'WS match_ended', msg.finalResult)
    } else if (msg.type === 'chat_message') {
      onChatMessage?.(msg)
    }
  }, [onChatMessage])

  useWebSocket(room?.roomCode ? `room#${room.roomCode}` : null, handleMessage)

  const createRoom = async (matchId) => {
    setLoading(true)
    try {
      const data = await roomsApi.create(matchId)
      setRoom(data)
      localStorage.setItem(ROOM_CODE_KEY, data.roomCode)
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
      localStorage.setItem(ROOM_CODE_KEY, data.roomCode)
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
      localStorage.removeItem(ROOM_CODE_KEY)
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
      localStorage.removeItem(ROOM_CODE_KEY)
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
