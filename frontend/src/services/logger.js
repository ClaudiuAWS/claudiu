import { fetchAuthSession } from 'aws-amplify/auth'

const isDev = import.meta.env.DEV
const API_URL = import.meta.env.VITE_API_URL

const icons = { info: '🔵', success: '🟢', warn: '🟡', error: '🔴' }

// --- CloudWatch batching ---
let buffer = []
let flushTimer = null

const flush = async () => {
  if (!buffer.length) return
  const events = buffer.splice(0)

  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()

    await fetch(`${API_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ logs: events }),
    })
  } catch (e) {
    console.warn('[logger] flush failed', e)
  }
}

const scheduleFlush = () => {
  if (flushTimer) return
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

  buffer.push({ timestamp: Date.now(), level, context, message, ...(data && { data }) })
  scheduleFlush()
}

export const logger = {
  info:    (context, message, data) => log('info',    context, message, data),
  success: (context, message, data) => log('success', context, message, data),
  warn:    (context, message, data) => log('warn',    context, message, data),
  error:   (context, message, data) => log('error',   context, message, data),
}
