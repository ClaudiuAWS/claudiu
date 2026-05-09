import { useEffect, useRef } from 'react'
import { roomsApi } from '../services/api'
import { logger } from './../services/logger'

/**
 * AI Match Director frontend ticker.
 *
 * Posts a state snapshot to /rooms/{code}/director-tick every time a new
 * event reveals in the feed. Only the host client ticks (room.hostUserId ===
 * currentUserId) — non-host tabs would just multiply Bedrock cost for no gain
 * since the result fans out via WS to everyone anyway.
 *
 * The Director Lambda decides between three actions: start_minigame,
 * commentate, wait. Whatever it returns is broadcast over the room WS;
 * useRoom + useMiniGame already handle the resulting messages
 * (commentary_update, minigame_start). This hook is fire-and-forget — the
 * actions render themselves.
 *
 * Cost guardrails:
 * - Hard cap of 30 ticks per match (refresh resets the counter, but
 *   sessionStorage scoping means the same tab keeps its count).
 * - Skip events without an eventId or types we never want to commentate on.
 * - Errors are logged via logger.warn and never surfaced — if Bedrock is
 *   down, mini-games still fire via the rule-based trigger map in useMiniGame.
 */

const MAX_TICKS_PER_MATCH = 30

// Event types the Director shouldn't bother with — they're feed-internal
// boundary markers, not interesting moments.
const SKIP_EVENT_TYPES = new Set([
  'secondhalf',  // boundary marker; halftime row already conveys the break
  'fulltime',    // match-end marker, no commentary needed
])

export function useDirector(room, events, currentUserId, match) {
  const tickCountRef = useRef(0)
  const lastEventIdRef = useRef(null)

  const hostUserId = room?.hostUserId
  const isHost = !!currentUserId && currentUserId === hostUserId

  useEffect(() => {
    if (!isHost || !room?.roomCode || !events?.length) return
    if (tickCountRef.current >= MAX_TICKS_PER_MATCH) return

    const latest = events[events.length - 1]
    if (!latest?.eventId) return
    if (latest.eventId === lastEventIdRef.current) return  // already ticked
    if (SKIP_EVENT_TYPES.has(latest.eventType)) {
      lastEventIdRef.current = latest.eventId
      return
    }

    lastEventIdRef.current = latest.eventId
    tickCountRef.current += 1

    const snapshot = {
      triggerEvent: {
        eventId:       latest.eventId,
        eventType:     latest.eventType,
        playerName:    latest.playerName || latest.playerDisplay || null,
        playerDisplay: latest.playerDisplay || null,
        gameTime:      latest.gameTime || null,
      },
      score:    `${match?.homeScore ?? 0}:${match?.awayScore ?? 0}`,
      minute:   match?.currentMinute ?? null,
      recentEvents: events.slice(-5).map(e => ({
        type:   e.eventType,
        player: e.playerDisplay || e.playerName || null,
      })),
      members: (room.members || []).map(m => ({
        userId:         m.userId,
        displayName:    m.displayName,
        ownedPlayerIds: (m.teamSelectionDetails || []).map(p => p.playerId),
      })),
      minigamesFired:           Array.isArray(room.triggeredMinigames) ? room.triggeredMinigames : [],
      minutesSinceLastMinigame: 99,  // not tracked in current room state — Lambda treats as 'fresh'
    }

    roomsApi.directorTick(room.roomCode, snapshot)
      .then(res => logger.success('useDirector', 'tick', { decision: res?.decision, count: tickCountRef.current }))
      .catch(err => logger.warn('useDirector', 'tick failed', err))

    // No cleanup needed — the POST is fire-and-forget.
  }, [
    isHost,
    room?.roomCode,
    events?.length && events[events.length - 1]?.eventId,
    match?.homeScore,
    match?.awayScore,
  ])
}
