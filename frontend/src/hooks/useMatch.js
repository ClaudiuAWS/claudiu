import { useState, useEffect, useCallback, useRef } from 'react'
import { matchesApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'
import { gameTimeToSeconds } from '../utils/matchEvents'

const FLASH_EVENT_TYPES = new Set(['nutmeg', 'spectacular_play'])

// How long to hold incoming `match_update` messages before flushing to state.
// Backend SQS FIFO already serializes events in scheduled order; this window
// absorbs residual WS / network jitter so events surface to the user in
// gameTime order. 500 ms is invisible UX-wise (the match clock keeps
// interpolating) and large enough to swallow normal API-Gateway fan-out lag.
const REORDER_BUFFER_MS = 500

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
  // Reordering buffer: holds incoming match_update messages until the next
  // drain tick, then flushes them in ascending-gameTime order. Even with
  // SQS FIFO upstream, parallel WS fan-out across many connection IDs can
  // briefly invert arrival; this collapses that window.
  const wsBufferRef    = useRef([])
  const drainTimerRef  = useRef(null)

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

  // Drain the reorder buffer: sort all queued WS messages by gameTime, then
  // apply event additions, the latest match snapshot, and any skill flash —
  // so what the user sees follows true match-clock order rather than
  // Lambda-cold-start arrival order.
  const drainBuffer = useCallback(() => {
    drainTimerRef.current = null
    const batch = wsBufferRef.current
    wsBufferRef.current = []
    if (!batch.length) return

    batch.sort((a, b) => {
      const ka = gameTimeToSeconds(a.event?.gameTime)
      const kb = gameTimeToSeconds(b.event?.gameTime)
      if (ka !== kb) return ka - kb
      return (a._receivedAt ?? 0) - (b._receivedAt ?? 0)
    })

    setEvents(prev => {
      const ids = new Set(prev.map(e => e.eventId))
      const additions = []
      for (const msg of batch) {
        if (!msg.event) continue
        const flat = { ...(msg.event.data ?? {}), ...msg.event }
        delete flat.data
        delete flat._receivedAt
        if (!ids.has(flat.eventId)) {
          additions.push(flat)
          ids.add(flat.eventId)
        }
      }
      return additions.length ? [...prev, ...additions] : prev
    })

    // Latest gameTime in the batch wins for the scoreboard snapshot.
    const latestMatch = batch[batch.length - 1]?.match
    if (latestMatch) setMatch(latestMatch)

    // Skill flash on the most-recent qualifying event in the batch.
    for (let i = batch.length - 1; i >= 0; i--) {
      const ev = batch[i].event
      if (ev && FLASH_EVENT_TYPES.has(ev.eventType)) {
        const flat = { ...(ev.data ?? {}), ...ev }
        delete flat.data
        clearTimeout(flashTimerRef.current)
        setFlashEvent(flat)
        flashTimerRef.current = setTimeout(() => setFlashEvent(null), 3000)
        break
      }
    }
  }, [])

  // Real-time updates via WebSocket
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'match_update') {
      wsBufferRef.current.push({ ...msg, _receivedAt: Date.now() })
      if (drainTimerRef.current == null) {
        drainTimerRef.current = setTimeout(drainBuffer, REORDER_BUFFER_MS)
      }
      logger.success('useMatch', 'WS match_update buffered', msg.match)
    }
  }, [drainBuffer])

  useWebSocket(matchId ? `match#${matchId}` : null, handleMessage)

  // Flush buffer on unmount so we never leak a setTimeout.
  useEffect(() => () => {
    if (drainTimerRef.current != null) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
    if (flashTimerRef.current != null) {
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }, [])

  return { match, events, loading, error, flashEvent }
}
