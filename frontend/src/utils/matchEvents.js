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
  if (typeof gameTime === 'number' && Number.isFinite(gameTime)) {
    const n = Math.floor(gameTime)
    if (n >= 0 && n <= 150 * 60) return n
  }
  const trimmed = coerceGameTime(gameTime)
  if (!trimmed) return -1
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    if (n >= 0 && n <= 150 * 60) return n
  }
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

/**
 * Format stored game-time clock (MM:SS) as football display time.
 *   storedSec   — seconds from the event's gameTime
 *   htStoredSec — seconds of the halftime event clock (-1 = still first half / unknown)
 *
 * First half:  storedSec > 45*60 → "45+N'"  else "M'"
 * Second half: footballMin = 45 + (storedSec - htStoredSec)/60
 *              footballMin > 90 → "90+N'"  else "M'"
 */
export function formatFootballTime(storedSec, htStoredSec = -1) {
  if (storedSec < 0) return ''

  // Treat as first-half whenever halftime is unknown OR this event happened
  // before the halftime boundary. Without the per-event check, every old
  // first-half row re-renders with the second-half formula once halftime
  // fires (e.g. a 0' card flips to "-6'" when htStoredSec = 3060).
  if (htStoredSec < 0 || storedSec <= htStoredSec) {
    const min = Math.floor(storedSec / 60)
    if (min > 45) return `45+${min - 45}'`
    return `${min}'`
  }

  const elapsed = storedSec - htStoredSec
  const footballMin = 45 + Math.floor(elapsed / 60)
  if (footballMin > 90) return `90+${footballMin - 90}'`
  return `${footballMin}'`
}

/** Newest / latest match-clock events first (for the live feed list). */
export function sortMatchEventsNewestFirst(events) {
  if (!events?.length) return []
  return [...events].sort((a, b) => {
    const ka = clockSortKey(a)
    const kb = clockSortKey(b)
    if (ka !== kb) return kb - ka
    const ta = feedTimeKey(a)
    const tb = feedTimeKey(b)
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta
    if (!Number.isNaN(ta) && Number.isNaN(tb)) return 1
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return -1
    return String(b.eventId ?? '').localeCompare(String(a.eventId ?? ''))
  })
}
