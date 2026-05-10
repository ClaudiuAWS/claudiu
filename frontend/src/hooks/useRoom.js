import { useState, useEffect, useCallback } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'
import { useWebSocket } from './useWebSocket'
import toast from 'react-hot-toast'

const ROOM_CODE_KEY = 'fan_squad_room_code'

// Listeners for mini-game lifecycle messages. Hooks like useMiniGame can
// subscribe via useRoom's `onMinigameMessage` callback so the WS connection
// stays single (one channel subscription per room).

export function useRoom(onChatMessage, currentUserId, initialRoom = null, onMinigameMessage = null) {
  const [room, setRoom] = useState(initialRoom)
  const [loading, setLoading] = useState(initialRoom ? false : true)

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
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast('Room was closed')
      logger.info('useRoom', 'WS room_closed')
    } else if (msg.type === 'match_ended') {
      toast('Full time! 🏁')
      logger.info('useRoom', 'WS match_ended', msg.finalResult)
    } else if (msg.type === 'chat_message') {
      onChatMessage?.(msg)
    } else if (msg.type === 'score_update') {
      // Apply DELTAS rather than the absolute leaderboard. Stale backend
      // snapshots (eventual-consistency races) can produce a broadcast where
      // a user's absolute leaderboard score regresses — e.g. an in-flight
      // Lambda re-broadcasts an old members list right after a fresh refresh.
      // Trusting the delta keeps the local state monotonic against the
      // events the user actually saw.
      const deltaByUid = Object.fromEntries(
        (msg.changes || []).map(c => [c.userId, Number(c.delta) || 0])
      )
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.map(m => ({
          ...m,
          score: (Number(m.score) || 0) + (deltaByUid[m.userId] || 0),
        })),
      } : prev)

      // Show a per-event toast for the current user's own deltas. We rely on
      // the backend to populate `playerName` + `reason` so the message reads
      // like "+6 — Olise scored for your squad". Mini-game results have their
      // own modal already so we suppress them here to avoid double-surfacing.
      const myChange = (msg.changes || []).find(c => c.userId === currentUserId && c.delta !== 0)
      // Mini-game deltas already surface in the modal's result panel; skip toast.
      if (myChange && myChange.source !== 'minigame') {
        const sign  = myChange.delta > 0 ? '+' : '−'
        const value = Math.abs(myChange.delta)
        const who   = myChange.playerName || ''
        const verb  = myChange.reason || (myChange.delta > 0 ? 'awarded' : 'penalty')
        const text  = who ? `${sign}${value} — ${who} ${verb}` : `${sign}${value} — ${verb}`
        const icon  = myChange.delta > 0 ? '⚽' : '🟨'
        toast(text, { icon, duration: 3000 })
      }
      logger.info('useRoom', 'WS score_update', msg.changes)
    } else if (msg.type === 'minigame_start' || msg.type === 'minigame_result' || msg.type === 'minigame_expired') {
      // Mini-game lifecycle messages — forward to the dedicated useMiniGame
      // hook via the optional callback. Keeping the room WS connection
      // single-purpose for state sync; mini-game UI lives elsewhere.
      onMinigameMessage?.(msg)
      logger.info('useRoom', `WS ${msg.type}`, msg)
    } else if (msg.type === 'commentary_update') {
      // AI Match Director commentary — push onto a stack. Newest first (top),
      // older entries flow down. Each entry self-purges after 7s. Cap at 5
      // visible to keep the feed clean if the AI gets chatty.
      const entry = {
        id:             `${msg.relatedEventId || 'cm'}-${Date.now()}`,
        text:           msg.text,
        relatedEventId: msg.relatedEventId,
        reasoning:      msg.reasoning || null,
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
      toast.success('Room created!')
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
      toast.success('Joined room!')
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
      setRoom(null)

      if (result.deleted) {
        logger.info('useRoom', 'Room was deleted')
        toast.success('Room destroyed')
      } else {
        logger.success('useRoom', 'Left room')
        toast.success('Left room')
      }
    } catch (err) {
      logger.error('useRoom', 'Failed to leave room', err)
      sessionStorage.removeItem(ROOM_CODE_KEY)
      setRoom(null)
      toast.error(err.message || 'Failed to leave room')
    } finally {
      setLoading(false)
    }
  }

  return {
    room,
    loading,
    createRoom,
    joinRoom,
    leaveRoom,
  }
}
