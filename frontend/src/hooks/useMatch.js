import { useState, useEffect, useCallback } from 'react'
import { matchesApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'

export function useMatches() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    matchesApi.list()
      .then(data => setMatches(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { matches, loading, error }
}

export function useMatch(matchId) {
  const [match, setMatch] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Initial load
  useEffect(() => {
    if (!matchId) return

    Promise.all([
      matchesApi.get(matchId),
      matchesApi.getEvents(matchId),
    ])
      .then(([matchData, eventsData]) => {
        setMatch(matchData)
        setEvents(eventsData)
        logger.success('useMatch', 'Initial load', matchData)
      })
      .catch(err => {
        logger.error('useMatch', 'Failed to fetch match', err)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [matchId])

  // Real-time updates via WebSocket
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'match_update') {
      setMatch(msg.match)
      setEvents(prev => {
        const flat = { ...msg.event.data, ...msg.event }
        delete flat.data
        const ids = new Set(prev.map(e => e.eventId))
        return ids.has(flat.eventId) ? prev : [...prev, flat]
      })
      logger.success('useMatch', 'WS match_update', msg.match)
    }
  }, [])

  useWebSocket(matchId ? `match#${matchId}` : null, handleMessage)

  return { match, events, loading, error }
}
