import { fetchAuthSession } from 'aws-amplify/auth'

const isDev = import.meta.env.DEV
const API_URL = import.meta.env.VITE_API_URL

const icons = { info: '🔵', success: '🟢', warn: '🟡', error: '🔴' }

// --- CloudWatch batching ---
let buffer = []
let flushTimer = null

// Circuit breaker for the /logs endpoint. The endpoint was originally added in
// commit 840a52dd but is missing from the currently deployed API Gateway stack,
// so every POST returns a CORS preflight failure. Without a breaker the page
// re-tries every 3 seconds for the entire session, flooding the DevTools
// console with hundreds of `flush failed` lines per minute (visible in the
// user's halftime-quiz screenshot). Three consecutive failures permanently
// disables flushing for this tab — buffer entries silently drop on the floor.
// Resets to zero on any successful POST so an outage recovery brings logging
// back without a refresh.
let consecutiveFailures = 0
let flushDisabled = false
const MAX_CONSECUTIVE_FAILURES = 3

const flush = async () => {
  if (flushDisabled || !buffer.length) return
  const events = buffer.splice(0)

  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()

    await fetch(`${API_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ logs: events }),
    })
    // Success — reset the breaker. If the endpoint goes down and recovers
    // within the session, logging keeps working without a page reload.
    consecutiveFailures = 0
  } catch (e) {
    consecutiveFailures += 1
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      flushDisabled = true
      // eslint-disable-next-line no-console
      console.warn(
        `[logger] disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive flush failures ` +
        `(endpoint unreachable / CORS). Further logs drop silently until reload.`
      )
    } else {
      console.warn('[logger] flush failed', e)
    }
  }
}

const scheduleFlush = () => {
  // Skip scheduling once the breaker has tripped — every queued flush would
  // immediately bail at the `flushDisabled` check anyway, but not creating
  // the timer avoids a stale setTimeout sitting on the event loop forever.
  if (flushDisabled || flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; flush() }, 3000)
}

window.addEventListener('beforeunload', flush)

// --- Core ---
function log(level, context, message, data = null) {
  const timestamp = new Date().toISOString()

  if (isDev) {
    const prefix = `${icons[level]} [${timestamp.split('T')[1].slice(0, 12)}] [${context}]`
    if (data) {
      console.groupCollapsed(`${prefix} ${message}`)
      console.log(data)
      console.groupEnd()
    } else {
      console.log(`${prefix} ${message}`)
    }
    return
  }

  // Drop new entries on the floor once the breaker has tripped — no point
  // letting the buffer grow unbounded across a long live-match session.
  if (flushDisabled) return
  buffer.push({ timestamp: Date.now(), level, context, message, ...(data && { data }) })
  scheduleFlush()
}

export const logger = {
  info:    (context, message, data) => log('info',    context, message, data),
  success: (context, message, data) => log('success', context, message, data),
  warn:    (context, message, data) => log('warn',    context, message, data),
  error:   (context, message, data) => log('error',   context, message, data),
}
