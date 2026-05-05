import { useState, useEffect, useCallback, useRef } from 'react'
import { matchesApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'

const FLASH_EVENT_TYPES = new Set(['nutmeg', 'spectacular_play'])

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
  const [flashEvent, setFlashEvent] = useState(null)
  const flashTimerRef = useRef(null)

  // Initial load
  useEffect(() => {
    if (!matchId) return

    Promise.all([
      matchesApi.get(matchId),
      matchesApi.getEvents(matchId),
    ])
      .then(([matchData, eventsData]) => {
        setMatch(matchData)
        // Merge: keep any WS events that arrived before REST completed
        setEvents(prev => {
          const ids = new Set(eventsData.map(e => e.eventId))
          const wsOnly = prev.filter(e => !ids.has(e.eventId))
          return [...eventsData, ...wsOnly]
        })
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
      if (msg.event) {
        const flat = { ...(msg.event.data ?? {}), ...msg.event }
        delete flat.data
        setEvents(prev => {
          const ids = new Set(prev.map(e => e.eventId))
          return ids.has(flat.eventId) ? prev : [...prev, flat]
        })
        // Trigger skill flash badge for nutmeg / spectacular_play
        if (FLASH_EVENT_TYPES.has(flat.eventType)) {
          clearTimeout(flashTimerRef.current)
          setFlashEvent(flat)
          flashTimerRef.current = setTimeout(() => setFlashEvent(null), 3000)
        }
      }
      logger.success('useMatch', 'WS match_update', msg.match)
    }
  }, [])

  useWebSocket(matchId ? `match#${matchId}` : null, handleMessage)

  return { match, events, loading, error, flashEvent }
}
