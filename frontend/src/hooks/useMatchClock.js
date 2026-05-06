import { useState, useEffect, useRef } from 'react'
import { gameTimeToSeconds, maxEventGameSeconds } from '../utils/matchEvents'

function formatMmSs(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(t / 60)
  const ss = t % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

/**
 * Football-clock formatter. After halftime fires, the 2nd-half clock should
 * resume from 45:00 (the football convention) instead of continuing to climb
 * from wall-clock-from-kickoff (~51:00). Before halftime, raw seconds are fine
 * — the 1st-half clock counts up to 45+N normally.
 */
function formatFootballClock(rawSec, halftimeSec) {
  if (halftimeSec >= 0 && rawSec > halftimeSec) {
    return formatMmSs(45 * 60 + (rawSec - halftimeSec))
  }
  return formatMmSs(rawSec)
}

function parseReplaySpeed(match) {
  if (match?.speedMultiplier == null || match?.speedMultiplier === '') return 1
  const n = parseFloat(String(match.speedMultiplier))
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Live clock: anchor on each new `currentMinute` from the API, then advance
 * using wall time × speedMultiplier (replay runs faster than 1:1 real time).
 * Merges fired events' gameTime so the clock never lags behind the feed when
 * match.currentMinute updates a poll late.
 * Pauses when status is not `live` (half time / full time).
 */
export function useMatchClock(match, events) {
  const [display, setDisplay] = useState('0:00')
  const lastServerMinuteRef = useRef('')
  const lastAcceptedServerSecRef = useRef(-1)
  const anchorRef = useRef({ gameSec: 0, wallMs: 0 })
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    lastServerMinuteRef.current = ''
    lastAcceptedServerSecRef.current = -1
    anchorRef.current = { gameSec: 0, wallMs: Date.now() }
  }, [match?.matchId, match?.startedAt])

  useEffect(() => {
    if (!match?.currentMinute) return
    const srv = String(match.currentMinute).trim()
    if (srv === lastServerMinuteRef.current) return
    const raw = gameTimeToSeconds(srv)
    const gs = raw >= 0 ? raw : 0
    // Reject only when server minute moves backward vs last accepted (out-of-order write).
    // Do not compare to local extrapolation — with speedMultiplier>1 the client can run
    // ahead of discrete server updates until the next poll; that must not block valid snaps.
    if (
      match.status === 'live' &&
      lastAcceptedServerSecRef.current >= 0 &&
      gs < lastAcceptedServerSecRef.current
    ) {
      lastServerMinuteRef.current = srv
      return
    }
    lastServerMinuteRef.current = srv
    lastAcceptedServerSecRef.current = gs
    anchorRef.current = { gameSec: gs, wallMs: Date.now() }
    const ht = (eventsRef.current ?? []).find(e => e.eventType === 'halftime')
    const htSec = ht ? gameTimeToSeconds(ht.gameTime) : -1
    setDisplay(formatFootballClock(gs, htSec))
  }, [match?.currentMinute, match?.status, match?.speedMultiplier])

  useEffect(() => {
    if (!match) return
    if (match.status !== 'live') return

    const speed = parseReplaySpeed(match)

    const tick = () => {
      const { gameSec, wallMs } = anchorRef.current
      let fromServer = gameSec + ((Date.now() - wallMs) / 1000) * speed
      const floor = maxEventGameSeconds(eventsRef.current)
      if (floor >= 0 && floor > fromServer) {
        anchorRef.current = { gameSec: floor, wallMs: Date.now() }
        fromServer = floor
      }
      // Ceiling: never display past the next known boundary's gameTime.
      // If halftime fired but secondhalf hasn't, cap at halftime's stored sec.
      // If we're in the second half, cap at fulltime's stored sec (if known).
      // Boundary events always reach the client right around the cap, then
      // status flips to halftime/fulltime and the interval shuts down.
      const evs = eventsRef.current ?? []
      const ht  = evs.find(e => e.eventType === 'halftime')
      const sh  = evs.find(e => e.eventType === 'secondhalf')
      const ft  = evs.find(e => e.eventType === 'fulltime')
      let cap = -1
      if (ht && !sh) cap = gameTimeToSeconds(ht.gameTime)
      else if (ft)   cap = gameTimeToSeconds(ft.gameTime)
      if (cap >= 0 && fromServer > cap) fromServer = cap
      const htSec = ht ? gameTimeToSeconds(ht.gameTime) : -1
      setDisplay(formatFootballClock(fromServer, htSec))
    }

    const id = setInterval(tick, 250)
    tick()

    return () => clearInterval(id)
  }, [match?.status, match?.matchId, match?.speedMultiplier])

  return display
}
