const isDev = import.meta.env.DEV

const levels = {
  info: '🔵',
  success: '🟢',
  warn: '🟡',
  error: '🔴',
}

function log(level, context, message, data = null) {
  if (!isDev) return

  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
  const prefix = `${levels[level]} [${timestamp}] [${context}]`

  if (data) {
    console.groupCollapsed(`${prefix} ${message}`)
    console.log(data)
    console.groupEnd()
  } else {
    console.log(`${prefix} ${message}`)
  }
}

export const logger = {
  info: (context, message, data) => log('info', context, message, data),
  success: (context, message, data) => log('success', context, message, data),
  warn: (context, message, data) => log('warn', context, message, data),
  error: (context, message, data) => log('error', context, message, data),
}