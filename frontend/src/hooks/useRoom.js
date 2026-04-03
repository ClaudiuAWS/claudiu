import { useState, useEffect } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'

const ROOM_CODE_KEY = 'fan_squad_room_code'

export function useRoom() {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  // Poll for room updates every 3 seconds when in a room
  useEffect(() => {
    if (!room?.roomCode) return

    const interval = setInterval(async () => {
      try {
        const data = await roomsApi.get(room.roomCode)
        setRoom(data)
      } catch (err) {
        // Room was deleted or no longer exists
        logger.warn('useRoom', 'Room no longer exists', err)
        localStorage.removeItem(ROOM_CODE_KEY)
        setRoom(null)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [room?.roomCode])

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

  const leaveRoom = async () => {
    if (!room?.roomCode) return
    
    try {
      const result = await roomsApi.leave(room.roomCode)
      localStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      
      if (result.deleted) {
        logger.info('useRoom', 'Room was deleted')
      } else {
        logger.success('useRoom', 'Left room')
      }
    } catch (err) {
      logger.error('useRoom', 'Failed to leave room', err)
      // Clear local state anyway
      localStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
    }
  }

  return {
    room,
    loading,
    error,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
  }
}