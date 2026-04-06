import { useState, useEffect } from 'react'
import { matchesApi } from '../services/api'
import { logger } from '../services/logger'

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

  useEffect(() => {
    if (!matchId) return

    const fetchMatch = () => {
      matchesApi.get(matchId)
        .then(data => {
          setMatch(data)
          logger.success('useMatch', 'Match updated', data)
        })
        .catch(err => {
          logger.error('useMatch', 'Failed to fetch match', err)
          setError(err.message)
        })
        .finally(() => setLoading(false))
    }

    const fetchEvents = () => {
      matchesApi.getEvents(matchId)
        .then(data => setEvents(data))
        .catch(err => logger.warn('useMatch', 'Failed to fetch events', err))
    }

    fetchMatch()
    fetchEvents()

    const interval = setInterval(() => {
      fetchMatch()
      fetchEvents()
    }, 1000)

    return () => clearInterval(interval)
  }, [matchId])

  return { match, events, loading, error }
}