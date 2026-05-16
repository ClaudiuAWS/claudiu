import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Highlights queue.
 *
 * Owns the broadcast-style overlay shown for goals and red cards. Events
 * are pushed into a FIFO queue; we play them one at a time so back-to-back
 * goals/red cards never overlap or stack.
 *
 * State:
 *   - `current`  → the highlight being displayed right now (or null when idle)
 *   - `queue`    → pending highlights waiting to play
 *
 * Lifecycle of a single highlight:
 *   pushHighlight(...) → enqueue
 *   ↓ (idle)
 *   show for `displayMs`
 *   ↓
 *   `dismiss()` (auto or tap) → clear current → if queue non-empty, play next
 *
 * Respects `prefers-reduced-motion`: callers can read `reducedMotion` and
 * trim animations accordingly. The hook itself still queues + dismisses
 * exactly the same way, so playback timing stays consistent.
 */

// Per-type display duration. Goals get a touch longer because the overlay
// reads more info (scorer + minute + score line).
const DURATION_MS = {
  goal:    2500,
  redCard: 2000,
}

// Hard cap on the queue so a wild flurry of events can't flood the UI.
// (E.g. testing: replay speed of 30× with several rapid-fire goals.)
const MAX_QUEUE = 4

export function useHighlights() {
  const [current, setCurrent] = useState(null)
  const queueRef = useRef([])
  const dismissTimerRef = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  // Drain one item from the queue into `current`. No-op when queue is empty.
  const playNext = useCallback(() => {
    const next = queueRef.current.shift()
    if (!next) {
      setCurrent(null)
      return
    }
    setCurrent(next)
    const ms = DURATION_MS[next.kind] ?? 2500
    clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      setCurrent(null)
      // playNext will pick up the next one on the effect below.
    }, ms)
  }, [])

  // When `current` clears, if there are queued items waiting, play the next.
  useEffect(() => {
    if (current !== null) return
    if (queueRef.current.length === 0) return
    playNext()
  }, [current, playNext])

  // Push a new highlight onto the queue. Idempotent on `id` so a re-reveal
  // (e.g. WS reconnect that re-fires the same event) cannot duplicate.
  const seenIdsRef = useRef(new Set())
  const pushHighlight = useCallback((highlight) => {
    if (!highlight || !highlight.id) return
    if (seenIdsRef.current.has(highlight.id)) return
    seenIdsRef.current.add(highlight.id)

    if (queueRef.current.length >= MAX_QUEUE) {
      // Drop the oldest queued (not the live one) to keep latency reasonable.
      queueRef.current.shift()
    }
    queueRef.current.push(highlight)

    // If nothing is currently playing, start immediately.
    setCurrent(c => {
      if (c) return c
      const next = queueRef.current.shift()
      if (!next) return null
      const ms = DURATION_MS[next.kind] ?? 2500
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => setCurrent(null), ms)
      return next
    })
  }, [])

  // Manual dismiss — used by tap-to-skip on the overlay.
  const dismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
    setCurrent(null)
  }, [])

  // Cleanup on unmount.
  useEffect(() => () => clearTimeout(dismissTimerRef.current), [])

  return { current, pushHighlight, dismiss, reducedMotion }
}

/**
 * `prefers-reduced-motion` reactive hook.
 * Returns `true` when the user has reduced-motion enabled at the OS level.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)            // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return reduced
}

// ---------- Helpers callers use to build highlight payloads --------------

/**
 * Build a highlight payload from a revealed event, or return null if the
 * event is not highlight-worthy (only goals + red cards qualify today).
 *
 * `scoringPlayerIds` is a Set of playerIds currently in the user's drafted
 * squad — used to decide whether to flag this as "for your squad" so the
 * overlay can paint Bundesliga-red.
 */
export function buildHighlightFromEvent(event, opts = {}) {
  if (!event) return null
  const userPlayerIds = opts.userPlayerIds instanceof Set ? opts.userPlayerIds : new Set()

  if (event.eventType === 'goal') {
    const scorerId = event.scoringPlayerId
    return {
      id:           `${event.eventId}:goal`,
      kind:         'goal',
      title:        event.isPenalty ? 'PENALTY' : 'GOAL',
      playerName:   event.scoringDisplay || event.scoringPlayerDisplay || 'Unknown',
      gameTime:     event.gameTime || '',
      score:        event.currentResult || '',
      forYourSquad: scorerId ? userPlayerIds.has(scorerId) : false,
    }
  }

  if (event.eventType === 'card' && (event.cardColor || '').toLowerCase() === 'red') {
    return {
      id:           `${event.eventId}:red`,
      kind:         'redCard',
      title:        'RED CARD',
      playerName:   event.playerDisplay || 'Unknown',
      gameTime:     event.gameTime || '',
    }
  }

  return null
}
