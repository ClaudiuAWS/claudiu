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
  // Track whether we've already snapped the anchor at second-half kickoff.
  // During the 3-wall-minute halftime break, wall-time interpolation drags
  // the anchor forward (cap hides this from display). When sh reveals,
  // the rewind-rejection in the match.currentMinute effect would refuse to
  // reset the anchor back to sh's gameTime, leaving the clock reading
  // 45+breakDrift. This ref triggers a one-time hard snap that overrides
  // the rewind guard.
  const sh2hSnappedRef = useRef(false)

  useEffect(() => {
    lastServerMinuteRef.current = ''
    lastAcceptedServerSecRef.current = -1
    // Anchor the clock on the SERVER's match.startedAt — NOT Date.now() at
    // mount. Both anchors share the same gameSec=0 origin, but using the
    // server timestamp keeps host + guest in lockstep no matter how late
    // either mounts. Without this, a guest who navigates to the match
    // ~1-2 wall-seconds after the host (WS broadcast delay + route
    // transition) would render their clock anchored to their own
    // mount-time and read ~5-10 game-seconds (at 5× speed) BEHIND the
    // host for the rest of the match. Fall back to Date.now() if
    // startedAt isn't on the match record yet — the upcoming clock just
    // ticks from "now" until the real anchor lands via a match_update.
    const startMs = match?.startedAt
      ? new Date(match.startedAt).getTime()
      : Date.now()
    anchorRef.current = { gameSec: 0, wallMs: startMs }
    sh2hSnappedRef.current = false
  }, [match?.matchId, match?.startedAt])

  // One-shot: when secondhalf first becomes visible in the events list,
  // force the anchor back to its gameTime and restart wall extrapolation.
  // Without this, the clock displays 60'+ after the 15-game-min halftime
  // break drained into local interpolation. See note on sh2hSnappedRef.
  useEffect(() => {
    if (sh2hSnappedRef.current) return
    const sh = (events ?? []).find(e => e.eventType === 'secondhalf')
    if (!sh) return
    const shSec = gameTimeToSeconds(sh.gameTime)
    if (shSec < 0) return
    sh2hSnappedRef.current = true
    anchorRef.current = { gameSec: shSec, wallMs: Date.now() }
    lastAcceptedServerSecRef.current = shSec
    const ht = (events ?? []).find(e => e.eventType === 'halftime')
    const htSec = ht ? gameTimeToSeconds(ht.gameTime) : -1
    setDisplay(formatFootballClock(shSec, htSec))
  }, [events])

  // True 'live' phases: 1H (status='live' before halftime fires) and 2H. Detect
  // 2H from the events list rather than match.status alone — the WS reorder
  // race occasionally lets a stale 'halftime' snapshot win after secondhalf
  // has fired, leaving match.status='halftime' for the rest of the match.
  // The rewind guards below and the tick loop further down both rely on this:
  // we want forward-only snaps any time the user is *visibly* in a live phase,
  // even if the snapshot disagrees.
  const evs = events ?? []
  const hasSecondHalf = evs.some(e => e.eventType === 'secondhalf')
  const hasFullTime   = evs.some(e => e.eventType === 'fulltime')
  const inLivePhase   = match?.status === 'live' || (hasSecondHalf && !hasFullTime)

  useEffect(() => {
    if (!match?.currentMinute) return
    const srv = String(match.currentMinute).trim()
    if (srv === lastServerMinuteRef.current) return
    lastServerMinuteRef.current = srv
    const raw = gameTimeToSeconds(srv)
    const gs = raw >= 0 ? raw : 0
    // Reject out-of-order writes that go backward vs the last accepted server value.
    if (
      inLivePhase &&
      lastAcceptedServerSecRef.current >= 0 &&
      gs < lastAcceptedServerSecRef.current
    ) {
      return
    }
    lastAcceptedServerSecRef.current = gs
    // Don't rewind the visible clock past where the local extrapolation has reached.
    // Out-of-order events (e.g. an 8' goal landing while the client is showing 10:00
    // due to speedMultiplier-driven extrapolation) push currentMinute backward from
    // the *displayed* value even though it's a valid forward step from the server's
    // last-known state. Keep ticking forward from the existing anchor; the new event's
    // gameTime is metadata for the badge, not a clock reset. Boundary status
    // transitions (halftime/fulltime) bypass this — those are authoritative snaps.
    if (inLivePhase) {
      const speed = parseReplaySpeed(match)
      const local = anchorRef.current.gameSec +
        ((Date.now() - anchorRef.current.wallMs) / 1000) * speed
      if (gs < local) return
    }
    anchorRef.current = { gameSec: gs, wallMs: Date.now() }
    const ht = (eventsRef.current ?? []).find(e => e.eventType === 'halftime')
    const htSec = ht ? gameTimeToSeconds(ht.gameTime) : -1
    setDisplay(formatFootballClock(gs, htSec))
  }, [match?.currentMinute, match?.status, match?.speedMultiplier, inLivePhase])

  useEffect(() => {
    if (!match) return
    if (!inLivePhase) return

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
  }, [match?.matchId, match?.speedMultiplier, inLivePhase])

  return display
}
