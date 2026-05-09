import { useCallback } from 'react'
import { roomsApi } from '../services/api'
import { logger } from '../services/logger'

/**
 * Coordinated draft (2-user mode).
 *
 * Reads draft state from `room.draft` (kept in sync by useRoom's WS handler
 * for `draft_state_update` / `draft_started` / `draft_pair_resolved` /
 * `draft_complete`). Exposes the two REST actions: ready-up and pick.
 *
 * Solo mode (1-user rooms) bypasses this entirely — TeamSelectionModal's
 * existing client-only simulation handles those.
 *
 * Disconnect freeze: state lives on the room record, so a refresh / reconnect
 * just reloads the same draft. A user's pending pick is locked once submitted
 * (backend rejects re-picks for the same pairIndex). The opponent's choice is
 * not visible to the picker until both have submitted.
 */
export function useDraft(room, currentUserId) {
  const draft = room?.draft || null
  const status = draft?.status || 'idle'   // idle (no draft) | waiting (some users ready) | active | complete
  const readyUserIds = draft?.readyUserIds || []
  const isReady = !!currentUserId && readyUserIds.includes(currentUserId)

  // Current pair (if active). The pair is just an array of two playerIds —
  // the modal enriches with full player metadata via matchesApi.getPlayers().
  const currentPair = (status === 'active' && draft.pairs && draft.currentPairIndex < draft.pairs.length)
    ? draft.pairs[draft.currentPairIndex]
    : null
  const currentPairIndex = draft?.currentPairIndex ?? 0
  const totalPairs = draft?.totalPairs ?? draft?.pairs?.length ?? 0

  // Has the current user already picked for this pair? (Lock UI accordingly.)
  const myPendingPick = currentUserId ? (draft?.pendingChoices?.[currentUserId] || null) : null

  // The user's accumulated picks across the draft so far.
  const myPicks = currentUserId ? (draft?.picks?.[currentUserId] || []) : []

  const ready = useCallback(async () => {
    if (!room?.roomCode) return
    try {
      const out = await roomsApi.draftReady(room.roomCode)
      logger.success('useDraft', 'Marked ready', out)
      return out
    } catch (err) {
      logger.error('useDraft', 'Failed to mark ready', err)
      throw err
    }
  }, [room?.roomCode])

  const pick = useCallback(async (pairIndex, playerId) => {
    if (!room?.roomCode) return
    try {
      const out = await roomsApi.draftPick(room.roomCode, pairIndex, playerId)
      logger.success('useDraft', 'Pick submitted', out)
      return out
    } catch (err) {
      logger.error('useDraft', 'Failed to submit pick', err)
      throw err
    }
  }, [room?.roomCode])

  return {
    draft,
    status,
    readyUserIds,
    isReady,
    currentPair,
    currentPairIndex,
    totalPairs,
    myPendingPick,
    myPicks,
    lastReveal: room?.lastDraftReveal || null,
    ready,
    pick,
  }
}
