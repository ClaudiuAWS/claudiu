/**
 * badgesUnseen — tracks which earned badges the user hasn't tapped yet.
 *
 * The BadgesPage renders an animated glow on every earned-but-unseen
 * badge to draw the eye. As soon as the user taps the badge and the
 * preview modal opens, the badge is marked seen and the glow fades
 * permanently. State lives in localStorage (per device), so a fresh
 * device starts with everything unseen — that's intentional: it's a
 * one-time "look what you have" tour.
 *
 * Storage layout: a JSON array of badge IDs the user has already
 * inspected. Anything earned that isn't in this array is "unseen".
 */

const STORAGE_KEY = 'brezn.badges.seen.v1'

function _read() {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function _write(set) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    // Quota / privacy mode — silent.
  }
}

/** Returns a Set of all badge IDs the user has already tapped. */
export function getSeenSet() {
  return _read()
}

/** Mark a single badge as seen (idempotent). */
export function markSeen(badgeId) {
  if (!badgeId) return
  const s = _read()
  if (s.has(badgeId)) return
  s.add(badgeId)
  _write(s)
}
