import { useState } from 'react'
import { roomsApi } from '../services/api'

export function useRoom() {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const clearError = () => setError('')

  const createRoom = async (matchId) => {
    setLoading(true)
    setError('')
    try {
      const data = await roomsApi.create(matchId)
      setRoom(data)
      return data
    } catch (err) {
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
      return data
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const leaveRoom = () => setRoom(null)

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