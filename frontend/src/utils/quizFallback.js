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

/**
 * Return a fresh 3-question set, shuffled, with shuffled answer order.
 * The component renders whatever it gets — shuffling here means each
 * match's halftime quiz feels different without re-running this twice
 * on different clients (call this on the AI Director / event-processor
 * side ONCE; both clients receive the same shuffled config).
 */
export function pickFallbackQuestions(count = 3) {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5).slice(0, count)
  return shuffled.map(q => {
    // Shuffle answer order while preserving correctIdx.
    const idx = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5)
    const choices = idx.map(i => q.choices[i])
    const correctIdx = idx.indexOf(q.correctIdx)
    return { q: q.q, choices, correctIdx, category: q.category }
  })
}
