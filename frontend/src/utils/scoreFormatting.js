/**
 * Shared scoring presentation helpers.
 *
 * Backend emits a free-text `reason` string on every score-change event
 * ("scored for your squad", "penalty save", "yellow card", "reacted to
 * nutmeg", etc). The frontend toast, the leaderboard activity timeline,
 * and the mini-game result panel all want the same emoji + colour palette
 * keyed off that reason — keeping the mapping in one place stops them
 * drifting apart.
 *
 * Match is case-insensitive substring against the reason. Fallback to
 * delta sign so unknown reasons still get a sensible icon.
 */

// Emoji set leans into game-show / arcade vibes — bigger, more expressive
// symbols over the generic football iconography (🟨/🟥). Goal + save keep
// the iconic ⚽/🧤 because football fans pattern-match those instantly;
// everything else is dialled up for fun. ORDER MATTERS — earlier matchers
// win, so the more specific reasons ('conceded', 'closest', 'penalty save')
// come before the broad ones ('goal', 'save').
const REASON_MATCHERS = [
  { key: 'conceded',     test: r => r.includes('conced'),                        icon: '💥', cls: 'rose' },
  { key: 'penalty-save', test: r => r.includes('penalty') && r.includes('save'), icon: '🧤', cls: 'sky' },
  { key: 'penalty-goal', test: r => r.includes('penalty') && r.includes('goal'), icon: '⚽', cls: 'emerald' },
  { key: 'penalty',      test: r => r.includes('penalty'),                       icon: '🎯', cls: 'emerald' },
  { key: 'goal',         test: r => r.includes('goal') || r.includes('scored'),  icon: '⚽', cls: 'emerald' },
  { key: 'save',         test: r => r.includes('save'),                          icon: '🧤', cls: 'sky' },
  { key: 'assist',       test: r => r.includes('assist'),                        icon: '🪄', cls: 'cyan' },
  { key: 'yellow',       test: r => r.includes('yellow') || r.includes('book'),  icon: '🟨', cls: 'amber' },
  { key: 'red',          test: r => r.includes('red') || r.includes('sent off'), icon: '🟥', cls: 'rose' },
  { key: 'nutmeg',       test: r => r.includes('nutmeg'),                        icon: '🌀', cls: 'violet' },
  { key: 'spectacular',  test: r => r.includes('spectacular'),                   icon: '💫', cls: 'fuchsia' },
  { key: 'offside',      test: r => r.includes('offside'),                       icon: '🚩', cls: 'orange' },
  { key: 'quiz',         test: r => r.includes('quiz'),                          icon: '🧠', cls: 'indigo' },
  { key: 'closest',      test: r => r.includes('closest'),                       icon: '🎯', cls: 'cyan' },
  { key: 'reaction',     test: r => r.includes('react'),                         icon: '⚡', cls: 'violet' },
]

function _match(reason) {
  const r = (reason || '').toLowerCase()
  for (const m of REASON_MATCHERS) {
    if (m.test(r)) return m
  }
  return null
}

export function scoreIcon(reason, delta = 0) {
  const m = _match(reason)
  if (m) return m.icon
  return delta > 0 ? '⭐' : delta < 0 ? '⚠️' : '•'
}

/**
 * Returns a Tailwind colour family name (e.g. 'emerald') for the event.
 * Callers compose the full class string (gradient, border, text) since
 * Tailwind's JIT needs literal class names to survive purge.
 */
export function scoreEventClass(reason, delta = 0) {
  const m = _match(reason)
  if (m) return m.cls
  return delta > 0 ? 'emerald' : delta < 0 ? 'rose' : 'slate'
}

/**
 * Pre-baked Tailwind class strings per event class. Tailwind's JIT can't
 * see template-string-built class names, so we list every combination
 * literally. Add new event classes here when extending REASON_MATCHERS.
 */
export const EVENT_STYLES = {
  emerald: {
    ring:     'bg-emerald-500/20 ring-emerald-400/40',
    text:     'text-emerald-300',
    delta:    'text-emerald-300',
    gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
    border:   'border-emerald-400/30',
  },
  sky: {
    ring:     'bg-sky-500/20 ring-sky-400/40',
    text:     'text-sky-300',
    delta:    'text-sky-300',
    gradient: 'from-sky-500/20 via-sky-500/10 to-transparent',
    border:   'border-sky-400/30',
  },
  cyan: {
    ring:     'bg-cyan-500/20 ring-cyan-400/40',
    text:     'text-cyan-300',
    delta:    'text-cyan-300',
    gradient: 'from-cyan-500/20 via-cyan-500/10 to-transparent',
    border:   'border-cyan-400/30',
  },
  amber: {
    ring:     'bg-amber-500/20 ring-amber-400/40',
    text:     'text-amber-300',
    delta:    'text-amber-300',
    gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
    border:   'border-amber-400/30',
  },
  rose: {
    ring:     'bg-rose-500/20 ring-rose-400/40',
    text:     'text-rose-300',
    delta:    'text-rose-300',
    gradient: 'from-rose-500/20 via-rose-500/10 to-transparent',
    border:   'border-rose-400/30',
  },
  violet: {
    ring:     'bg-violet-500/20 ring-violet-400/40',
    text:     'text-violet-300',
    delta:    'text-violet-300',
    gradient: 'from-violet-500/20 via-violet-500/10 to-transparent',
    border:   'border-violet-400/30',
  },
  fuchsia: {
    ring:     'bg-fuchsia-500/20 ring-fuchsia-400/40',
    text:     'text-fuchsia-300',
    delta:    'text-fuchsia-300',
    gradient: 'from-fuchsia-500/20 via-fuchsia-500/10 to-transparent',
    border:   'border-fuchsia-400/30',
  },
  orange: {
    ring:     'bg-orange-500/20 ring-orange-400/40',
    text:     'text-orange-300',
    delta:    'text-orange-300',
    gradient: 'from-orange-500/20 via-orange-500/10 to-transparent',
    border:   'border-orange-400/30',
  },
  indigo: {
    ring:     'bg-indigo-500/20 ring-indigo-400/40',
    text:     'text-indigo-300',
    delta:    'text-indigo-300',
    gradient: 'from-indigo-500/20 via-indigo-500/10 to-transparent',
    border:   'border-indigo-400/30',
  },
  slate: {
    ring:     'bg-slate-500/20 ring-slate-400/40',
    text:     'text-slate-300',
    delta:    'text-slate-300',
    gradient: 'from-slate-500/20 via-slate-500/10 to-transparent',
    border:   'border-slate-400/30',
  },
}

export function styleForReason(reason, delta = 0) {
  return EVENT_STYLES[scoreEventClass(reason, delta)] || EVENT_STYLES.slate
}

export function formatDelta(delta) {
  const n = Number(delta) || 0
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}
