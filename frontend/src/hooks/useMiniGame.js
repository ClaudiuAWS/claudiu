import { useCallback, useEffect, useRef, useState } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { runSoloBot, computeScoreDeltas } from '../utils/minigameBot'
import { pickFallbackQuestions } from '../utils/quizFallback'

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
  offside:  'OFFSIDE_REFLEX',
  halftime: 'HALFTIME_QUIZ',
  // Penalties don't have their own eventType — the data loader emits
  // them as eventType:'goal' with `isPenalty: true`. See the special
  // case in the trigger effect below.
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
  PENALTY_SHOOTOUT: {
    title: 'Penalty Shootout',
    durationMs: 10000,
    config: {},
    prompt: (ev) => ev.playerDisplay
      ? `${ev.playerDisplay} steps up to take the penalty — pick your corner!`
      : 'Penalty time — pick your corner!',
  },
  HALFTIME_QUIZ: {
    title: 'Halftime Quiz',
    // 15 in-game minutes of halftime break. At default 5× speed that's
    // 180 wall-seconds, comfortable room for 3 × 12s questions + reading
    // time. Hard fail-safe in useMiniGame closes the modal if it sits
    // beyond durationMs + 6s.
    durationMs: 180_000,
    config: { /* questions filled in from AI or fallback at trigger time */ },
    prompt: () => 'Halftime trivia — fastest correct answers win!',
  },
}

// Idempotency keyed by EVENT ID (not gameType) so multiple events of the
// same gameType — e.g. several offsides in a match — can each open their
// own mini-game while a single event still only fires once. Penalty +
// halftime events are inherently single-occurrence so they're naturally
// once-per-match. Storage key bumped to v2 to invalidate stale per-type
// entries from earlier deploys.
function _firedEventsKey(matchId, startedAt) {
  // v2 bump invalidates old per-gameType keys (`minigame_fired_...`) from
  // previous deploys so stale "OFFSIDE_REFLEX already fired" entries don't
  // carry over and silently suppress the second offside on first load.
  return `minigame_fired_v2_${matchId}_${startedAt || 'idle'}`
}

function _readFiredEvents(matchId, startedAt) {
  if (!matchId) return []
  try {
    const s = sessionStorage.getItem(_firedEventsKey(matchId, startedAt))
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function _writeFiredEvents(matchId, startedAt, ids) {
  if (!matchId) return
  try { sessionStorage.setItem(_firedEventsKey(matchId, startedAt), JSON.stringify(ids)) } catch {}
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
  const resultDismissTimerRef = useRef(null)
  const userPayloadRef = useRef(null)
  // Ref to the latest `_resolveBoth`. The WS handler `onMinigameMessage` is
  // cached with [matchId, matchStartedAt] deps and would otherwise capture
  // the initial render's `_resolveBoth` — which closed over state=null. When
  // the microtask fires, that stale function throws on `state.gameType` and
  // the optimistic resolution never runs, leaving both clients on
  // "No points awarded this round" for multi-user penalties.
  const resolveBothRef = useRef(null)
  // Mirrors the latest state. Used by the WS handler (which is cached
  // with [matchId, matchStartedAt] deps and can't safely read `state`
  // from closure) to compute the dismiss deadline based on the live
  // startedAtMs + durationMs.
  const stateRef = useRef(null)

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
  // refresh via sessionStorage. Backend's `_trigger_minigame_for_event` push is
  // ignored (see onMinigameMessage) when local state already exists, so it
  // becomes a fallback for cases where the frontend missed the event entirely.
  useEffect(() => {
    if (!matchId || !events?.length || state) return
    const firedEvents = _readFiredEvents(matchId, matchStartedAt)
    for (const ev of events) {
      let gameType = TRIGGER_MAP[ev.eventType]
      // Penalty events ride on eventType:'goal' with isPenalty:true — the
      // loader doesn't emit a separate type. Detect and map here.
      if (!gameType && ev.eventType === 'goal' && ev.isPenalty === true) {
        gameType = 'PENALTY_SHOOTOUT'
      }
      if (!gameType) continue
      // Per-event idempotency: each event triggers AT MOST ONCE, but
      // different events of the same gameType (e.g. multiple offsides) can
      // each open their own mini-game.
      if (firedEvents.includes(ev.eventId)) continue
      const defaults = GAME_DEFAULTS[gameType]
      if (!defaults) continue
      // Mark fired BEFORE setting state so a quick re-render can't double-fire.
      _writeFiredEvents(matchId, matchStartedAt, [...firedEvents, ev.eventId])
      // Game-type-specific extras the defaults can't compute statically.
      const extraConfig = {}
      if (gameType === 'HALFTIME_QUIZ') {
        // Both users in the room need the SAME 3 questions in the SAME
        // order for parallel play to feel coherent. Seed by matchId +
        // eventId so two clients firing the modal locally compute
        // identical question sets (no need to wait for backend WS).
        extraConfig.questions = pickFallbackQuestions(3, `${matchId}#${ev.eventId}`)
      }
      setState({
        gameId:           `${matchId}#${ev.eventId}`,
        gameType,
        title:            defaults.title,
        prompt:           defaults.prompt(ev),
        config:           { ...defaults.config, ...extraConfig, durationMs: defaults.durationMs },
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
      if (resolvedRef.current) return

      // Multi-user penalty special case: _resolve uses state._botPayload,
      // which is set only by the solo bot — null in multi-user mode. The
      // opponent's pick lands via the announce-only WS broadcast and is
      // stashed in state._opponentPick. Use that so the deltas reflect
      // reality:
      //   shooter committed, keeper didn't  → _localPick=shooter,
      //                                      _opponentPick=null → GOAL
      //   keeper committed, shooter didn't  → _localPick=keeper,
      //                                      _opponentPick=null → no deltas
      //   both committed (rare — should've resolved earlier on WS merge,
      //                   but safety net)   → both populated → real outcome
      //   neither committed                 → both null → empty deltas
      //
      // Previously the shooter's expire timer no-op'd because
      // submittedRef was true (they committed) and the hard fail-safe
      // flipped status to 'resolved' WITHOUT computing deltas, so the
      // banner fell through to MISS / "No one committed" even though
      // the goal should have stood.
      const s = stateRef.current
      const isMultiPenalty =
        s?.gameType === 'PENALTY_SHOOTOUT' && (room?.members || []).length > 1
      if (isMultiPenalty) {
        _resolveBoth(s._localPick || null, s._opponentPick || null)
        return
      }

      if (!submittedRef.current) {
        // Non-penalty (or solo penalty): bot may have submitted; user didn't.
        // Compute deltas with userPayload=null.
        _resolve(null)
      }
    }, remaining + 200)  // small buffer

    // Hard fail-safe: regardless of submit/auto-expire, never let the modal
    // sit in 'active' for more than durationMs + 6s. Covers the edge case
    // where neither submit nor auto-expire ran (state stuck somehow), or
    // the WS minigame_result broadcast got dropped before reaching us.
    const lockedGameId = state.gameId
    const hardTimeoutMs = state.startedAtMs + state.durationMs + 6000 - Date.now()
    const hardTimer = setTimeout(() => {
      setState(s => s && s.gameId === lockedGameId && s.status === 'active'
        ? { ...s, status: 'resolved' }
        : s)
    }, Math.max(0, hardTimeoutMs))

    return () => {
      clearTimeout(expireTimerRef.current)
      clearTimeout(hardTimer)
    }
  }, [state?.gameId, state?.status])

  // Solo-mode bot: when only one human is in the room, the bot generates a
  // synthetic submission. We don't post the bot's submission separately; the
  // bot's tap time feeds into the same `_resolve` call so deltas include it.
  const botRef = useRef(null)
  useEffect(() => {
    if (state?.status !== 'active' || !room) return
    const isSolo = (room.members || []).length <= 1
    if (!isSolo) return
    // Inject the user's role into the state snapshot the bot sees so games
    // like PENALTY_SHOOTOUT can pick the opposite role for the bot.
    const userRole = (() => {
      if (state.gameType !== 'PENALTY_SHOOTOUT') return null
      const adv = state.ownershipContext?.advantagedUserId
      if (adv) return adv === currentUserId ? 'shooter' : 'keeper'
      const ids = (room.members || []).map(m => m.userId).filter(Boolean).sort()
      if (ids.length === 0) return 'shooter'
      return ids[0] === currentUserId ? 'shooter' : 'keeper'
    })()
    const enriched = { ...state, _userRole: userRole }
    botRef.current = runSoloBot(enriched, (botPayload) => {
      // Stash on state so resolve sees it; if user has already submitted,
      // resolve now with both sides.
      setState(s => s ? { ...s, _botPayload: botPayload } : s)
      if (submittedRef.current && !resolvedRef.current) {
        _resolveBoth(userPayloadRef.current, botPayload)
      }
    })
    return () => botRef.current?.cancel?.()
  }, [state?.gameId, state?.status, room?.members?.length, currentUserId])

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
        // 'final' = real deltas. Backend marks (gameId, userId) as resolved
        // and applies the score. Penalty's 'announce' phase POST earlier
        // skipped that mark so this one still goes through.
        phase:    'final',
      }).catch(err => logger.warn('useMiniGame', 'postMinigameScore failed', err))
    }

    // Optimistic local resolution — flip the modal to 'resolved' immediately
    // so the user sees their own delta even if the backend's WS broadcast
    // gets dropped or delayed. When the real broadcast arrives, the existing
    // minigame_result handler merges in the opponent's delta and resets the
    // dismiss timer, so the panel naturally upgrades.
    //
    // CRITICAL: MERGE with existing state.deltas instead of overwriting.
    // If the opponent finished first, their broadcast already populated
    // state.deltas via the non-submitter branch in minigame_result. A blind
    // overwrite here would clobber that — the late-finisher's modal would
    // end up showing only their own delta, while the early-finisher's modal
    // correctly shows both. (That's exactly the bug the user reported on
    // the halftime quiz result panel.)
    const lockedGameId = state.gameId
    setState(s => {
      if (!s || s.gameId !== lockedGameId) return s
      const byUid = new Map((s.deltas || []).map(d => [d.userId, d]))
      for (const d of deltas) byUid.set(d.userId, d)
      return { ...s, status: 'resolved', deltas: Array.from(byUid.values()) }
    })
    if (resultDismissTimerRef.current) clearTimeout(resultDismissTimerRef.current)
    // Hold the dismiss until after the game window closes so a slow
    // opponent's broadcast can still merge into the result panel before
    // it disappears. floor is 4.5s (same as before for fast resolutions).
    const deadline = (state.startedAtMs || Date.now()) + (state.durationMs || 0) + 4500
    const delay    = Math.max(4500, deadline - Date.now())
    resultDismissTimerRef.current = setTimeout(
      () => setState(s => s && s.gameId === lockedGameId ? null : s),
      delay,
    )
  }, [state, currentUserId, room?.roomCode, room?.members])

  // Keep the ref pointing at the latest state-bound callback. See note on
  // resolveBothRef declaration for why this matters for multi-user penalty.
  resolveBothRef.current = _resolveBoth
  stateRef.current      = state

  const _resolve = useCallback((userPayload) => {
    // OFFSIDE_REFLEX is a non-mutual game — the submitter's own tap is fully
    // scorable on its own (bracket score from clickedAt vs. offsideMomentMs).
    // Resolve immediately so the modal transitions to ResultBanner inside
    // the same React commit as the tap. Without this short-circuit the user
    // sat on "Waiting for opponent…" until the hard fail-safe flipped status
    // to 'resolved' with empty deltas, and `_outcomeFor` fell through to the
    // "TOO LATE" sentinel — which is wrong when the user's actual delta is
    // positive. Bot's delta in solo mode was already cosmetic-only (backend's
    // apply_minigame_score filters every POST to submitter_user_id's delta),
    // so dropping the wait-for-bot path doesn't change persisted state.
    if (state?.gameType === 'OFFSIDE_REFLEX') {
      _resolveBoth(userPayload, state?._botPayload ?? null)
      return
    }

    // Other games (PENALTY_SHOOTOUT is mutual — needs both picks before
    // outcome is known; HALFTIME_QUIZ uses the same stash-then-resolve
    // pattern). Keep the existing gating.
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

    // PENALTY_SHOOTOUT (multi-user) is the one game with a mutual outcome —
    // shooter scores or keeper saves depending on whether the picks match.
    // Resolving immediately on the first tap would lock in "GOAL +N" with
    // keeperPayload=null (keeper hasn't tapped). Instead, broadcast our pick
    // as a `result.pick` announcement (deltas=[]), stash the pick locally,
    // and wait for the opponent's pick to arrive via minigame_result merge.
    // Real deltas get POSTed by _resolveBoth once both picks are known.
    const isMultiHumanPenalty =
      state?.gameType === 'PENALTY_SHOOTOUT' && (room?.members || []).length > 1
    if (isMultiHumanPenalty && room?.roomCode) {
      roomsApi.postMinigameScore(room.roomCode, {
        gameId:   state.gameId,
        gameType: state.gameType,
        deltas:   [],
        result:   { pick: payload },
        // 'announce' tells the backend not to mark this user as resolved —
        // the real deltas POST from _resolveBoth will do that later.
        phase:    'announce',
      }).catch(err => logger.warn('useMiniGame', 'penalty pick announce failed', err))
      setState(s => s ? { ...s, _localPick: payload } : s)
      return
    }

    _resolve(payload)
  }, [_resolve, state, room?.members?.length, room?.roomCode])

  // Handle WS messages forwarded by useRoom.
  const onMinigameMessage = useCallback((msg) => {
    if (msg.type === 'minigame_start') {
      // Frontend-driven trigger now opens the modal locally on event reveal.
      // Backend's push only wins as a fallback when the frontend hadn't fired
      // (e.g. user joined the room mid-event). If we already have local state,
      // ignore — frontend beat backend, no need to clobber the active game.
      setState(prev => {
        if (prev) return prev
        // firedEvents guard: a late-arriving WS broadcast for an event that
        // already played and dismissed used to open a fresh duplicate modal.
        // Drop the broadcast if firedEvents already contains the event id.
        // Note we key on relatedEventId (or gameId as fallback) so multiple
        // events of the SAME gameType don't suppress each other.
        const eventKey = msg.relatedEventId || msg.gameId
        if (matchId && eventKey) {
          const fired = _readFiredEvents(matchId, matchStartedAt)
          if (fired.includes(eventKey)) return prev
          _writeFiredEvents(matchId, matchStartedAt, [...fired, eventKey])
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
          source:           msg.source || null,  // 'ai-director' when from Director Lambda
          reasoning:        msg.reasoning || null,  // AI's "why this action" — surfaced via Why? toggle
          status:           msg.relatedEventId ? 'pending' : 'active',
        }
      })
    } else if (msg.type === 'minigame_result') {
      // Each user's POST broadcasts their own delta to the whole room. Merge
      // incoming deltas into state.deltas (deduped by userId) so the result
      // panel will show every user's outcome when it eventually renders.
      //
      // CRITICAL: do NOT flip status to 'resolved' for a user who hasn't
      // submitted yet — let them keep playing the full window. Otherwise the
      // first tapper closes the game for everyone else, which the user
      // explicitly does not want ("not a first-reaction game"). Their own
      // submit / expire timer will transition them to resolved later, with
      // the merged deltas already populated.
      setState(s => {
        if (!s || s.gameId !== msg.gameId) return s
        const existingByUid = new Map((s.deltas || []).map(d => [d.userId, d]))
        for (const d of msg.deltas || []) existingByUid.set(d.userId, d)
        const mergedDeltas = Array.from(existingByUid.values())

        // PENALTY_SHOOTOUT pick coordination: the announce-only broadcast
        // (deltas=[], result.pick=...) carries the opponent's pick. Capture
        // it so we can resolve once BOTH picks are present.
        let opponentPick = s._opponentPick
        if (s.gameType === 'PENALTY_SHOOTOUT' && msg.result?.pick) {
          const incomingRole = msg.result.pick.role
          // Don't overwrite if the broadcast is our OWN pick echoing back.
          if (incomingRole && incomingRole !== s._localPick?.role) {
            opponentPick = msg.result.pick
          }
        }

        // If WE submitted and both picks are now known, trigger the real
        // resolution as a microtask so refs are stable before _resolveBoth.
        if (s.gameType === 'PENALTY_SHOOTOUT'
            && submittedRef.current
            && !resolvedRef.current
            && s._localPick
            && opponentPick) {
          const localPick = s._localPick
          const oppPick   = opponentPick
          // Call via ref — see resolveBothRef declaration for the why.
          Promise.resolve().then(() => resolveBothRef.current?.(localPick, oppPick))
        }

        // Non-submitter case (existing): keep playing.
        if (!submittedRef.current && s.status === 'active') {
          return {
            ...s,
            deltas:        mergedDeltas,
            result:        msg.result,
            _opponentPick: opponentPick,
          }
        }
        // Penalty submitter waiting for opponent — stay 'active' until
        // _resolveBoth runs and flips status itself.
        const stillWaitingForPenaltyOpponent =
          s.gameType === 'PENALTY_SHOOTOUT'
          && !resolvedRef.current
          && (!s._localPick || !opponentPick)
        return {
          ...s,
          status:        stillWaitingForPenaltyOpponent ? s.status : 'resolved',
          result:        msg.result,
          deltas:        mergedDeltas,
          _opponentPick: opponentPick,
        }
      })
      // Only re-arm dismiss when WE'RE the one who submitted AND we're
      // truly entering the resolved phase. For penalty, the announce-only
      // broadcasts (deltas=[]) shouldn't trigger a dismiss timer — only the
      // final resolution does, via `_resolveBoth` (which sets its own).
      const isPenaltyAnnounceOnly =
        msg.gameType === 'PENALTY_SHOOTOUT'
        && (!msg.deltas || msg.deltas.length === 0)
        && msg.result?.pick != null
      if (submittedRef.current && !isPenaltyAnnounceOnly) {
        if (resultDismissTimerRef.current) clearTimeout(resultDismissTimerRef.current)
        // Don't dismiss before the game window closes — late tappers'
        // per-user broadcasts still need to land in the panel. Read the
        // latest startedAtMs/durationMs via stateRef because this callback
        // is cached with [matchId, matchStartedAt] deps and state is stale
        // in its closure.
        const s = stateRef.current
        const deadline = (s?.startedAtMs || Date.now()) + (s?.durationMs || 8000) + 4500
        const delay    = Math.max(4500, deadline - Date.now())
        resultDismissTimerRef.current = setTimeout(
          () => setState(s2 => s2 && s2.gameId === msg.gameId ? null : s2),
          delay,
        )
      }
    } else if (msg.type === 'minigame_expired') {
      setState(s => s && s.gameId === msg.gameId ? { ...s, status: 'expired' } : s)
      setTimeout(() => setState(s => s && s.gameId === msg.gameId ? null : s), 2000)
    }
  }, [matchId, matchStartedAt])

  const close = useCallback(() => setState(null), [])

  return { state, submit, close, onMinigameMessage }
}
