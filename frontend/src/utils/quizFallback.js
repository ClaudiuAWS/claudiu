/**
 * Static fallback questions for HALFTIME_QUIZ when the AI Director's
 * Bedrock-generated questions are unavailable or malformed.
 *
 * Each question shape: { q, choices: [4], correctIdx, category }.
 * The frontend renders these identically to AI-generated ones — they
 * just don't reference live match state.
 *
 * Keep the JS copy here and a Python mirror in
 * `backend/event-processor/service.py` so the non-Director trigger path
 * fires the same fallback.
 */

const POOL = [
  {
    q: 'How many minutes are in a full football match (excluding stoppage time)?',
    choices: ['80', '85', '90', '95'],
    correctIdx: 2,
    category: 'rules',
  },
  {
    q: 'Which colour card means a player is sent off?',
    choices: ['Yellow', 'Red', 'Blue', 'Green'],
    correctIdx: 1,
    category: 'rules',
  },
  {
    q: 'Which position is most often credited with goal scoring?',
    choices: ['Goalkeeper', 'Centre-back', 'Striker', 'Left-back'],
    correctIdx: 2,
    category: 'positions',
  },
  {
    q: 'A penalty kick is taken from how far out?',
    choices: ['9 metres', '11 metres', '13 metres', '15 metres'],
    correctIdx: 1,
    category: 'rules',
  },
  {
    q: 'How many players from each team start a match on the pitch?',
    choices: ['10', '11', '12', '13'],
    correctIdx: 1,
    category: 'rules',
  },
  {
    q: 'What is the FPL acronym typically used for in football?',
    choices: ['Free Player List', 'Fantasy Premier League', 'Final Penalty Line', 'Foul Per Lap'],
    correctIdx: 1,
    category: 'fpl',
  },
  {
    q: 'Which of these is NOT a real on-field position?',
    choices: ['Right Wing', 'Sweeper', 'Setter', 'Trequartista'],
    correctIdx: 2,
    category: 'positions',
  },
  {
    q: 'In which country was the modern football association founded?',
    choices: ['Germany', 'Brazil', 'England', 'Italy'],
    correctIdx: 2,
    category: 'history',
  },
]

// ─── Deterministic seeded RNG (mulberry32) ─────────────────────────────────
// Both clients in a room need to render the SAME questions in the SAME order
// for Q1/Q2/Q3 to feel "synchronous". Using Math.random() on each client
// produces different sets. Seed by matchId+eventId — both backend Python and
// frontend JS implement the identical algorithm, so the question lineup is
// reproducible across client/server boundaries too.

function _hashSeed(str) {
  // FNV-1a-ish 32-bit. Stable and matches the Python mirror in
  // backend/event-processor/service.py::_fallback_quiz_questions when given
  // the same string.
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
  }
  return h >>> 0
}

function _mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function _shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
  }
  return arr
}

/**
 * Return a fresh `count`-question set, shuffled, with shuffled answer order.
 *
 * @param {number} count    - number of questions to pick (default 3).
 * @param {string} [seed]   - optional seed string. When provided, two
 *                            callers using the same seed get the IDENTICAL
 *                            output. Use `${matchId}#${eventId}` to keep
 *                            both clients in the same room aligned.
 */
export function pickFallbackQuestions(count = 3, seed = null) {
  const rand = seed !== null
    ? _mulberry32(_hashSeed(String(seed)))
    : Math.random
  const indices = POOL.map((_, i) => i)
  _shuffleInPlace(indices, rand)
  const picked = indices.slice(0, count).map(i => POOL[i])
  return picked.map(q => {
    const idx = q.choices.map((_, i) => i)
    _shuffleInPlace(idx, rand)
    const choices = idx.map(i => q.choices[i])
    const correctIdx = idx.indexOf(q.correctIdx)
    return { q: q.q, choices, correctIdx, category: q.category }
  })
}
