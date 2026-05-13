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
  if (state.gameType === 'PENALTY_SHOOTOUT') {
    return _penaltyShootoutBot(state, onSubmit)
  }
  if (state.gameType === 'HALFTIME_QUIZ') {
    return _halftimeQuizBot(state, onSubmit)
  }
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
  if (gameType === 'PENALTY_SHOOTOUT') {
    return _penaltyShootoutDeltas({ config, ownership, userId, userPayload, botPayload, members })
  }
  if (gameType === 'HALFTIME_QUIZ') {
    return _halftimeQuizDeltas({ config, ownership, userId, userPayload, botPayload, members })
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

// ─── PENALTY_SHOOTOUT ───────────────────────────────────────────────────────

// Solo bot for penalty shootout: picks a random corner, weighted slightly
// against the user's likely pick so it doesn't always save / always concede.
function _penaltyShootoutBot(state, onSubmit) {
  const zones = ['TL', 'TM', 'TR', 'BL', 'BR']
  // Keepers irl pick corners more than middle — weight 30% middle, 70% corners.
  const weights = [0.225, 0.15, 0.225, 0.2, 0.2]
  const r = Math.random()
  let acc = 0
  let pick = 'TL'
  for (let i = 0; i < zones.length; i++) {
    acc += weights[i]
    if (r <= acc) { pick = zones[i]; break }
  }
  // Bot is whatever role the user isn't.
  const botRole = state._userRole === 'shooter' ? 'keeper' : 'shooter'
  const reactionMs = 600 + Math.random() * 2500
  const id = setTimeout(() => onSubmit({ zone: pick, role: botRole, submittedAtMs: reactionMs }), reactionMs)
  return { cancel: () => clearTimeout(id) }
}

// Zone → shooter goal value if it goes in.
const PEN_GOAL_POINTS = { TL: 8, TR: 8, BL: 6, BR: 6, TM: 4 }
const PEN_SAVE_POINTS = 5

function _penaltyShootoutDeltas({ ownership, userId, userPayload, botPayload, members }) {
  // Roles. The component sets payload.role from the user's POV. The opponent
  // (other user or bot) is implicit. We rebuild a {shooterPayload, keeperPayload}
  // pair from whatever we got.
  const userRole = userPayload?.role || _defaultRoleForUser(userId, ownership)
  const oppPayload = botPayload || null
  const oppId = (members || []).find(m => m.userId !== userId)?.userId || 'bot'

  let shooterPayload, shooterId, keeperPayload, keeperId
  if (userRole === 'shooter') {
    shooterPayload = userPayload; shooterId = userId
    keeperPayload  = oppPayload;  keeperId  = oppId
  } else {
    shooterPayload = oppPayload;  shooterId = oppId
    keeperPayload  = userPayload; keeperId  = userId
  }

  // If shooter never committed: no goal, no save → 0 to both.
  if (!shooterPayload?.zone) return []

  // Keeper guessed correctly?
  const saved = !!(keeperPayload?.zone) && keeperPayload.zone === shooterPayload.zone
  const deltas = []
  if (saved) {
    if (keeperId && keeperId !== 'bot') {
      deltas.push({ userId: keeperId, delta: PEN_SAVE_POINTS, reason: 'penalty save', playerName: '' })
    }
  } else {
    const pts = PEN_GOAL_POINTS[shooterPayload.zone] ?? 4
    if (shooterId && shooterId !== 'bot') {
      deltas.push({ userId: shooterId, delta: pts, reason: 'penalty goal', playerName: '' })
    }
  }
  return deltas
}

function _defaultRoleForUser(userId, ownership) {
  // Owner of the penalty taker is shooter; everyone else is keeper.
  if (ownership?.advantagedUserId === userId) return 'shooter'
  return 'keeper'
}

// ─── HALFTIME_QUIZ ─────────────────────────────────────────────────────────

// Solo bot: answers each question with ~55% accuracy. Mid-range timing.
function _halftimeQuizBot(state, onSubmit) {
  const questions = state.config?.questions || []
  const answers = []
  const timings = []
  for (const q of questions) {
    const correct = Math.random() < 0.55
    const idx = correct ? q.correctIdx : _randomWrongIdx(q.correctIdx, q.choices?.length ?? 4)
    answers.push(idx)
    timings.push(2500 + Math.random() * 3500)  // 2.5–6s per question
  }
  // Bot submits all answers once after a realistic total delay.
  const fireMs = 4000 + Math.random() * 4000
  const id = setTimeout(() => onSubmit({ answers, timings, questions, role: 'bot' }), fireMs)
  return { cancel: () => clearTimeout(id) }
}

function _randomWrongIdx(correctIdx, n) {
  const opts = []
  for (let i = 0; i < n; i++) if (i !== correctIdx) opts.push(i)
  return opts[Math.floor(Math.random() * opts.length)]
}

function _scoreQuizPayload(payload, questions) {
  if (!payload?.answers || !questions?.length) return 0
  let total = 0
  let streak = 0
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const ans = payload.answers[i]
    const elapsed = payload.timings?.[i] ?? 8000
    const correct = ans === q.correctIdx
    if (!correct) { streak = 0; continue }
    const remaining = Math.max(0, 8000 - elapsed)
    const base = remaining >= 6000 ? 5
              : remaining >= 3000 ? 3
              : 1
    const streakBonus = Math.min(streak, 2)
    total += base + streakBonus
    streak += 1
  }
  return total
}

function _halftimeQuizDeltas({ config, userId, userPayload, botPayload, members }) {
  const questions = userPayload?.questions || botPayload?.questions || config?.questions || []
  const deltas = []
  if (userPayload?.answers) {
    const pts = _scoreQuizPayload(userPayload, questions)
    if (pts > 0) deltas.push({ userId, delta: pts, reason: 'halftime quiz', playerName: '' })
  }
  if (botPayload?.answers) {
    const botUserId = (members || []).find(m => m.userId !== userId)?.userId || 'bot'
    if (botUserId !== 'bot') {
      const pts = _scoreQuizPayload(botPayload, questions)
      if (pts > 0) deltas.push({ userId: botUserId, delta: pts, reason: 'halftime quiz', playerName: '' })
    }
  }
  return deltas
}
