import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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

// Cadence for advancing the reveal clock. 250 ms is ~1.25 game-seconds at 5x —
// imperceptible delay between an event's true gameTime and when it appears.
const REVEAL_TICK_MS = 250

function parseReplaySpeed(match) {
  if (match?.speedMultiplier == null || match?.speedMultiplier === '') return 1
  const n = parseFloat(String(match.speedMultiplier))
  return Number.isFinite(n) && n > 0 ? n : 1
}

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
  // allEvents = everything received from REST + WS. Consumers see the filtered
  // `events` (below) which only includes events whose gameTime has been
  // reached by the displayed clock — so events appear in the feed at the
  // moment the timer hits their minute, giving mini-game triggers a
  // deterministic match-clock alignment regardless of backend dispatch jitter.
  const [allEvents, setAllEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flashEvent, setFlashEvent] = useState(null)
  const [revealSec, setRevealSec] = useState(-1)
  const flashTimerRef = useRef(null)
  const revealedIdsRef = useRef(new Set())
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
        setAllEvents(prev => {
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
  // apply event additions and the latest match snapshot — so what the user
  // sees follows true match-clock order rather than Lambda-cold-start
  // arrival order. Skill flashes are NOT triggered here; that runs from a
  // separate effect on the *revealed* events list so flash UX aligns with the
  // displayed clock instead of WS arrival.
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

    setAllEvents(prev => {
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

    // Latest-arriving event's snapshot wins, NOT the highest-gameTime event's.
    // Backend processes events in SQS-FIFO arrival order, so the most-recently-
    // arrived snapshot is the most up-to-date. Picking by highest gameTime can
    // pin status='halftime' if a 1st-half stoppage event (with gameTime > the
    // halftime event's gameTime) arrives after halftime in SQS — its snapshot
    // would still say 'halftime' and overwrite the secondhalf 'live' snapshot.
    let latestArrival = batch[0]
    for (const m of batch) {
      if ((m._receivedAt ?? 0) > (latestArrival._receivedAt ?? 0)) latestArrival = m
    }
    if (latestArrival?.match) setMatch(latestArrival.match)
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

  // ── Reveal clock ──────────────────────────────────────────────────────────
  // Reveal threshold is just elapsed × speed since /start.
  //   • no startedAt (upcoming) → -1, nothing revealed
  //   • live or post-match     → ticks forward; events become visible once
  //                              their gameTime ≤ revealSec
  // Boundaries (halftime/secondhalf/fulltime) fall out of this naturally —
  // halftime is revealed when elapsed*speed crosses 51:00, secondhalf at
  // 51:01, fulltime at 98:04, etc. We deliberately do NOT pre-clamp using the
  // mere presence of those events in allEvents: with the REST endpoint
  // returning all events upfront, `events.some(eventType==='fulltime')` is
  // true from page load, which would otherwise force revealSec to MAX before
  // the match has even started.
  useEffect(() => {
    if (!match?.startedAt) {
      setRevealSec(-1)
      return
    }
    const speed = parseReplaySpeed(match)
    const startMs = new Date(match.startedAt).getTime()
    const tick = () => {
      const elapsed = (Date.now() - startMs) / 1000
      setRevealSec(elapsed * speed)
    }
    tick()
    const id = setInterval(tick, REVEAL_TICK_MS)
    return () => clearInterval(id)
  }, [match?.startedAt, match?.speedMultiplier])

  // Filter: an event is visible once the reveal clock reaches its gameTime.
  // Late-arriving events (backend dispatched late) still appear immediately
  // when they reach us — the reveal floor only delays *early* arrivals.
  const events = useMemo(() => {
    if (revealSec < 0) return []
    return allEvents.filter(e => {
      const sec = gameTimeToSeconds(e.gameTime)
      return sec >= 0 && sec <= revealSec
    })
  }, [allEvents, revealSec])

  // Skill-flash and (future) mini-game triggers fire when an event becomes
  // newly revealed — i.e. the moment it appears in the feed. This guarantees
  // mini-games are timed to the displayed match clock, not to backend WS
  // arrival timing (which can be tens of seconds off due to dispatch jitter).
  useEffect(() => {
    if (!events.length) return
    const newlyRevealed = events.filter(e => !revealedIdsRef.current.has(e.eventId))
    if (!newlyRevealed.length) return
    for (const e of newlyRevealed) revealedIdsRef.current.add(e.eventId)

    // Pick the latest-by-gameTime flash-eligible event in this batch.
    let pick = null
    for (const ev of newlyRevealed) {
      if (FLASH_EVENT_TYPES.has(ev.eventType)) {
        if (!pick || gameTimeToSeconds(ev.gameTime) > gameTimeToSeconds(pick.gameTime)) {
          pick = ev
        }
      }
    }
    if (pick) {
      clearTimeout(flashTimerRef.current)
      setFlashEvent(pick)
      flashTimerRef.current = setTimeout(() => setFlashEvent(null), 3000)
    }
  }, [events])

  return { match, events, loading, error, flashEvent }
}
