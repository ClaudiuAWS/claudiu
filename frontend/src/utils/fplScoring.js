// Mirror of backend/event-processor/service.py::_calculate_member_changes.
// Pure function used to OPTIMISTICALLY bump the leaderboard the moment a
// scoring event reveals on the frontend's clock — without waiting for the
// backend WS round-trip (1–24s with cold starts). The authoritative
// score_update WS reconciles to the DDB value when it arrives.
//
// Keep these rules in sync with the backend. If they ever diverge, the WS
// reconciliation will correct the user's view, but a brief flicker may
// occur. Add new event types here AND in the backend.

const GK_CODES  = new Set(['TW'])
const DEF_CODES = new Set(['IVL', 'IVR', 'IVZ', 'IV', 'LV', 'RV'])
const FWD_CODES = new Set(['ST', 'STZ', 'STL', 'STR', 'MS', 'LF', 'RF', 'LA', 'RA'])

const GOAL_VALUE = { GK: 10, DEF: 6, MID: 5, FWD: 4 }

function bucket(positionCode) {
  if (!positionCode) return 'MID'
  const code = String(positionCode).toUpperCase()
  if (GK_CODES.has(code))  return 'GK'
  if (DEF_CODES.has(code)) return 'DEF'
  if (FWD_CODES.has(code)) return 'FWD'
  return 'MID'
}

/**
 * Compute per-user score deltas for a single match event.
 *
 * @param {object} event   - flat event from useMatch's allEvents
 * @param {object[]} members - room members with teamSelectionDetails / teamSelection
 * @returns {{userId: string, delta: number, reason: string, playerName: string}[]}
 *          Only entries with non-zero delta. Empty array means no scoring impact.
 */
export function computeOptimisticDeltas(event, members) {
  if (!event || !members?.length) return []
  const type = event.eventType
  if (!['goal', 'card', 'saved_shot'].includes(type)) return []

  const out = []

  if (type === 'goal') {
    const scoringPid     = event.scoringPlayerId
    const scoringDisplay = event.scoringDisplay || event.scoringPlayerDisplay || ''
    const scoringPos     = event.position // German code on the goal payload
    const assistPid      = event.assistPlayerId
    const assistDisplay  = event.assistDisplay || event.assistPlayerDisplay || ''
    const scoringRole    = event.scoringTeamRole

    const goalValue = GOAL_VALUE[bucket(scoringPos)]

    for (const m of members) {
      const details = {}
      for (const d of (m.teamSelectionDetails || [])) details[d.playerId] = d
      // Captain multiplier — must mirror backend/event-processor/service.py
      // _calculate_member_changes. Without this the optimistic delta
      // disagrees with the WS broadcast and the dedup misfires.
      const captain = m.captainPlayerId || ''
      // Triple-captain perk (armed at squad-lock time) bumps the
      // multiplier from ×2 to ×3 for the duration of the match. Same
      // gate as the backend so the dedup-fingerprint stays in sync.
      const armedPerks = new Set(m.armedPerks || [])
      const capMult = armedPerks.has('captain-triple') ? 3 : 2

      // Per-component entries — one row per (scorer | assist | conceded)
      // so the score timeline shows the full breakdown instead of one
      // bundled "+10 Pavlović" line that hides the assist + conceded math.
      // Total leaderboard bump is identical (room.members[*].score sums
      // every delta) — only visibility changes.
      if (scoringPid && details[scoringPid]) {
        const d = goalValue * (captain === scoringPid ? capMult : 1)
        out.push({
          userId: m.userId, delta: d,
          reason: 'scored for your squad',
          playerName: scoringDisplay,
          component: 'scorer',
        })
      }
      if (assistPid && details[assistPid]) {
        const d = 3 * (captain === assistPid ? capMult : 1)
        out.push({
          userId: m.userId, delta: d,
          reason: 'assisted for your squad',
          playerName: assistDisplay,
          component: 'assist',
        })
      }
      if (scoringRole) {
        const oppRole = scoringRole === 'home' ? 'away' : 'home'
        const concedingGK = Object.values(details).find(
          d => d.position === 'TW' && d.teamRole === oppRole
        )
        if (concedingGK) {
          const gkPid = concedingGK.playerId || ''
          const d = -1 * (captain && captain === gkPid ? capMult : 1)
          out.push({
            userId: m.userId, delta: d,
            reason: 'conceded',
            // select_team persists displayName on each teamSelectionDetails
            // entry (since the keeper-name fix). Fall back to the generic
            // label only for legacy rooms saved before that schema bump.
            playerName: concedingGK.displayName || 'your keeper',
            component: 'concede',
          })
        }
      }
    }
  } else if (type === 'card') {
    const playerId      = event.playerId
    const playerDisplay = event.playerDisplay || ''
    const cardColor     = String(event.cardColor || '').toLowerCase()
    if (!['yellow', 'red'].includes(cardColor)) return []
    const verb      = cardColor === 'yellow' ? 'booked' : 'sent off'
    const magnitude = cardColor === 'yellow' ? -1 : -3

    for (const m of members) {
      const selection = new Set(m.teamSelection || [])
      const captain   = m.captainPlayerId || ''
      const capMult   = new Set(m.armedPerks || []).has('captain-triple') ? 3 : 2
      if (playerId && selection.has(playerId)) {
        const delta = magnitude * (captain === playerId ? capMult : 1)
        out.push({ userId: m.userId, delta, reason: verb, playerName: playerDisplay })
      }
    }
  } else if (type === 'saved_shot') {
    const gkId      = event.goalKeeperId
    const gkDisplay = event.goalKeeperDisplay || ''
    for (const m of members) {
      const ownsGK  = (m.teamSelectionDetails || []).some(d => d.playerId === gkId)
      const captain = m.captainPlayerId || ''
      const capMult = new Set(m.armedPerks || []).has('captain-triple') ? 3 : 2
      if (gkId && ownsGK) {
        const delta = 2 * (captain === gkId ? capMult : 1)
        out.push({ userId: m.userId, delta, reason: 'made a save', playerName: gkDisplay })
      }
    }
  }

  return out
}
