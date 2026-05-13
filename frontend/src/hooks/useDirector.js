import { useEffect, useRef } from 'react'
import { roomsApi } from '../services/api'
import { logger } from './../services/logger'
import { gameTimeToSeconds } from '../utils/matchEvents'

/**
 * AI Match Director frontend ticker.
 *
 * Posts a state snapshot to /rooms/{code}/director-tick every time a new
 * event reveals in the feed. Only the host client ticks (room.hostUserId ===
 * currentUserId) — non-host tabs would just multiply Bedrock cost for no gain
 * since the result fans out via WS to everyone anyway.
 *
 * The Director Lambda decides between three actions: start_minigame,
 * commentate, wait. Whatever it returns is broadcast over the room WS;
 * useRoom + useMiniGame already handle the resulting messages
 * (commentary_update, minigame_start). This hook is fire-and-forget — the
 * actions render themselves.
 *
 * Cost guardrails:
 * - Hard cap of 30 ticks per match (refresh resets the counter, but
 *   sessionStorage scoping means the same tab keeps its count).
 * - Skip events without an eventId or types we never want to commentate on.
 * - Errors are logged via logger.warn and never surfaced — if Bedrock is
 *   down, mini-games still fire via the rule-based trigger map in useMiniGame.
 */

const MAX_TICKS_PER_MATCH = 30

// Event types the Director shouldn't bother with — they're feed-internal
// boundary markers, not interesting moments.
const SKIP_EVENT_TYPES = new Set([
  'secondhalf',  // boundary marker; halftime row already conveys the break
  'fulltime',    // match-end marker, no commentary needed
])

export function useDirector(room, events, currentUserId, match) {
  const tickCountRef = useRef(0)
  const lastEventIdRef = useRef(null)

  const hostUserId = room?.hostUserId
  const isHost = !!currentUserId && currentUserId === hostUserId

  useEffect(() => {
    if (!isHost || !room?.roomCode || !events?.length) return
    if (tickCountRef.current >= MAX_TICKS_PER_MATCH) return

    const latest = events[events.length - 1]
    if (!latest?.eventId) return
    if (latest.eventId === lastEventIdRef.current) return  // already ticked
    if (SKIP_EVENT_TYPES.has(latest.eventType)) {
      lastEventIdRef.current = latest.eventId
      return
    }

    lastEventIdRef.current = latest.eventId
    tickCountRef.current += 1

    // Derive the score from revealed goal events instead of match.homeScore.
    // The match record is updated by the backend on its own wall-clock, so
    // it lags behind the displayed score (which is derived from each goal's
    // currentResult in the events list). Without this, the AI sees a stale
    // "2:0" right after a goal that made it "3:0" and says nonsense like
    // "2 goals lead".
    let derivedHome = match?.homeScore ?? 0
    let derivedAway = match?.awayScore ?? 0
    for (const e of events) {
      if (e.eventType !== 'goal' || !e.currentResult) continue
      const parts = String(e.currentResult).split(':').map(n => parseInt(n, 10))
      const h = parts[0], a = parts[1]
      if (Number.isFinite(h) && h > derivedHome) derivedHome = h
      if (Number.isFinite(a) && a > derivedAway) derivedAway = a
    }

    // Resolve teamRole → actual team name so the AI can say "Bayern doubles
    // their lead!" instead of the generic "Team scores!".
    const teamNameOf = (role) => role === 'home' ? (match?.homeTeamName || 'Home')
                              : role === 'away' ? (match?.awayTeamName || 'Away')
                              : null

    // Compute the displayed match minute from the trigger event's gameTime —
    // NOT from match.currentMinute, which lags because events reveal locally
    // on the clock while currentMinute only updates when a match_update WS
    // message arrives. Without this, the AI was citing a stale earlier
    // minute (e.g. saying "8'" for a save that the feed showed at 13').
    //
    // Mirrors `formatFootballTime` (utils/matchEvents.js): first-half is
    // ceil(sec/60); past halftime, it's 45 + ceil((sec - htSec)/60). We
    // cap at 45 / 90 so the AI never produces a 4-figure minute, and the
    // stoppage-time prefix is left implicit.
    const triggerMinute = (() => {
      const sec = gameTimeToSeconds(latest.gameTime)
      if (sec < 0) return null
      const halftime = events.find(e => e.eventType === 'halftime')
      const htSec = halftime ? gameTimeToSeconds(halftime.gameTime) : -1
      if (htSec < 0 || sec <= htSec) {
        return Math.min(45, Math.ceil(sec / 60))
      }
      return Math.min(90, 45 + Math.ceil((sec - htSec) / 60))
    })()

    const snapshot = {
      triggerEvent: {
        eventId:       latest.eventId,
        eventType:     latest.eventType,
        // Penalties come through as eventType:'goal' with isPenalty:true —
        // surface the flag so the AI can choose PENALTY_SHOOTOUT (and the
        // prompt's rule can validate the combo).
        isPenalty:     !!latest.isPenalty,
        playerName:    latest.playerName || latest.playerDisplay || null,
        playerDisplay: latest.playerDisplay || null,
        teamRole:      latest.teamRole || null,
        teamName:      teamNameOf(latest.teamRole),
        // Intentionally do NOT pass gameTime here. It's "MM:SS" raw seconds
        // since kickoff and the AI was quoting it as if it were the displayed
        // minute (e.g. "5:19" while the scoreboard read 9'). The snapshot's
        // top-level `minute` field is the single source of clock truth.
        currentResult: latest.currentResult || null,
      },
      score:     `${derivedHome}:${derivedAway}`,
      homeScore: derivedHome,
      awayScore: derivedAway,
      homeTeamName: match?.homeTeamName || 'Home',
      awayTeamName: match?.awayTeamName || 'Away',
      minute:    triggerMinute,
      recentEvents: events.slice(-5).map(e => ({
        type:          e.eventType,
        player:        e.playerDisplay || e.playerName || null,
        team:          teamNameOf(e.teamRole),
        currentResult: e.currentResult || null,
      })),
      members: (room.members || []).map(m => ({
        userId:         m.userId,
        displayName:    m.displayName,
        ownedPlayerIds: (m.teamSelectionDetails || []).map(p => p.playerId),
      })),
      // Map event-type entries on the room record to game-type names so
      // both the prompt's "once per match" rule and the backend hard gate
      // can compare apples to apples (the AI thinks in gameTypes).
      minigamesFired: _mapFiredToGameTypes(
        Array.isArray(room.triggeredMinigames) ? room.triggeredMinigames : []
      ),
      minutesSinceLastMinigame: 99,  // not tracked in current room state — Lambda treats as 'fresh'
      // Compute ownership so the AI-Director-fired modal carries the
      // player's identity downstream. Without this, AI broadcasts have
      // `ownershipContext: {}`, the modal can't look up the player's
      // photo, and OffsideReflex falls back to the dotless avatar.
      ownershipContext: _computeSnapshotOwnership(latest, room.members || []),
    }

    roomsApi.directorTick(room.roomCode, snapshot)
      .then(res => logger.success('useDirector', 'tick', { decision: res?.decision, count: tickCountRef.current }))
      .catch(err => logger.warn('useDirector', 'tick failed', err))

    // No cleanup needed — the POST is fire-and-forget.
  }, [
    isHost,
    room?.roomCode,
    events?.length && events[events.length - 1]?.eventId,
    match?.homeScore,
    match?.awayScore,
  ])
}

// ─── helpers ─────────────────────────────────────────────────────────────

// Mirror of useMiniGame's TRIGGER_MAP + isPenalty special case. Translates
// the room's `triggeredMinigames` SS (event-type-keyed) into the gameType
// space the AI Director reasons in. Keep in lockstep with useMiniGame.js.
const _EVENT_TYPE_TO_GAME_TYPE = {
  offside:  'OFFSIDE_REFLEX',
  halftime: 'HALFTIME_QUIZ',
  // 'penalty' isn't a real event type — penalty goals come through as
  // eventType:'goal' with isPenalty:true. The backend's triggeredMinigames
  // SS would never contain a 'penalty' entry, so no row needed here.
}

function _mapFiredToGameTypes(firedEventTypes) {
  const out = []
  for (const et of firedEventTypes) {
    const gt = _EVENT_TYPE_TO_GAME_TYPE[et]
    if (gt && !out.includes(gt)) out.push(gt)
  }
  return out
}

// Same shape as useMiniGame's _computeOwnership — kept inline (vs importing)
// to keep this hook a leaf. The frontend modal reads
// `state.ownershipContext?.playerId` so we need to emit that exact key.
function _computeSnapshotOwnership(event, members) {
  const playerId = event?.playerId || event?.scoringPlayerId || event?.goalKeeperId || null
  if (!playerId || !members?.length) return {}
  const owner = members.find(m =>
    (m.teamSelectionDetails || []).some(p => p.playerId === playerId)
  )
  return {
    playerId,
    advantagedUserId:      owner?.userId || null,
    advantagedDisplayName: owner?.displayName || null,
  }
}
