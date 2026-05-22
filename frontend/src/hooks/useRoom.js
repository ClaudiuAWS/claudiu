import { useState, useEffect, useCallback, useRef } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'
import toast from 'react-hot-toast'
import { emitScoreToast } from '../components/ScoreToast'

const ROOM_CODE_KEY = 'fan_squad_room_code'

// Per-room score event log (used by the leaderboard tap-to-expand timeline).
// Keyed by roomCode — every room session has a unique code, so a brand-new
// match in a new room starts with an empty log automatically. Capped to
// avoid unbounded sessionStorage growth on long matches.
const SCORE_EVENTS_KEY = (code) => `scoreEvents_${code}`
const SCORE_EVENTS_CAP = 300

function _readScoreEvents(roomCode) {
  if (!roomCode) return []
  try {
    const s = sessionStorage.getItem(SCORE_EVENTS_KEY(roomCode))
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function _writeScoreEvents(roomCode, events) {
  if (!roomCode) return
  try {
    const slim = events.slice(-SCORE_EVENTS_CAP)
    sessionStorage.setItem(SCORE_EVENTS_KEY(roomCode), JSON.stringify(slim))
  } catch {}
}

// Listeners for mini-game lifecycle messages. Hooks like useMiniGame can
// subscribe via useRoom's `onMinigameMessage` callback so the WS connection
// stays single (one channel subscription per room).

export function useRoom(onChatMessage, currentUserId, initialRoom = null, onMinigameMessage = null, onMatchStarted = null, onCheer = null) {
  const [room, setRoom] = useState(initialRoom)
  const [loading, setLoading] = useState(initialRoom ? false : true)
  const onCheerRef = useRef(onCheer)
  onCheerRef.current = onCheer
  const [scoreEvents, setScoreEvents] = useState([])
  // One-shot "match just ended" flag. Flipped true when the backend pushes
  // a `match_ended` WS message; auto-resets to false 5s later. MatchPage
  // consumes this to trigger the <MatchEndCelebration> overlay (sound + red
  // confetti). Kept in this hook because the WS handler lives here and a
  // sibling-component event-bus would be over-engineering for a single signal.
  const [matchJustEnded, setMatchJustEnded] = useState(false)
  // Held in a ref so handleMessage stays stable even when the callback
  // identity changes between renders — same pattern as _resolveBoth in
  // useMiniGame.
  const onMatchStartedRef = useRef(onMatchStarted)
  onMatchStartedRef.current = onMatchStarted
  // The WS handler is stable across renders, but we still need the latest
  // roomCode at the moment a score_update arrives to namespace the
  // sessionStorage write.
  const roomCodeRef = useRef(room?.roomCode || null)
  roomCodeRef.current = room?.roomCode || null

  // Hydrate scoreEvents from sessionStorage whenever the room code changes
  // (initial mount, room join, or room switch).
  useEffect(() => {
    if (!room?.roomCode) {
      setScoreEvents([])
      return
    }
    setScoreEvents(_readScoreEvents(room.roomCode))
  }, [room?.roomCode])

  // Restore room from sessionStorage on mount (skip if we already have room from nav state)
  useEffect(() => {
    if (initialRoom) return

    const savedCode = sessionStorage.getItem(ROOM_CODE_KEY)
    if (!savedCode) {
      setLoading(false)
      return
    }

    const controller = new AbortController()

    roomsApi.get(savedCode)
      .then(data => {
        if (!controller.signal.aborted) {
          // Coerce member.score to number — DDB Decimal arrives as a string
          // ("20") via the API's `default=str` JSON serializer, and
          // string-vs-number coercion in downstream comparisons can hide
          // valid scores. Always treat scores as numbers from the boundary.
          const normalized = {
            ...data,
            members: (data.members || []).map(m => ({
              ...m,
              score: Number(m.score) || 0,
            })),
          }
          setRoom(normalized)
          logger.success('useRoom', 'Room restored', normalized)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          logger.warn('useRoom', 'Saved room gone, clearing', err)
          sessionStorage.removeItem(ROOM_CODE_KEY)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  // Real-time updates via WebSocket
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'room_update') {
      setRoom(msg.room)
      logger.success('useRoom', 'WS room_update', msg.room)
    } else if (msg.type === 'room_closed') {
      // eslint-disable-next-line no-console
      console.warn('[useRoom] room cleared (source: room_closed)')
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast('Party was closed')
      logger.info('useRoom', 'WS room_closed')
    } else if (msg.type === 'match_ended') {
      toast('Full time! 🏁')
      logger.info('useRoom', 'WS match_ended', msg.finalResult)
      // Stays true until the MatchPage unmounts (i.e. the user dismisses
      // the celebration via "Back to Home"). The end-of-match overlay
      // owns the long-running popup + audio fades and only completes on
      // explicit user action.
      setMatchJustEnded(true)
    } else if (msg.type === 'match_started') {
      // Host's `start_match_for_room` pushes this once the replay-emitter
      // confirms the match is live. Non-host clients use it to navigate to
      // /match immediately rather than waiting on the next match-status poll.
      onMatchStartedRef.current?.(msg.matchId)
      logger.info('useRoom', 'WS match_started', msg.matchId)
    } else if (msg.type === 'chat_message') {
      onChatMessage?.(msg)
    } else if (msg.type === 'cheer') {
      // Free-form floating-emoji reaction from a party member. Forwarded
      // to the consumer (MatchPage) which mounts the ReactionsOverlay.
      // Purely cosmetic — no leaderboard side-effect.
      onCheerRef.current?.(msg)
    } else if (msg.type === 'captain_update') {
      // A party member picked / changed their captain. Merge into the
      // local room state so the squad-list captain star updates live for
      // everyone. The server already persisted; this is pure UI sync.
      setRoom(prev => {
        if (!prev) return prev
        return {
          ...prev,
          members: (prev.members || []).map(m =>
            m.userId === msg.userId
              ? { ...m, captainPlayerId: msg.playerId || '' }
              : m
          ),
        }
      })
    } else if (msg.type === 'score_update') {
      // Reconcile to the leaderboard absolute, with a regression guard.
      //
      // Optimistic frontend scoring already bumped local on event reveal,
      // so when the matching score_update arrives the leaderboard absolute
      // == local. Just trust it. Two edge cases:
      //   1. Catch-up: local is lower because an earlier broadcast was
      //      missed → leaderboard > local → take leaderboard.
      //   2. Stale broadcast: backend read pre-write, broadcast value is
      //      lower than what local already counted. Don't regress UNLESS
      //      the delta is genuinely negative (yellow/red card), in which
      //      case local moving down IS correct.
      const scoreMap = Object.fromEntries(
        (msg.leaderboard || []).map(e => [e.userId, Number(e.score) || 0])
      )
      const deltaByUid = Object.fromEntries(
        (msg.changes || []).map(c => [c.userId, Number(c.delta) || 0])
      )
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.map(m => {
          const localBase = Number(m.score) || 0
          const target    = scoreMap[m.userId]
          if (target === undefined) return m
          const delta     = deltaByUid[m.userId] || 0
          const allowDecrease = delta < 0 // legitimate negative event
          if (target >= localBase || allowDecrease) {
            return { ...m, score: target }
          }
          // Regression detected — keep local
          return m
        }),
      } : prev)

      // Per-event toast intentionally NOT fired here. Optimistic frontend
      // scoring (applyOptimisticDeltas in useMatch) already surfaces a toast
      // the moment the event reveals — duplicating it on the WS round-trip
      // gave users two notifications for the same event. The reaction-tap
      // path still posts its own confirmation toast at tap time, and
      // mini-game results show in the modal panel.
      //
      // Append every change to the per-room scoreEvents log so the
      // leaderboard tap-to-expand timeline can show a user's history.
      // Dedup against any entry the reactor's HTTP-driven optimistic
      // append already added (see applyAuthoritativeScoreChange below).
      const incoming = (msg.changes || []).map(c => ({
        userId:         c.userId,
        delta:          Number(c.delta) || 0,
        newScore:       Number(c.newScore) || 0,
        reason:         c.reason || '',
        eventType:      c.eventType || '',
        playerName:     c.playerName || c.displayName || '',
        displayName:    c.displayName || '',
        source:         c.source || '',
        _sourceEventId: c.sourceEventId || c.eventId || '',
        ts:             Date.now(),
      }))
      if (incoming.length) {
        setScoreEvents(prev => {
          // Dedup against existing entries (optimistic appends or earlier
          // WS appends). Match order:
          //   1. Exact _sourceEventId + userId — ironclad. The backend
          //      now ships `sourceEventId` on every score_change via
          //      event-processor / claim_reaction / apply_minigame_score.
          //   2. Reaction fingerprint: (userId, reason, delta, playerName)
          //      within ±2.5s — covers the handleReactTap HTTP-then-WS
          //      pair for older clients / pre-deploy.
          //   3. In-feed fingerprint: same tuple within 90s — wider safety
          //      net for Lambda cold start (typically <30s end-to-end,
          //      but EventBridge + SQS scheduling + replay-emitter add up).
          // playerName is in the fingerprint so two distinct same-type
          // events for different players (e.g., two different scorers
          // both worth +5) don't false-dedup.
          const filtered = incoming.filter(inc => !prev.some(e => {
            // Source-event fingerprint must also match the REASON now —
            // goal events emit per-component entries (scorer / assist /
            // conceded), all sharing the same _sourceEventId. Without
            // the reason check, the optimistic and WS entries collapse
            // to a single row and the user loses the breakdown.
            if (inc._sourceEventId
                && e._sourceEventId === inc._sourceEventId
                && e.userId === inc.userId
                && e.reason === inc.reason) return true
            if (e.userId !== inc.userId)             return false
            if (e.reason !== inc.reason)             return false
            if (e.delta  !== inc.delta)              return false
            if ((e.playerName || '') !== (inc.playerName || '')) return false
            const dt = Math.abs((Number(e.ts) || 0) - inc.ts)
            const reactionish = (inc.reason || '').toLowerCase().includes('react')
            return dt < (reactionish ? 2500 : 90000)
          }))
          if (!filtered.length) return prev
          const next = [...prev, ...filtered]
          _writeScoreEvents(roomCodeRef.current, next)
          return next
        })
      }
      logger.info('useRoom', 'WS score_update', msg.changes)
    } else if (msg.type === 'minigame_start' || msg.type === 'minigame_result' || msg.type === 'minigame_expired') {
      // Mini-game lifecycle messages — forward to the dedicated useMiniGame
      // hook via the optional callback. Keeping the room WS connection
      // single-purpose for state sync; mini-game UI lives elsewhere.
      onMinigameMessage?.(msg)
      logger.info('useRoom', `WS ${msg.type}`, msg)
    } else if (msg.type === 'director_diag') {
      // Halftime-quiz observability breadcrumb from the Director Lambda.
      // Open Chrome DevTools console on the device to see WHY the AI quiz
      // did or didn't fire (outcome: 'broadcast' | 'drop_schema' |
      // 'drop_no_grounded' | 'wait' | …). Pure observability — no state
      // change. See backend/director-handler/service.py::_push_director_diag.
      // eslint-disable-next-line no-console
      console.info('[director_diag]', msg)
    } else if (msg.type === 'commentary_update') {
      // AI Match Director commentary — push onto a stack. Newest first (top),
      // older entries flow down. Each entry self-purges after 7s. Cap at 5
      // visible to keep the feed clean if the AI gets chatty.
      //
      // Personal-commentary filter: when the broadcast carries a non-empty
      // `forUserIds` array, only show it to the listed users. The flag
      // `personal: true` on the local entry lets DirectorCommentary render
      // it with a gold-tinged style so the owner notices the line is
      // addressed to them. Empty/missing forUserIds = ambient commentary,
      // shown to everyone.
      const forUserIds = Array.isArray(msg.forUserIds) ? msg.forUserIds : []
      if (forUserIds.length > 0 && currentUserId && !forUserIds.includes(currentUserId)) {
        return
      }
      const entry = {
        id:             `${msg.relatedEventId || 'cm'}-${Date.now()}`,
        text:           msg.text,
        relatedEventId: msg.relatedEventId,
        reasoning:      msg.reasoning || null,
        personal:       forUserIds.length > 0,
        ts:             msg.createdAtMs ?? Date.now(),
      }
      setRoom(prev => prev ? {
        ...prev,
        commentaryStack: [entry, ...(prev.commentaryStack || []).slice(0, 4)],
      } : prev)
      // Auto-purge this entry after 7s. Each entry has its own timer so
      // entries arriving close together don't all expire at the same instant.
      setTimeout(() => {
        setRoom(prev => prev ? {
          ...prev,
          commentaryStack: (prev.commentaryStack || []).filter(e => e.id !== entry.id),
        } : prev)
      }, 7000)
      logger.info('useRoom', 'WS commentary_update', msg)
    } else if (
      msg.type === 'draft_state_update' ||
      msg.type === 'draft_started' ||
      msg.type === 'draft_pair_resolved' ||
      msg.type === 'draft_complete'
    ) {
      // Coordinated draft state lives on the room record. Folding the draft
      // payload into room.draft means every consumer (TeamSelectionModal,
      // LobbyPage's "Ready Up" button) reads from a single source of truth.
      // Stash the resolved-pair metadata on `lastResolved` so the UI can
      // animate the reveal even though the backend is already on the next
      // pair.
      setRoom(prev => prev ? {
        ...prev,
        draft: msg.draft,
        lastDraftReveal: msg.type === 'draft_pair_resolved' ? {
          pairIndex: msg.pairIndex,
          pair:      msg.pair,
          resolved:  msg.resolved,
          tiebreak:  msg.tiebreak,
          ts:        Date.now(),
        } : prev.lastDraftReveal,
      } : prev)
      logger.info('useRoom', `WS ${msg.type}`, msg)
    }
  }, [onChatMessage, currentUserId, onMinigameMessage])

  useWebSocket(room?.roomCode ? `room#${room.roomCode}` : null, handleMessage)

  const createRoom = async (matchId) => {
    setLoading(true)
    try {
      const data = await roomsApi.create(matchId)
      setRoom(data)
      sessionStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room created', data)
      toast.success('Party created!')
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to create room', err)
      toast.error(err.message || 'Failed to create room')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (roomCode) => {
    setLoading(true)
    try {
      const data = await roomsApi.join(roomCode)
      setRoom(data)
      sessionStorage.setItem(ROOM_CODE_KEY, data.roomCode)
      logger.success('useRoom', 'Room joined', data)
      toast.success('Joined party!')
      return data
    } catch (err) {
      logger.error('useRoom', 'Failed to join room', err)
      toast.error(err.message || 'Failed to join room')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const leaveRoom = async () => {
    if (!room?.roomCode) return

    setLoading(true)
    try {
      const result = await roomsApi.leave(room.roomCode)
      sessionStorage.removeItem(ROOM_CODE_KEY)
      // eslint-disable-next-line no-console
      console.warn('[useRoom] room cleared (source: leaveRoom)')
      setRoom(null)

      if (result.deleted) {
        logger.info('useRoom', 'Room was deleted')
        toast.success('Party disbanded')
      } else {
        logger.success('useRoom', 'Left room')
        toast.success('Left party')
      }
    } catch (err) {
      logger.error('useRoom', 'Failed to leave room', err)
      sessionStorage.removeItem(ROOM_CODE_KEY)
      // eslint-disable-next-line no-console
      console.warn('[useRoom] room cleared (source: leaveRoom_catch)', err?.message)
      setRoom(null)
      toast.error(err.message || 'Failed to leave room')
    } finally {
      setLoading(false)
    }
  }

  // Optimistic local score bumps. Called by useMatch the moment a scoring
  // event becomes visible on the displayed clock — closes the gap between
  // event reveal and the backend score_update broadcast (which can take
  // 1–24s with cold-start latency). The next score_update WS reconciles
  // to the authoritative DDB value, silently correcting any drift.
  //
  // Also appends to scoreEvents so the leaderboard's tap-to-expand
  // timeline reflects the event at the same instant as the score bumps.
  // Each entry carries _sourceEventId (when the caller provides one) so
  // the eventual WS broadcast can ironclad-dedup; without it, the WS
  // handler falls back to a 30s reason/delta window match.
  const applyOptimisticDeltas = useCallback((deltas) => {
    if (!Array.isArray(deltas) || !deltas.length) return
    // SUM per-user — a single goal produces up to 3 per-component
    // entries (scorer, assist, concede) for the same user. The earlier
    // `Object.fromEntries(deltas.map(...))` collapsed them to the LAST
    // entry, so the leaderboard only bumped by the concede (-1) instead
    // of by the full (+5 + +3 - 1 = +7). The score timeline below
    // already appends per-component rows correctly; only this bump path
    // was wrong.
    const byUid = {}
    for (const d of deltas) {
      byUid[d.userId] = (byUid[d.userId] || 0) + (Number(d.delta) || 0)
    }
    setRoom(prev => prev ? {
      ...prev,
      members: prev.members.map(m => {
        const bump = byUid[m.userId]
        if (!bump) return m
        return { ...m, score: (Number(m.score) || 0) + bump }
      }),
    } : prev)

    // Append to scoreEvents so the per-user timeline mirrors the
    // leaderboard immediately. Score updates that match an existing
    // entry (replay race, double-fire from useMatch reveal) are
    // dropped via _sourceEventId.
    const ts = Date.now()
    const entries = deltas
      .filter(d => (Number(d.delta) || 0) !== 0 && d.userId)
      .map(d => ({
        userId:         d.userId,
        delta:          Number(d.delta) || 0,
        newScore:       0,
        reason:         d.reason || '',
        eventType:      '',
        playerName:     d.playerName || '',
        displayName:    '',
        source:         'optimistic',
        _sourceEventId: d._sourceEventId || '',
        ts,
      }))
    if (entries.length) {
      setScoreEvents(prev => {
        // Dedup against any pre-existing entry from this same source
        // event (covers re-reveals from event list churn).
        const newEntries = entries.filter(inc => !prev.some(e =>
          inc._sourceEventId
          && e._sourceEventId === inc._sourceEventId
          && e.userId === inc.userId
        ))
        if (!newEntries.length) return prev
        const next = [...prev, ...newEntries]
        _writeScoreEvents(roomCodeRef.current, next)
        return next
      })
    }

    // Per-component toasts — one per (scorer | assist | concede) entry
    // for the current user. The leaderboard timeline already shows the
    // breakdown as separate rows; the in-feed toast should match so a
    // goal + assist combo (e.g. Pavlović +5 + Kane assist +6 with
    // captain ×2) doesn't masquerade as one inflated "+11" line.
    // Ordered deterministically (scorer → assist → concede) and
    // staggered ~150 ms so each card slides in cleanly instead of
    // overlapping on the same frame.
    const myEntries = deltas.filter(d => d.userId === currentUserId && d.delta !== 0)
    if (myEntries.length) {
      const ranked = ['scorer', 'assist', 'concede']
      const ordered = myEntries.slice().sort((a, b) => {
        const ai = ranked.indexOf(a.component || '')
        const bi = ranked.indexOf(b.component || '')
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
      ordered.forEach((d, i) => {
        setTimeout(() => {
          emitScoreToast({
            delta:      Number(d.delta) || 0,
            reason:     d.reason || 'your squad',
            playerName: d.playerName || '',
          })
        }, i * 150)
      })
    }
  }, [currentUserId])

  // Ingest an authoritative score change (from an HTTP success response —
  // most commonly the reaction-tap path). Bumps the leaderboard to the
  // change's newScore (or by delta if newScore missing) AND appends to
  // scoreEvents immediately, without waiting for the follow-up WS
  // broadcast — which may not arrive if the AWS API Gateway WS dropped
  // the message during a momentary disconnect. The WS handler's append
  // path dedups against this entry via a ±2.5s match on
  // (userId, reason, delta), so we don't double-count.
  const applyAuthoritativeScoreChange = useCallback((change) => {
    if (!change || !change.userId) return
    const delta    = Number(change.delta) || 0
    const newScore = (typeof change.newScore === 'number') ? change.newScore : null

    setRoom(prev => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map(m => {
          if (m.userId !== change.userId) return m
          const base = Number(m.score) || 0
          return { ...m, score: newScore !== null ? newScore : base + delta }
        }),
      }
    })

    const entry = {
      userId:      change.userId,
      delta:       delta,
      newScore:    newScore !== null ? newScore : 0,
      reason:      change.reason || '',
      eventType:   change.eventType || '',
      playerName:  change.playerName || change.displayName || '',
      displayName: change.displayName || '',
      source:      change.source || '',
      // Stamp the source-event id so the upcoming WS score_update for
      // the same reaction tap dedups via the ironclad first branch in
      // the score_update handler — instead of falling through to the
      // 2.5-second fingerprint check, which loses the race on cold-
      // start Lambdas and lets a second "REACTED TO NUTMEG" row land.
      _sourceEventId: change.sourceEventId || change.eventId || '',
      ts:          Date.now(),
    }
    setScoreEvents(prev => {
      const next = [...prev, entry]
      _writeScoreEvents(roomCodeRef.current, next)
      return next
    })
  }, [])

  // Defensive re-hydrate path used by LobbyPage when room is null but we
  // have a roomCode saved in sessionStorage. Unlike joinRoom, this is a
  // pure READ — no toasts, no membership side-effect, no loading state.
  // Falls through to the existing room WS handlers once setRoom fires.
  const getRoomByCode = useCallback(async (code) => {
    if (!code) return null
    const data = await roomsApi.get(code)
    setRoom({
      ...data,
      members: (data.members || []).map(m => ({ ...m, score: Number(m.score) || 0 })),
    })
    sessionStorage.setItem(ROOM_CODE_KEY, data.roomCode)
    logger.success('useRoom', 'Room re-hydrated', data)
    return data
  }, [])

  return {
    room,
    loading,
    scoreEvents,
    matchJustEnded,
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomByCode,
    applyOptimisticDeltas,
    applyAuthoritativeScoreChange,
  }
}
