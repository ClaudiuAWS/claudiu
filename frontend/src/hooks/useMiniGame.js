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
export function useMiniGame(room, currentUserId) {
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
      setState({
        gameId:           msg.gameId,
        gameType:         msg.gameType,
        title:            msg.title,
        prompt:           msg.prompt,
        config:           msg.config,
        startedAtMs:      msg.startedAtMs ?? Date.now(),
        durationMs:       msg.durationMs ?? 8000,
        ownershipContext: msg.ownershipContext || {},
        status:           'active',
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
  }, [])

  const close = useCallback(() => setState(null), [])

  return { state, submit, close, onMinigameMessage }
}
