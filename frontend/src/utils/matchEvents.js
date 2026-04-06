/**
 * Parse match clock strings for sorting.
 * Supports "MM:SS" and legacy "23'" minute-only format.
 */
export function gameTimeToSeconds(gameTime) {
  if (gameTime == null || typeof gameTime !== 'string') return -1

  const trimmed = gameTime.trim()
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

/**
 * Stable chronological order (earliest kickoff-first).
 */
export function sortMatchEventsChronologically(events) {
  if (!events?.length) return []

  return [...events].sort((a, b) => {
    const sa = gameTimeToSeconds(a.gameTime)
    const sb = gameTimeToSeconds(b.gameTime)
    if (sa >= 0 && sb >= 0 && sa !== sb) {
      return sa - sb
    }
    if (sa >= 0 && sb < 0) return -1
    if (sb >= 0 && sa < 0) return 1
    return String(a.eventId ?? '').localeCompare(String(b.eventId ?? ''))
  })
}
