import { useCallback, useEffect, useRef, useState } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { runSoloBot, computeScoreDeltas } from '../utils/minigameBot'

/**
 * Mini-game lifecycle on the client.
 *
 * State machine:
 *   idle → active (on `minigame_start`) → resolved (after submit + result)
 *                                       → expired  (no submission in time)
 *
 * - Modal opens when `state.status === 'active'`.
 * - User taps the in-game UI → `submit(payload)` is called → frontend computes
 *   per-user score deltas locally (including bot if solo) → POSTs to
 *   `/rooms/{code}/minigame-score` so the leaderboard syncs across users.
 * - Backend echoes a `minigame_result` WS message with the consolidated
 *   deltas so all room members see the same outcome panel.
 *
 * Server-authoritative scoring is intentionally deferred — for v1, anyone in
 * the room can resolve the game; the backend only sums the deltas and clamps
 * to ±200. Backend will own scoring in a follow-up plan along with the
 * `claudiu-minigames` DDB table.
 */
// Trigger map: which event types open which mini-games. Frontend-driven so
// the modal pops the instant the event reveals in the feed (no backend
// dispatch jitter). When the AI Match Director (Step 2 of the plan) is
// online, its WS push overrides this with personalized title/prompt.
const TRIGGER_MAP = {
  offside: 'OFFSIDE_REFLEX',
  // future: penalty → 'PENALTY_SHOOTOUT', shot → 'SHOT_CALL', etc.
}

const GAME_DEFAULTS = {
  OFFSIDE_REFLEX: {
    title: 'Offside Reflex',
    durationMs: 8000,
    config: { offsideMomentMs: 4000 },
    prompt: (ev) => ev.playerDisplay
      ? `${ev.playerDisplay} caught offside — tap when they cross the line.`
      : 'Tap when the attacker crosses the offside line.',
  },
}

// Scope the storage key by match.startedAt so resetting the match (which
// gives it a fresh startedAt on next start) gives a clean slate for testing.
// Without this, you'd have to clear localStorage manually between dev runs.
function _firedTypesKey(matchId, startedAt) {
  return `minigame_fired_${matchId}_${startedAt || 'idle'}`
}

function _readFiredTypes(matchId, startedAt) {
  if (!matchId) return []
  try {
    const s = localStorage.getItem(_firedTypesKey(matchId, startedAt))
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function _writeFiredTypes(matchId, startedAt, types) {
  if (!matchId) return
  try { localStorage.setItem(_firedTypesKey(matchId, startedAt), JSON.stringify(types)) } catch {}
}

function _computeOwnership(event, members) {
  const playerId = event.playerId || event.scoringPlayerId || event.goalKeeperId
  if (!playerId || !members?.length) return {}
  const ownerMember = members.find(m =>
    (m.teamSelectionDetails || []).some(p => p.playerId === playerId)
  )
  return {
    playerId,
    advantagedUserId: ownerMember?.userId,
    advantagedDisplayName: ownerMember?.displayName,
  }
}

export function useMiniGame(room, currentUserId, events, matchId, matchStartedAt) {
  const [state, setState] = useState(null)
  const submittedRef = useRef(false)
  const resolvedRef = useRef(false)
  const expireTimerRef = useRef(null)
  const userPayloadRef = useRef(null)

  // Reset per-game refs when a new game starts.
  useEffect(() => {
    if (state?.status === 'active') {
      submittedRef.current = false
      resolvedRef.current = false
      userPayloadRef.current = null
    }
  }, [state?.gameId])

  // Pending → active: flip when the related event becomes visible in the
  // reveal-on-clock feed, re-anchoring startedAtMs to the moment of reveal so
  // the user gets the full duration to react.
  useEffect(() => {
    if (state?.status !== 'pending' || !state.relatedEventId) return
    const visible = (events || []).some(e => e.eventId === state.relatedEventId)
    if (!visible) return
    setState(s => s && s.status === 'pending'
      ? { ...s, status: 'active', startedAtMs: Date.now() }
      : s)
  }, [events, state?.status, state?.relatedEventId])

  // Frontend-driven trigger: when a qualifying event becomes visible in the
  // feed, open the modal locally — no waiting on backend. Idempotent across
  // refresh via localStorage. Backend's `_trigger_minigame_for_event` push is
  // ignored (see onMinigameMessage) when local state already exists, so it
  // becomes a fallback for cases where the frontend missed the event entirely.
  useEffect(() => {
    if (!matchId || !events?.length || state) return
    const firedTypes = _readFiredTypes(matchId, matchStartedAt)
    for (const ev of events) {
      const gameType = TRIGGER_MAP[ev.eventType]
      if (!gameType) continue
      if (firedTypes.includes(gameType)) continue
      const defaults = GAME_DEFAULTS[gameType]
      if (!defaults) continue
      // Mark fired BEFORE setting state so a quick re-render can't double-fire.
      _writeFiredTypes(matchId, matchStartedAt, [...firedTypes, gameType])
      setState({
        gameId:           `${matchId}#${ev.eventId}`,
        gameType,
        title:            defaults.title,
        prompt:           defaults.prompt(ev),
        config:           { ...defaults.config, durationMs: defaults.durationMs },
        startedAtMs:      Date.now(),
        durationMs:       defaults.durationMs,
        ownershipContext: _computeOwnership(ev, room?.members),
        relatedEventId:   ev.eventId,
        status:           'active',
      })
      break  // one game at a time
    }
  }, [events, state, matchId, matchStartedAt, room?.members])

  // Auto-expire timer: when no one submits before durationMs, post empty
  // deltas so the modal closes and the room moves on.
  useEffect(() => {
    if (state?.status !== 'active' || !state?.startedAtMs || !state?.durationMs) return
    const remaining = Math.max(0, state.startedAtMs + state.durationMs - Date.now())
    expireTimerRef.current = setTimeout(() => {
      if (!submittedRef.current && !resolvedRef.current) {
        // Force-resolve with whatever we have. Bot may have submitted; user
        // didn't. Compute deltas with userPayload=null.
        _resolve(null)
      }
    }, remaining + 200)  // small buffer
    return () => clearTimeout(expireTimerRef.current)
  }, [state?.gameId, state?.status])

  // Solo-mode bot: when only one human is in the room, the bot generates a
  // synthetic submission. We don't post the bot's submission separately; the
  // bot's tap time feeds into the same `_resolve` call so deltas include it.
  const botRef = useRef(null)
  useEffect(() => {
    if (state?.status !== 'active' || !room) return
    const isSolo = (room.members || []).length <= 1
    if (!isSolo) return
    botRef.current = runSoloBot(state, (botPayload) => {
      // Stash on state so resolve sees it; if user has already submitted,
      // resolve now with both sides.
      setState(s => s ? { ...s, _botPayload: botPayload } : s)
      if (submittedRef.current && !resolvedRef.current) {
        _resolveBoth(userPayloadRef.current, botPayload)
      }
    })
    return () => botRef.current?.cancel?.()
  }, [state?.gameId, state?.status, room?.members?.length])

  const _resolveBoth = useCallback((userPayload, botPayload) => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    const deltas = computeScoreDeltas({
      gameType:   state.gameType,
      config:     state.config,
      ownership:  state.ownershipContext,
      userId:     currentUserId,
      userPayload,
      botPayload,
      members:    room?.members || [],
    })
    if (room?.roomCode) {
      roomsApi.postMinigameScore(room.roomCode, {
        gameId:   state.gameId,
        gameType: state.gameType,
        deltas,
        result:   { userPayload, botPayload },
      }).catch(err => logger.warn('useMiniGame', 'postMinigameScore failed', err))
    }
  }, [state, currentUserId, room?.roomCode, room?.members])

  const _resolve = useCallback((userPayload) => {
    // Two cases: bot already submitted (we have _botPayload) → resolve now.
    // Otherwise wait for bot (or expire timer falls through with empty deltas).
    const botPayload = state?._botPayload ?? null
    if (botPayload || (room?.members || []).length > 1 || resolvedRef.current) {
      _resolveBoth(userPayload, botPayload)
    } else {
      // Solo, bot hasn't fired yet. Stash user's payload; bot effect will
      // resolve when its setTimeout fires.
      userPayloadRef.current = userPayload
    }
  }, [state, room?.members?.length, _resolveBoth])

  const submit = useCallback((payload) => {
    if (submittedRef.current) return
    submittedRef.current = true
    userPayloadRef.current = payload
    _resolve(payload)
  }, [_resolve])

  // Handle WS messages forwarded by useRoom.
  const onMinigameMessage = useCallback((msg) => {
    if (msg.type === 'minigame_start') {
      // Frontend-driven trigger now opens the modal locally on event reveal.
      // Backend's push only wins as a fallback when the frontend hadn't fired
      // (e.g. user joined the room mid-event). If we already have local state,
      // ignore — frontend beat backend, no need to clobber the active game.
      setState(prev => {
        if (prev) return prev
        // Mark fired so the trigger effect doesn't double-fire after this.
        if (matchId && msg.gameType) {
          const fired = _readFiredTypes(matchId, matchStartedAt)
          if (!fired.includes(msg.gameType)) _writeFiredTypes(matchId, matchStartedAt, [...fired, msg.gameType])
        }
        return {
          gameId:           msg.gameId,
          gameType:         msg.gameType,
          title:            msg.title,
          prompt:           msg.prompt,
          config:           msg.config,
          startedAtMs:      null,
          durationMs:       msg.durationMs ?? 8000,
          ownershipContext: msg.ownershipContext || {},
          relatedEventId:   msg.relatedEventId,
          status:           msg.relatedEventId ? 'pending' : 'active',
        }
      })
    } else if (msg.type === 'minigame_result') {
      setState(s => s && s.gameId === msg.gameId ? {
        ...s,
        status:  'resolved',
        result:  msg.result,
        deltas:  msg.deltas,
      } : s)
      // Auto-dismiss after a few seconds so the user can see the points.
      setTimeout(() => setState(s => s && s.gameId === msg.gameId ? null : s), 3500)
    } else if (msg.type === 'minigame_expired') {
      setState(s => s && s.gameId === msg.gameId ? { ...s, status: 'expired' } : s)
      setTimeout(() => setState(s => s && s.gameId === msg.gameId ? null : s), 2000)
    }
  }, [matchId, matchStartedAt])

  const close = useCallback(() => setState(null), [])

  return { state, submit, close, onMinigameMessage }
}
