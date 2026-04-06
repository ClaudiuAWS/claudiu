function coerceGameTime(gameTime) {
  if (gameTime == null) return null
  if (typeof gameTime === 'string') return gameTime.trim()
  return String(gameTime).trim()
}

/**
 * Parse match clock strings for sorting.
 * Supports "MM:SS" and legacy "23'" minute-only format.
 */
export function gameTimeToSeconds(gameTime) {
  const trimmed = coerceGameTime(gameTime)
  if (!trimmed) return -1
  const mmss = trimmed.match(/^(\d+):(\d{1,2})$/)
  if (mmss) {
    return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10)
  }

  const legacy = trimmed.match(/^(\d+)'$/)
  if (legacy) {
    return parseInt(legacy[1], 10) * 60
  }

  return -1
}

/** Latest known match-clock second among fired events (feed is ahead of match.currentMinute while polls race). */
export function maxEventGameSeconds(events) {
  if (!events?.length) return -1
  let max = -1
  for (const e of events) {
    const s = gameTimeToSeconds(e.gameTime)
    if (s > max) max = s
  }
  return max
}

function clockSortKey(event) {
  const sec = gameTimeToSeconds(event.gameTime)
  if (sec >= 0) return sec
  if (event.eventTime) {
    const t = Date.parse(String(event.eventTime))
    if (!Number.isNaN(t)) return t / 1000
  }
  return Number.MAX_SAFE_INTEGER
}

function feedTimeKey(event) {
  if (event.eventTime) {
    const t = Date.parse(String(event.eventTime))
    if (!Number.isNaN(t)) return t
  }
  return NaN
}

/**
 * Match-clock order (gameTime), then XML event time for same-minute events.
 */
export function sortMatchEventsChronologically(events) {
  if (!events?.length) return []

  return [...events].sort((a, b) => {
    const ka = clockSortKey(a)
    const kb = clockSortKey(b)
    if (ka !== kb) return ka - kb
    const ta = feedTimeKey(a)
    const tb = feedTimeKey(b)
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
      return ta - tb
    }
    if (!Number.isNaN(ta) && Number.isNaN(tb)) return -1
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1
    return String(a.eventId ?? '').localeCompare(String(b.eventId ?? ''))
  })
}

/** Newest / latest match-clock events first (for the live feed list). */
export function sortMatchEventsNewestFirst(events) {
  if (!events?.length) return []
  return [...sortMatchEventsChronologically(events)].reverse()
}
