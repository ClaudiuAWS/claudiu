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
  const mmss = trimmed.match(/^(\d+):(\d{2})$/)
  if (mmss) {
    return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10)
  }

  const legacy = trimmed.match(/^(\d+)'$/)
  if (legacy) {
    return parseInt(legacy[1], 10) * 60
  }

  return -1
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

/**
 * Stable chronological order (earliest kickoff-first).
 */
export function sortMatchEventsChronologically(events) {
  if (!events?.length) return []

  return [...events].sort((a, b) => {
    const ka = clockSortKey(a)
    const kb = clockSortKey(b)
    if (ka !== kb) return ka - kb
    return String(a.eventId ?? '').localeCompare(String(b.eventId ?? ''))
  })
}
