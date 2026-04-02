import { useEffect, useRef, useCallback } from 'react'
import { logger } from '../services/logger'

const WS_URL = import.meta.env.VITE_WS_URL

export function useWebSocket({ roomCode, matchId, userId, displayName, onMessage }) {
  const ws = useRef(null)
  const reconnectTimer = useRef(null)
  const shouldReconnect = useRef(true)

  const connect = useCallback(() => {
        logger.info('WebSocket', 'Connect called', { roomCode, userId, matchId })
  if (!roomCode || !userId || !matchId) {
    logger.warn('WebSocket', 'Missing params, skipping connect', { roomCode, userId, matchId })
    return
  }
    if (ws.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}?roomCode=${roomCode}&userId=${userId}&matchId=${matchId}&displayName=${encodeURIComponent(displayName)}`

    logger.info('WebSocket', 'Connecting', { roomCode, userId })
    ws.current = new WebSocket(url)

    ws.current.onopen = () => {
      logger.success('WebSocket', 'Connected')
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        logger.info('WebSocket', 'Message received', message)
        onMessage?.(message)
      } catch (err) {
        logger.error('WebSocket', 'Failed to parse message', err)
      }
    }

    ws.current.onclose = (event) => {
      logger.warn('WebSocket', 'Disconnected', { code: event.code })
      if (shouldReconnect.current) {
        logger.info('WebSocket', 'Reconnecting in 3s')
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    ws.current.onerror = (err) => {
      logger.error('WebSocket', 'Error', err)
    }
  }, [roomCode, userId, matchId, displayName, onMessage])

  useEffect(() => {
    shouldReconnect.current = true
    connect()

    return () => {
      shouldReconnect.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (ws.current) {
        ws.current.close()
        ws.current = null
      }
    }
  }, [connect])

  const send = useCallback((action, data = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action, ...data }))
      logger.info('WebSocket', 'Message sent', { action, ...data })
    } else {
      logger.warn('WebSocket', 'Cannot send, not connected')
    }
  }, [])

  return { send }
}