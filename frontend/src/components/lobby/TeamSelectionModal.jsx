import { useState, useEffect } from 'react'
import { matchesApi, roomsApi } from '../../services/api'
import toast from 'react-hot-toast'

// ─── Position → group ────────────────────────────────────────────────────────

const POS_TO_GROUP = {
  TW:  'GK',
  IVR: 'DEF', IVL: 'DEF', IVZ: 'DEF', RV: 'DEF', LV: 'DEF',
  DMZ: 'MID', DMR: 'MID', DML: 'MID', DRM: 'MID', DLM: 'MID',
  ZO:  'MID', OLM: 'MID', ORM: 'MID',
  LA:  'FWD', RA: 'FWD', STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}

const GROUP_META = {
  GK:  { label: 'GK',  color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  DEF: { label: 'DEF', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  MID: { label: 'MID', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  FWD: { label: 'FWD', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
}

// Draft order: 1 GK, 4 DEF, 4 MID, 2 FWD = 11 picks
const DRAFT_ORDER = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD']

// ─── Team colours ─────────────────────────────────────────────────────────────

const TEAM_ACCENT = {
  home: { solid: '#dc2626', ring: 'rgba(220,38,38,0.2)', text: '#fca5a5' },
  away: { solid: '#1d4ed8', ring: 'rgba(29,78,216,0.2)',  text: '#93c5fd' },
}
const ac = (role) => TEAM_ACCENT[role] ?? TEAM_ACCENT.home

// ─── Stats display per group ──────────────────────────────────────────────────

function StatBadges({ stats = {}, group }) {
  const items = []

  if (group === 'GK') {
    if (stats.saves   != null) items.push({ label: 'Saves',    value: stats.saves })
    if (stats.passAcc != null) items.push({ label: 'Pass%',    value: `${stats.passAcc}%` })
  } else if (group === 'DEF') {
    if (stats.tackles != null) items.push({ label: 'Tackles',  value: stats.tackles })
    if (stats.passAcc != null) items.push({ label: 'Pass%',    value: `${stats.passAcc}%` })
    if (stats.goals   != null && stats.goals > 0)
                               items.push({ label: 'Goals',    value: stats.goals })
  } else if (group === 'MID') {
    if (stats.passAcc != null) items.push({ label: 'Pass%',    value: `${stats.passAcc}%` })
    if (stats.tackles != null) items.push({ label: 'Tackles',  value: stats.tackles })
    if (stats.xG      != null && stats.xG > 0)
                               items.push({ label: 'xG',       value: stats.xG })
  } else if (group === 'FWD') {
    if (stats.goals   != null) items.push({ label: 'Goals',    value: stats.goals })
    if (stats.shots   != null) items.push({ label: 'Shots',    value: stats.shots })
    if (stats.xG      != null) items.push({ label: 'xG',       value: stats.xG })
  }

  if (!items.length) return null

  return (
    <div className="flex gap-1.5 flex-wrap justify-center mt-1">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center bg-white/6 rounded-lg px-2 py-1 min-w-[36px]">
          <span className="text-white text-xs font-bold tabular-nums leading-tight">{value}</span>
          <span className="text-gray-500 text-[9px] uppercase tracking-wide leading-tight">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Draft card ───────────────────────────────────────────────────────────────

function DraftCard({ player, group, state, onClick }) {
  const gm = GROUP_META[group] ?? GROUP_META.MID
  const tc = ac(player.teamRole)

  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      className={`
        flex-1 rounded-2xl overflow-hidden flex flex-col text-left
        transition-all duration-300 ease-out select-none
        ${state === 'chosen'   ? 'scale-105 ring-4 ring-green-400' : ''}
        ${state === 'rejected' ? 'scale-95 opacity-20 pointer-events-none' : ''}
        ${state === 'idle'     ? 'hover:scale-[1.025] active:scale-[0.98]' : ''}
      `}
      style={{
        background: '#161d2e',
        border: `1px solid rgba(255,255,255,0.07)`,
        boxShadow: state === 'chosen' ? '0 0 28px rgba(74,222,128,0.3)' : undefined,
      }}
    >
      {/* Team colour stripe */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ background: tc.solid }} />

      <div className="flex flex-col items-center gap-2 px-3 pt-4 pb-3 flex-1">
        {/* Shirt number circle */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0"
          style={{ background: tc.ring, border: `2px solid ${tc.solid}` }}
        >
          {player.shirtNumber}
        </div>

        {/* Position group badge */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gm.color}`}>
          {gm.label}
        </span>

        {/* Position name */}
        <p className="text-white text-xs font-semibold text-center leading-snug">
          {player.positionName && player.positionName !== 'Unknown'
            ? player.positionName
            : player.position}
        </p>

        {/* Team pill */}
        <span
          className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
          style={{ background: tc.ring, color: tc.text }}
        >
          {player.teamName}
        </span>

        {/* Stats */}
        <StatBadges stats={player.stats} group={group} />
      </div>

      {state === 'chosen' && (
        <p className="text-green-400 text-[10px] font-bold text-center pb-2.5">✓ PICKED</p>
      )}
    </button>
  )
}

// ─── Build position pools from player list ────────────────────────────────────

function buildPools(players) {
  const pools = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) {
    const g = POS_TO_GROUP[p.position] ?? null
    if (g) pools[g].push(p)
  }
  // Shuffle each pool
  for (const g of Object.keys(pools)) {
    pools[g].sort(() => Math.random() - 0.5)
  }
  return pools
}

// Draw two players from a group pool. Tries to pick one from each team for variety.
function drawPair(pool) {
  if (pool.length < 2) return pool.splice(0, pool.length)
  // Try home + away
  const homeIdx = pool.findIndex(p => p.teamRole === 'home')
  const awayIdx = pool.findIndex(p => p.teamRole === 'away')
  if (homeIdx !== -1 && awayIdx !== -1) {
    const first  = homeIdx < awayIdx ? homeIdx : awayIdx
    const second = homeIdx < awayIdx ? awayIdx : homeIdx
    // Remove higher index first to not shift lower
    const b = pool.splice(second, 1)[0]
    const a = pool.splice(first,  1)[0]
    return Math.random() < 0.5 ? [a, b] : [b, a]
  }
  // Fallback: just take first two
  return pool.splice(0, 2)
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function TeamSelectionModal({ matchId, roomCode, existingSelection = [], onDone }) {
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Draft state
  const [pools,       setPools]       = useState(null)
  const [roundIdx,    setRoundIdx]    = useState(0)     // index into DRAFT_ORDER
  const [currentPair, setCurrentPair] = useState(null)
  const [picks,       setPicks]       = useState([])
  const [chosen,      setChosen]      = useState(null)  // playerId animating
  const [phase,       setPhase]       = useState('drafting')

  useEffect(() => {
    matchesApi.getPlayers(matchId)
      .then(data => {
        const p = buildPools(data)
        const pair = drawPair(p[DRAFT_ORDER[0]])
        setPools(p)
        setCurrentPair(pair)
      })
      .catch(() => toast.error('Failed to load players'))
      .finally(() => setLoading(false))
  }, [matchId])

  const pick = (player) => {
    if (chosen || phase !== 'drafting') return
    setChosen(player.playerId)

    setTimeout(() => {
      const newPicks  = [...picks, player]
      const nextRound = roundIdx + 1
      setPicks(newPicks)
      setChosen(null)

      if (newPicks.length === 11) {
        setPhase('done')
        return
      }

      const group    = DRAFT_ORDER[nextRound]
      const newPools = { ...pools, [group]: [...pools[group]] }
      const pair     = drawPair(newPools[group])
      setPools(newPools)
      setCurrentPair(pair)
      setRoundIdx(nextRound)
    }, 420)
  }

  const confirm = async () => {
    setSubmitting(true)
    try {
      await roomsApi.selectTeam(roomCode, picks.map(p => p.playerId))
      toast.success('Squad locked in! ⚡')
      onDone()
    } catch (err) {
      toast.error(err.message || 'Failed to save team')
    } finally {
      setSubmitting(false)
    }
  }

  const currentGroup = DRAFT_ORDER[roundIdx]
  const gm = GROUP_META[currentGroup] ?? GROUP_META.MID

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0d1117' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-3">
        <button
          onClick={onDone}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white text-sm"
        >
          ✕
        </button>

        <div className="text-center">
          <p className="text-white font-bold text-sm tracking-wider uppercase">
            {phase === 'done' ? '✅ Squad Ready' : 'Choose Your Player'}
          </p>
          {phase === 'drafting' && (
            <p className={`text-[11px] font-semibold mt-0.5 ${gm.color.split(' ')[1]}`}>
              Pick a {currentGroup}
            </p>
          )}
        </div>

        <div className={`text-sm font-bold tabular-nums px-2.5 py-1 rounded-full transition-colors ${
          picks.length === 11 ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-300'
        }`}>
          {picks.length} / 11
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading players…</p>
        </div>

      ) : phase === 'drafting' && currentPair?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">

          {/* Cards */}
          <div className="flex gap-3 w-full max-w-sm">
            {currentPair.map(player => (
              <DraftCard
                key={player.playerId}
                player={player}
                group={currentGroup}
                state={
                  chosen === null              ? 'idle'
                  : chosen === player.playerId ? 'chosen'
                  : 'rejected'
                }
                onClick={() => pick(player)}
              />
            ))}
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5">
            {DRAFT_ORDER.map((g, i) => {
              const gm2 = GROUP_META[g]
              return (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i < picks.length
                      ? `w-2.5 h-2.5 ${gm2.color.split(' ')[0]}`  // filled
                      : i === roundIdx
                        ? 'w-2.5 h-2.5 bg-white/40'               // current
                        : 'w-1.5 h-1.5 bg-white/15'               // future
                  }`}
                />
              )
            })}
          </div>
        </div>

      ) : phase === 'done' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {picks.map((p, i) => {
              const g  = POS_TO_GROUP[p.position] ?? 'MID'
              const gm2 = GROUP_META[g]
              const tc = ac(p.teamRole)
              return (
                <div
                  key={p.playerId}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: '#161d2e', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-gray-600 text-xs w-4 text-right tabular-nums">{i + 1}</span>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                    style={{ background: tc.ring, border: `1.5px solid ${tc.solid}` }}
                  >
                    {p.shirtNumber}
                  </div>
                  <span className="flex-1 text-white text-sm">
                    {p.positionName && p.positionName !== 'Unknown' ? p.positionName : p.position}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${gm2.color}`}>
                    {gm2.label}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex-shrink-0 px-4 pb-8 pt-3 border-t border-white/10">
            <button
              onClick={confirm}
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                bg-green-500 hover:bg-green-400 active:bg-green-600 text-white
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Locking in…' : '⚡ Lock In Squad'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
