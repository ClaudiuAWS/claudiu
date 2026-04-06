import { useState, useEffect, useRef } from 'react'

function parseMmSs(s) {
  if (s == null) return 0
  const str = typeof s === 'string' ? s.trim() : String(s).trim()
  const m = str.match(/^(\d+):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function formatMmSs(totalSeconds) {
  const t = Math.max(0, totalSeconds)
  const mm = Math.floor(t / 60)
  const ss = t % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

/**
 * Smooth match clock: advances 1 game-second per real second while LIVE.
 * Pauses during HALF TIME and FULL TIME (no random jumps from server ticks).
 * When the API updates currentMinute, we never move backwards.
 */
export function useMatchClock(match) {
  const [display, setDisplay] = useState('0:00')
  const lastServerMinuteRef = useRef('')

  useEffect(() => {
    lastServerMinuteRef.current = ''
  }, [match?.matchId])

  useEffect(() => {
    if (!match?.currentMinute) return
    const srv = String(match.currentMinute).trim()
    if (srv !== lastServerMinuteRef.current) {
      lastServerMinuteRef.current = srv
      setDisplay(srv)
    }
  }, [match?.currentMinute, match?.status])

  useEffect(() => {
    if (!match) return
    if (match.status !== 'live') return

    const id = setInterval(() => {
      setDisplay((prev) => formatMmSs(parseMmSs(prev) + 1))
    }, 1000)

    return () => clearInterval(id)
  }, [match?.status, match?.matchId])

  return display
}
