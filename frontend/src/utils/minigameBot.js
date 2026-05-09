/**
 * Solo-mode bot + score-delta computation for mini-games.
 *
 * The bot fills the opponent slot when only one human is in the room. Per
 * FEATURES.md §R8 spec: each game type has its own delay/accuracy profile so
 * solo testing feels like a real opponent rather than free wins.
 *
 * Score deltas follow §R3-R6 brackets but scaled down so they slot alongside
 * the existing passive-scoring values (+5 goal / +3 assist / +3 save / -1
 * yellow). Mini-game points should feel meaningful but not eclipse the
 * passive scoring; spec target values (+100 / +50) are deferred to a follow-
 * up plan that re-tunes the whole point economy.
 */

// ─── Solo bot ────────────────────────────────────────────────────────────────

export function runSoloBot(state, onSubmit) {
  if (state.gameType === 'OFFSIDE_REFLEX') {
    return _offsideReflexBot(state, onSubmit)
  }
  // Stubs for future game types — bot just no-ops, so scoring will fall
  // through to "user-only" deltas (still works but no opponent).
  return { cancel: () => {} }
}

function _offsideReflexBot(state, onSubmit) {
  // Per spec: random tap within ±800ms of the true offside moment, accurate
  // ~50% of the time. Delay to react: 400-1800ms after game start.
  const moment = state.config?.offsideMomentMs ?? state.durationMs / 2
  const accurate = Math.random() < 0.5
  const jitter = accurate
    ? (Math.random() * 300 - 150)         // ±150ms accurate
    : (Math.random() * 1200 - 600)        // ±600ms inaccurate
  const reactionDelay = 400 + Math.random() * 1400
  const tapAt = Math.max(50, Math.min(state.durationMs - 50, moment + jitter))
  const fireAfter = Math.max(reactionDelay, tapAt + 30)

  const id = setTimeout(() => onSubmit({ clickedAt: tapAt }), fireAfter)
  return { cancel: () => clearTimeout(id) }
}

// ─── Score-delta computation ────────────────────────────────────────────────

export function computeScoreDeltas({ gameType, config, ownership, userId, userPayload, botPayload, members }) {
  if (gameType === 'OFFSIDE_REFLEX') {
    return _offsideReflexDeltas({ config, ownership, userId, userPayload, botPayload, members })
  }
  return []
}

function _offsideReflexDeltas({ config, ownership, userId, userPayload, botPayload, members }) {
  // Fall back to the same default OffsideReflex.jsx uses for the dot
  // animation. Without this, AI-driven games where Nova Micro omitted
  // offsideMomentMs from its config would compute moment=0, making every
  // tap "thousands of ms late" against an unrealistic reference and
  // awarding 0 points even on perfect taps.
  const moment = config?.offsideMomentMs ?? Math.floor((config?.durationMs ?? 8000) / 2)
  const ownsOffsidePlayer = ownership?.advantagedUserId === userId

  const userDelta = userPayload
    ? _bracketScore(Math.abs((userPayload.clickedAt ?? 1e9) - moment), ownsOffsidePlayer)
    : 0

  // Bot opponent: synthetic userId. We pick the *other* member if there is
  // one, otherwise use 'bot' as a placeholder. Backend won't error on an
  // unknown userId — it just skips applying the delta.
  const botUserId = (members || []).find(m => m.userId !== userId)?.userId || 'bot'
  const botOwns = ownership?.advantagedUserId === botUserId
  const botDelta = botPayload
    ? _bracketScore(Math.abs((botPayload.clickedAt ?? 1e9) - moment), botOwns)
    : 0

  const deltas = []
  if (userDelta) deltas.push({ userId,    delta: userDelta, reason: 'offside reflex' })
  if (botDelta && botUserId !== 'bot') deltas.push({ userId: botUserId, delta: botDelta, reason: 'offside reflex' })

  // Closest-user bonus: +1 to whoever was nearer the true moment (scaled
  // down from spec's +50 to fit the existing point economy).
  const userAbs = userPayload ? Math.abs((userPayload.clickedAt ?? 1e9) - moment) : Infinity
  const botAbs  = botPayload  ? Math.abs((botPayload.clickedAt  ?? 1e9) - moment) : Infinity
  if (userAbs < botAbs && userPayload) {
    const u = deltas.find(d => d.userId === userId)
    if (u) u.delta += 1
    else deltas.push({ userId, delta: 1, reason: 'closest tap' })
  } else if (botAbs < userAbs && botPayload && botUserId !== 'bot') {
    const b = deltas.find(d => d.userId === botUserId)
    if (b) b.delta += 1
    else deltas.push({ userId: botUserId, delta: 1, reason: 'closest tap' })
  }

  return deltas
}

// Spec brackets (scaled): ≤150ms = +6, ≤300ms = +4, ≤600ms = +2, else 0.
// Owners of the offside player: +1 recovery if they reacted accurately
// (would otherwise have nothing to gain since their player got caught).
function _bracketScore(deltaMs, ownsOffsidePlayer) {
  if (deltaMs <= 150) return 6
  if (deltaMs <= 300) return 4
  if (deltaMs <= 600) return 2
  if (ownsOffsidePlayer && deltaMs <= 1000) return 1
  return 0
}
