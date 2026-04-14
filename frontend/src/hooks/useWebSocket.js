import { useEffect, useRef } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

const WS_URL = import.meta.env.VITE_WS_URL

// Reconnect after 2s, backing off to a max of 30s
const INITIAL_RETRY_MS = 2000
const MAX_RETRY_MS = 30000

export function useWebSocket(channel, onMessage) {
  const wsRef = useRef(null)
  const retryMs = useRef(INITIAL_RETRY_MS)
  const retryTimer = useRef(null)
  const unmounted = useRef(false)

  useEffect(() => {
    if (!channel) return
    unmounted.current = false

    async function connect() {
      // WebSocket doesn't support Authorization headers, so we pass the
      // Cognito token as a query param. The ws-handler currently doesn't
      // validate it (acceptable for a hackathon), but the param is there
      // so you can add validation later without changing the client.
      let token = ''
      try {
        const session = await fetchAuthSession()
        token = session.tokens?.idToken?.toString() ?? ''
      } catch (_) {}

      const url = `${WS_URL}?channel=${encodeURIComponent(channel)}&token=${token}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        retryMs.current = INITIAL_RETRY_MS
      }

      ws.onmessage = (e) => {
        try {
          onMessage(JSON.parse(e.data))
        } catch (_) {}
      }

      ws.onclose = () => {
        if (unmounted.current) return
        retryTimer.current = setTimeout(() => {
          retryMs.current = Math.min(retryMs.current * 2, MAX_RETRY_MS)
          connect()
        }, retryMs.current)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      unmounted.current = true
      clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [channel]) // onMessage intentionally excluded — see note below
}

// Note: onMessage is excluded from the dependency array because it's
// typically an inline function that changes every render. The ref-based
// pattern would be the alternative, but for this use case the channel
// identity is the meaningful dependency — if the channel changes we
// reconnect, which is correct.
