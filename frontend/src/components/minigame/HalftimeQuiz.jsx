import { useEffect, useRef, useState } from 'react'
import { pickFallbackQuestions } from '../../utils/quizFallback'

/**
 * HALFTIME_QUIZ game UI.
 *
 * 3 multiple-choice football questions. Each question gets 8 seconds.
 * Faster correct = more points. Streak bonus for consecutive correct.
 *
 * Inputs:
 *   config.questions: optional — AI Director sends generated questions.
 *                     Falls back to a static pool if missing/malformed.
 *   startedAtMs / durationMs: total window for the whole quiz (usually 25s).
 *   onSubmit({answers: [idx, idx, idx], timings: [ms, ms, ms]}) — called
 *     when all questions answered OR overall timer expires.
 *
 * Visual borrows from Plants vs Zombies card grids and Trivia Crack timing:
 *   - 4 chunky answer cards in 2×2 grid, club-tinted edges
 *   - Circular per-question countdown ring (8s)
 *   - Tap → card flips, all 4 reveal correctness, score chip flies up
 *   - Streak fire emoji 🔥 for consecutive correct
 *   - Tiny football mascot rolls in between questions
 */

// 12s per question gives users time to read the trivia properly and weigh
// answers without the wrong-button-mash feel of 8s. Total active phase:
// 3 × 12 = 36s + transitions = ~38s. Matches the durationMs in
// useMiniGame.GAME_DEFAULTS.HALFTIME_QUIZ.
const PER_Q_MS = 12000
const BETWEEN_MS = 900

const CATEGORY_ICON = {
  goals:     '⚽',
  cards:     '🟨',
  saves:     '🧤',
  stats:     '📊',
  fpl:       '🏆',
  rules:     '📜',
  positions: '🎯',
  history:   '🏟️',
  default:   '⚽',
}

export default function HalftimeQuiz({ config, durationMs, onSubmit }) {
  // Question lifecycle:
  //   1. Initial mount uses whatever is in config.questions right now —
  //      which is the local fallback set pre-filled by useMiniGame's
  //      frontend trigger (so the modal renders instantly without
  //      waiting for the backend).
  //   2. ~500ms later the backend's `minigame_start` arrives with AI
  //      questions and useMiniGame's upgrade path updates state.config.
  //      The upgrade effect below swaps them in — but ONLY while the
  //      user hasn't started answering (`lockedRef === false`). After
  //      the first tap, the questions are frozen so a late-arriving
  //      broadcast can't shuffle mid-quiz.
  //
  // Previous version used `useMemoOnce` which baked the fallback into
  // a ref on first render and never re-derived. End result: the AI
  // questions reached the WS but the UI rendered the fallback forever.
  const [questions, setQuestions] = useState(() => deriveQuestions(config))
  const lockedRef = useRef(false)

  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [timings, setTimings] = useState([])
  const [picked, setPicked] = useState(null)         // index just tapped — locks the grid
  const [showResult, setShowResult] = useState(false) // brief 700ms reveal between Qs
  const [streak, setStreak] = useState(0)
  const [pointsFly, setPointsFly] = useState(null)   // {value, key} for the +N popup
  const submittedRef = useRef(false)

  // One-shot upgrade: when AI questions arrive after mount via the
  // useMiniGame `minigame_start` handler, swap them in here. Gated on
  // lockedRef so a hypothetical late broadcast after the user starts
  // answering is ignored. The cheap identity check on prev[0]?.q vs
  // next[0]?.q avoids a state-churn re-render when the same fallback
  // set passes through repeatedly.
  useEffect(() => {
    if (lockedRef.current) return
    const next = deriveQuestions(config)
    setQuestions(prev => (prev[0]?.q === next[0]?.q ? prev : next))
  }, [config?.questions])

  // Lock the question set the instant the user starts interacting. The
  // parent's upgrade gate (useMiniGame.js:433-451) also stops firing
  // once submittedRef is true, but we re-assert here so a malformed
  // late broadcast that somehow slips past the parent gate still
  // doesn't reshuffle the active quiz.
  useEffect(() => {
    if (qIndex > 0 || picked !== null) lockedRef.current = true
  }, [qIndex, picked])

  const qStartMsRef = useRef(Date.now())
  const [now, setNow] = useState(Date.now())

  // Per-question countdown tick.
  useEffect(() => {
    qStartMsRef.current = Date.now()
    setPicked(null)
    setShowResult(false)
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [qIndex])

  // Auto-expire current question if user doesn't tap in PER_Q_MS.
  useEffect(() => {
    const t = setTimeout(() => {
      if (picked === null && !showResult) {
        _handlePick(-1) // treated as wrong; preserves timing of "didn't answer"
      }
    }, PER_Q_MS)
    return () => clearTimeout(t)
  }, [qIndex])

  // Final submit when all questions answered.
  useEffect(() => {
    if (submittedRef.current) return
    if (answers.length === questions.length) {
      submittedRef.current = true
      // Tiny delay so the last "Result" reveal is visible before the modal
      // transitions to the resolved/result panel.
      setTimeout(() => onSubmit({ answers, timings, questions }), 400)
    }
  }, [answers, questions.length])

  function _handlePick(idx) {
    if (picked !== null) return
    const elapsed = Date.now() - qStartMsRef.current
    setPicked(idx)
    const q = questions[qIndex]
    const correct = idx === q.correctIdx
    const remaining = Math.max(0, PER_Q_MS - elapsed)
    // Tiered scoring scaled to PER_Q_MS — first third = max, middle = mid,
    // last third = consolation.
    const base = !correct
      ? 0
      : remaining >= PER_Q_MS * 2 / 3 ? 5
      : remaining >= PER_Q_MS / 3     ? 3
      : 1
    const streakBonus = correct ? Math.min(streak, 2) : 0
    const total = base + streakBonus
    setStreak(s => correct ? s + 1 : 0)
    if (total > 0) {
      setPointsFly({ value: total, key: `${qIndex}-${Date.now()}` })
      setTimeout(() => setPointsFly(null), 800)
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(correct ? 12 : 6) } catch {}
    }

    setShowResult(true)
    setAnswers(a => [...a, idx])
    setTimings(t => [...t, elapsed])

    setTimeout(() => {
      if (qIndex + 1 < questions.length) {
        setQIndex(i => i + 1)
      }
    }, BETWEEN_MS)
  }

  const q = questions[qIndex]
  const elapsed = now - qStartMsRef.current
  const remaining = Math.max(0, PER_Q_MS - elapsed)
  const progress = 1 - remaining / PER_Q_MS

  return (
    <div className="select-none">
      {/* Header: progress dots + circular countdown */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {questions.map((_, i) => {
            const state = i < qIndex ? (answers[i] === questions[i].correctIdx ? 'correct' : 'wrong')
                       : i === qIndex ? 'current' : 'pending'
            const bg = state === 'correct' ? 'bg-emerald-400'
                    : state === 'wrong'   ? 'bg-red-400'
                    : state === 'current' ? 'bg-white'
                    : 'bg-white/20'
            const ring = state === 'current' ? 'ring-2 ring-white/40' : ''
            return <div key={i} className={`w-2.5 h-2.5 rounded-full ${bg} ${ring}`} />
          })}
          <span className="ml-2 text-[10px] text-gray-500 uppercase tracking-wider">
            Q{qIndex + 1}/{questions.length}
          </span>
        </div>

        {/* Circular 8s countdown */}
        <CountdownRing remaining={remaining} progress={progress} />
      </div>

      {/* Streak indicator */}
      {streak >= 2 && (
        <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-orange-400">
          <span>🔥</span><span>STREAK ×{streak}</span>
        </div>
      )}

      {/* Question text */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 mb-3 relative overflow-hidden">
        <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">
          {CATEGORY_ICON[q.category] || CATEGORY_ICON.default} {q.category || 'football'}
        </p>
        <p className="text-white text-sm font-bold leading-snug">{q.q}</p>
        {pointsFly && (
          <div
            className="absolute top-2 right-3 text-emerald-300 font-black text-lg pointer-events-none"
            style={{ animation: 'quizFly 800ms ease-out forwards' }}
          >
            +{pointsFly.value}
          </div>
        )}
      </div>

      {/* 2×2 answer card grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {q.choices.map((choice, i) => {
          const letter = ['A', 'B', 'C', 'D'][i]
          const isCorrect = i === q.correctIdx
          const isPicked = picked === i
          const revealed = picked !== null
          const cardBg = !revealed
            ? 'bg-gradient-to-br from-slate-700/60 to-slate-800/80 border-white/10 hover:border-white/30'
            : isCorrect
              ? 'bg-gradient-to-br from-emerald-500/40 to-emerald-700/40 border-emerald-400'
              : isPicked
                ? 'bg-gradient-to-br from-red-500/40 to-red-800/40 border-red-400'
                : 'bg-slate-800/40 border-white/5 opacity-60'
          return (
            <button
              key={i}
              type="button"
              onClick={() => _handlePick(i)}
              disabled={picked !== null}
              className={`
                relative rounded-xl border-2 px-3 py-3 text-left transition-all duration-200
                active:scale-95 ${cardBg}
                ${!revealed ? 'cursor-pointer' : 'cursor-default'}
              `}
              style={{ minHeight: 70 }}
            >
              <span className="absolute top-1.5 left-2 text-[9px] font-black tracking-widest text-white/40">
                {letter}
              </span>
              {revealed && isCorrect && (
                <span className="absolute top-1.5 right-2 text-emerald-300 text-xs">✓</span>
              )}
              {revealed && isPicked && !isCorrect && (
                <span className="absolute top-1.5 right-2 text-red-300 text-xs">✗</span>
              )}
              <p className="text-white text-[12px] font-bold leading-snug mt-3.5">
                {choice}
              </p>
            </button>
          )
        })}
      </div>

      {/* Footer hint */}
      <p className="text-center text-gray-500 text-[10px] mt-3">
        Tap an answer · faster correct = more points · streak bonus stacks
      </p>

      {/* CSS animation for the +N popup */}
      <style>{`
        @keyframes quizFly {
          0%   { opacity: 0; transform: translateY(0) scale(0.6); }
          15%  { opacity: 1; transform: translateY(-2px) scale(1.2); }
          100% { opacity: 0; transform: translateY(-28px) scale(0.9); }
        }
      `}</style>
    </div>
  )
}

function CountdownRing({ remaining, progress }) {
  const SIZE = 36
  const RADIUS = 15
  const CIRC = 2 * Math.PI * RADIUS
  const dash = CIRC * (1 - progress)
  // Colour bands scale to PER_Q_MS: top third green, middle amber,
  // last third red. Matches the scoring brackets above.
  const color = remaining > PER_Q_MS * 2 / 3 ? '#10b981'
              : remaining > PER_Q_MS / 3     ? '#f59e0b'
              : '#ef4444'
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none"
          stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 100ms linear, stroke 200ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-black text-white tabular-nums">
          {Math.ceil(remaining / 1000)}
        </span>
      </div>
    </div>
  )
}

// Schema-check + fallback for the question set. Pulled out of the
// component so the initial `useState` factory and the upgrade `useEffect`
// share identical derivation logic. Returns AI-supplied questions when
// `config.questions` passes the schema check, otherwise returns a fresh
// fallback set (`pickFallbackQuestions` reshuffles each call — that's
// why the caller stores the result in state, not in a memo that re-runs
// on every render).
function deriveQuestions(config) {
  const provided = Array.isArray(config?.questions) ? config.questions : null
  const valid = provided?.every(q =>
    q && typeof q.q === 'string'
    && Array.isArray(q.choices) && q.choices.length === 4
    && Number.isInteger(q.correctIdx) && q.correctIdx >= 0 && q.correctIdx < 4
  )
  return (valid && provided.length >= 1) ? provided.slice(0, 3) : pickFallbackQuestions(3)
}
