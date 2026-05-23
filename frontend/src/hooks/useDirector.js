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

    // Normalize the trigger event to an authoritative (actor, team) pair.
    // For save events the actor is the KEEPER (whose name is in
    // goalKeeperDisplay, not playerDisplay) and the actor's team is the
    // KEEPER's team (data.teamRole on saved_shot events is already the
    // keeper's role per the XML loader, but the older snapshot logic
    // wasn't using it). Without this normalization the AI saw
    // `playerName: null` on saves and made up names + team attributions —
    // e.g. claiming "Neuer (Hamburger SV) saves" when Neuer is at Bayern.
    const actor = _resolveActor(latest, teamNameOf)

    // Build a small directory of every player the AI might mention with
    // their authoritative team. Covers (a) drafted players on both
    // members' squads and (b) the trigger event's actor. The prompt
    // forbids any team attribution that isn't in this map.
    const playerDirectory = _buildPlayerDirectory(room.members || [], latest, teamNameOf)

    const snapshot = {
      triggerEvent: {
        eventId:       latest.eventId,
        eventType:     latest.eventType,
        // Penalties come through as eventType:'goal' with isPenalty:true —
        // surface the flag so the AI can choose PENALTY_SHOOTOUT (and the
        // prompt's rule can validate the combo).
        isPenalty:     !!latest.isPenalty,
        // Canonical actor + team for the event. ALWAYS use these in the
        // prompt; the legacy playerName / teamName fields are kept for
        // back-compat but the prompt has been updated to ignore them.
        actorName:     actor.name,
        actorTeam:     actor.team,
        opponentTeam:  actor.opponentTeam,
        // Legacy aliases — kept temporarily so any partially-cached prompt
        // path still works. Prompt rules now mandate actorName/actorTeam.
        playerName:    actor.name,
        playerDisplay: actor.name,
        teamRole:      latest.teamRole || null,
        teamName:      actor.team,
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
      recentEvents: events.slice(-5).map(e => {
        const a = _resolveActor(e, teamNameOf)
        return {
          type:          e.eventType,
          actor:         a.name,
          actorTeam:     a.team,
          // Legacy aliases for back-compat.
          player:        a.name,
          team:          a.team,
          currentResult: e.currentResult || null,
        }
      }),
      members: (room.members || []).map(m => ({
        userId:         m.userId,
        displayName:    m.displayName,
        ownedPlayerIds: (m.teamSelectionDetails || []).map(p => p.playerId),
      })),
      // Authoritative lookup: any player name the AI references MUST appear
      // here, with the team string from this map. The prompt forbids
      // inventing team attributions outside this directory.
      playerDirectory,
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

    // Wrap as { snapshot } so the backend's run_director_tick can read it
    // off body.snapshot (the default tick mode). The captain-suggestion
    // call from TeamSelectionModal uses a different top-level body shape
    // — see the directorTick wrapper comment in services/api.js.
    roomsApi.directorTick(room.roomCode, { snapshot })
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

// ─── Snapshot-grounding helpers ──────────────────────────────────────────
// The AI Director used to hallucinate team attributions ("Neuer at
// Hamburger SV") because the snapshot's `playerName`/`teamName` pair
// silently mismatched on certain event types. Two fixes below:
//   1. `_resolveActor` picks the right (name, team, opponent) tuple per
//      event type — keeper for saves, scorer for goals, etc.
//   2. `_buildPlayerDirectory` lists every drafted + trigger player with
//      their authoritative team; the prompt forbids team attributions
//      that aren't in this map.

// Returns { name, team, opponentTeam } for a flat event object. teamNameOf
// maps the role 'home' / 'away' to the actual club name from the match.
function _resolveActor(event, teamNameOf) {
  if (!event) return { name: null, team: null, opponentTeam: null }

  const role = event.teamRole || null
  const teamFromRole = teamNameOf(role)
  const opponentFromRole = role === 'home' ? teamNameOf('away')
                         : role === 'away' ? teamNameOf('home')
                         : null

  switch (event.eventType) {
    case 'saved_shot':
      // For save events the loader already stamps teamRole as the KEEPER's
      // role (data/loader/parsers/events.py:_handle_saved_shot). So the
      // keeper's team comes straight from role. The "opponent" here is the
      // team that just took the shot.
      return {
        name:         event.goalKeeperDisplay || event.goalKeeperName || null,
        team:         teamFromRole,
        opponentTeam: opponentFromRole,
      }
    case 'goal':
      return {
        name:         event.scoringDisplay || event.scoringPlayerDisplay || event.playerDisplay || null,
        team:         teamFromRole,
        opponentTeam: opponentFromRole,
      }
    case 'card':
    case 'offside':
    case 'nutmeg':
    case 'spectacular_play':
      return {
        name:         event.playerDisplay || event.playerName || null,
        team:         teamFromRole,
        opponentTeam: opponentFromRole,
      }
    case 'substitution':
      // The "actor" we cite is the player coming on; the player going off
      // is secondary detail the AI can still pick up from event metadata.
      return {
        name:         event.playerInDisplay || event.playerInName || null,
        team:         teamFromRole,
        opponentTeam: opponentFromRole,
      }
    default:
      return {
        name:         event.playerDisplay || event.playerName || null,
        team:         teamFromRole,
        opponentTeam: opponentFromRole,
      }
  }
}

// Map of player display name (lowercased + trimmed) → authoritative team.
// The AI prompt uses this as the ONLY allowed source for team
// attributions, so a hallucinated "Neuer at Hamburger SV" can be
// detected and corrected by validating against this map.
function _buildPlayerDirectory(members, triggerEvent, teamNameOf) {
  const out = {}
  const add = (name, team) => {
    if (!name || !team) return
    const key = String(name).trim()
    if (!key) return
    out[key] = team
  }

  // Drafted players on each member's squad — team comes from teamRole on
  // the teamSelectionDetails entry written at squad-lock time.
  for (const m of (members || [])) {
    for (const p of (m.teamSelectionDetails || [])) {
      add(p.displayName, teamNameOf(p.teamRole))
    }
  }

  // The trigger event's actor — covers non-drafted players (the opposing
  // team's scorer for a conceded goal, etc.).
  const actor = _resolveActor(triggerEvent, teamNameOf)
  add(actor.name, actor.team)
  // For goal events also stamp the assister.
  if (triggerEvent?.eventType === 'goal' && triggerEvent.assistDisplay) {
    add(triggerEvent.assistDisplay, teamNameOf(triggerEvent.teamRole))
  }

  return out
}
