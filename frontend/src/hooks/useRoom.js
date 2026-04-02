import { useState, useEffect, useCallback } from 'react'
import { roomsApi } from '../services/api'
import { useWebSocket } from './useWebSocket'
import { logger } from '../services/logger'

const ROOM_CODE_KEY = 'fan_squad_room_code'

export function useRoom(user) {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleMessage = useCallback((message) => {
    logger.info('useRoom', 'WebSocket message', message)

    if (message.type === 'members_update') {
      setRoom(prev => prev ? { ...prev, members: message.members } : prev)
    }
  }, [])

  const { send } = useWebSocket({
    roomCode: room?.roomCode,
    matchId: room?.matchId,
    userId: user?.userId,
    displayName: user?.displayName,
    onMessage: handleMessage,
  })

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

  const clearError = () => setError('')

  const createRoom = async (matchId) => {
    setLoading(true)
    setError('')
    try {
      const data = await roomsApi.create(matchId)
      setRoom(data)
      localStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room created', data)
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to create room', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (roomCode) => {
    setLoading(true)
    setError('')
    try {
      const data = await roomsApi.join(roomCode)
      setRoom(data)
      localStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room joined', data)
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to join room', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const leaveRoom = () => {
    localStorage.removeItem(ROOM_CODE_KEY)
    setRoom(null)
    logger.info('useRoom', 'Left room')
  }

  return {
    room,
    loading,
    error,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    send,
  }
}