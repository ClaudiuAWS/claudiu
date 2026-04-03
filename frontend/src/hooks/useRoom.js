import { useState, useEffect } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import toast from 'react-hot-toast'

const ROOM_CODE_KEY = 'fan_squad_room_code'

export function useRoom() {
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

  // Poll for room updates every 3 seconds when in a room
  useEffect(() => {
    if (!room?.roomCode) return

    const interval = setInterval(async () => {
      try {
        const data = await roomsApi.get(room.roomCode)
        setRoom(data)
      } catch (err) {
        logger.warn('useRoom', 'Room no longer exists', err)
        localStorage.removeItem(ROOM_CODE_KEY)
        setRoom(null)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [room?.roomCode])

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