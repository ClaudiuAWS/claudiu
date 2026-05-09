import { useState, useEffect, useMemo } from 'react'
import { matchesApi, roomsApi } from '../../services/api'
import { PitchView } from '../match/PitchView'
import { detectFormation, validateSquad } from '../../utils/formationPositions'
import toast from 'react-hot-toast'

// ─── German code → specific English type ──────────────────────────────────────
const POS_TO_TYPE = {
  TW:  'GK',
  IVZ: 'CB',  IVL: 'CB',  IVR: 'CB',
  LV:  'LB',  RV:  'RB',
  DMZ: 'CDM', DML: 'CDM', DMR: 'CDM',
  DLM: 'CM',  DRM: 'CM',
  ZO:  'CAM',
  OLM: 'LM',  ORM: 'RM',
  LA:  'LW',  RA:  'RW',
  STZ: 'ST',
  STL: 'CF',  STR: 'CF',
}

// ─── English type → draft zone (positions that pair together in draft) ────────
// GK: only GK; DEF: CB/LB/RB; CDM: CDM+CM; WIDE: LM/RM/LW/RW; ATK: CAM/CF/ST
const TYPE_TO_DRAFT_ZONE = {
  GK:  'GK',
  CB:  'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'CDM', CM: 'CDM',
  LM:  'WIDE', RM: 'WIDE', LW: 'WIDE', RW: 'WIDE',
  CAM: 'ATK',  CF: 'ATK', ST: 'ATK',
}

// ─── Per-type display config ──────────────────────────────────────────────────
const TYPE_META = {
  GK:  { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  CB:  { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  LB:  { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  RB:  { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  CDM: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  CM:  { color: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
  LM:  { color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  RM:  { color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  LW:  { color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  RW:  { color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  CAM: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  CF:  { color: 'bg-red-500/20 text-red-400 border-red-500/40' },
  ST:  { color: 'bg-red-500/20 text-red-400 border-red-500/40' },
}

// Zone labels & colours for the "Pick a …" header
const ZONE_META = {
  GK:   { label: 'Goalkeeper',  textClass: 'text-yellow-400' },
  DEF:  { label: 'Defender',    textClass: 'text-blue-400' },
  CDM:  { label: 'Midfielder',  textClass: 'text-emerald-400' },
  WIDE: { label: 'Wide Player', textClass: 'text-orange-400' },
  ATK:  { label: 'Attacker',    textClass: 'text-red-400' },
}

// ─── Team colours ─────────────────────────────────────────────────────────────

const TEAM_ACCENT = {
  home: { solid: '#dc2626', ring: 'rgba(220,38,38,0.2)', text: '#fca5a5' },
  away: { solid: '#1d4ed8', ring: 'rgba(29,78,216,0.2)', text: '#93c5fd' },
}
const ac = (role) => TEAM_ACCENT[role] ?? TEAM_ACCENT.home

// ─── Stats display ────────────────────────────────────────────────────────────

const STAT_PRIORITY = {
  GK:  [
    { label: 'SAV', get: s => s.saves   > 0 ? String(s.saves)           : null },
    { label: 'PAS', get: s => s.passAcc > 0 ? `${s.passAcc}%`           : null },
    { label: 'PSS', get: s => s.passes  > 0 ? String(s.passes)          : null },
    { label: 'TCK', get: s => s.tackles > 0 ? String(s.tackles)         : null },
    { label: 'GOL', get: s => s.goals   > 0 ? String(s.goals)           : null },
    { label: 'SHO', get: s => s.shots   > 0 ? String(s.shots)           : null },
    { label: 'xG',  get: s => parseFloat(s.xG) > 0 ? parseFloat(s.xG).toFixed(1) : null },
  ],
  DEF: [
    { label: 'TCK', get: s => s.tackles > 0 ? String(s.tackles)         : null },
    { label: 'PAS', get: s => s.passAcc > 0 ? `${s.passAcc}%`           : null },
    { label: 'PSS', get: s => s.passes  > 0 ? String(s.passes)          : null },
    { label: 'GOL', get: s => s.goals   > 0 ? String(s.goals)           : null },
    { label: 'SHO', get: s => s.shots   > 0 ? String(s.shots)           : null },
    { label: 'xG',  get: s => parseFloat(s.xG) > 0 ? parseFloat(s.xG).toFixed(1) : null },
    { label: 'SAV', get: s => s.saves   > 0 ? String(s.saves)           : null },
  ],
  CDM: [
    { label: 'TCK', get: s => s.tackles > 0 ? String(s.tackles)         : null },
    { label: 'PAS', get: s => s.passAcc > 0 ? `${s.passAcc}%`           : null },
    { label: 'PSS', get: s => s.passes  > 0 ? String(s.passes)          : null },
    { label: 'GOL', get: s => s.goals   > 0 ? String(s.goals)           : null },
    { label: 'SHO', get: s => s.shots   > 0 ? String(s.shots)           : null },
    { label: 'xG',  get: s => parseFloat(s.xG) > 0 ? parseFloat(s.xG).toFixed(1) : null },
    { label: 'SAV', get: s => s.saves   > 0 ? String(s.saves)           : null },
  ],
  CAM: [
    { label: 'PAS', get: s => s.passAcc > 0 ? `${s.passAcc}%`           : null },
    { label: 'PSS', get: s => s.passes  > 0 ? String(s.passes)          : null },
    { label: 'GOL', get: s => s.goals   > 0 ? String(s.goals)           : null },
    { label: 'SHO', get: s => s.shots   > 0 ? String(s.shots)           : null },
    { label: 'xG',  get: s => parseFloat(s.xG) > 0 ? parseFloat(s.xG).toFixed(1) : null },
    { label: 'TCK', get: s => s.tackles > 0 ? String(s.tackles)         : null },
    { label: 'SAV', get: s => s.saves   > 0 ? String(s.saves)           : null },
  ],
  FWD: [
    { label: 'GOL', get: s => s.goals   > 0 ? String(s.goals)           : null },
    { label: 'SHO', get: s => s.shots   > 0 ? String(s.shots)           : null },
    { label: 'xG',  get: s => parseFloat(s.xG) > 0 ? parseFloat(s.xG).toFixed(1) : null },
    { label: 'PAS', get: s => s.passAcc > 0 ? `${s.passAcc}%`           : null },
    { label: 'PSS', get: s => s.passes  > 0 ? String(s.passes)          : null },
    { label: 'TCK', get: s => s.tackles > 0 ? String(s.tackles)         : null },
    { label: 'SAV', get: s => s.saves   > 0 ? String(s.saves)           : null },
  ],
}

function StatBadges({ stats = {}, group }) {
  const priority = STAT_PRIORITY[group] ?? STAT_PRIORITY.CAM
  const visible = priority
    .map(({ label, get }) => ({ label, value: get(stats) }))
    .filter(({ value }) => value !== null)
    .slice(0, 6)
  if (visible.length === 0) return null

  const mid  = Math.ceil(visible.length / 2)
  const left = visible.slice(0, mid)
  const right = visible.slice(mid)

  const Col = ({ items }) => (
    <div className="flex flex-col gap-0.5 flex-1">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-baseline gap-1">
          <span className="text-white text-xs font-black tabular-nums w-7 text-right leading-tight">{value}</span>
          <span className="text-gray-500 text-[9px] uppercase tracking-wide leading-tight">{label}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex w-full mt-2 px-1">
      <Col items={left} />
      {right.length > 0 && (
        <>
          <div className="w-px bg-white/10 mx-1.5 self-stretch" />
          <Col items={right} />
        </>
      )}
    </div>
  )
}

// ─── Draft card ───────────────────────────────────────────────────────────────

function DraftCard({ player, state, onClick }) {
  const type = POS_TO_TYPE[player.position] ?? 'CAM'
  // stat group: CM uses CDM priority (both are mids); wide types use CAM priority
  const statGroup = ['CM', 'CDM'].includes(type) ? 'CDM'
                  : ['LM', 'RM', 'LW', 'RW', 'CAM'].includes(type) ? 'CAM'
                  : ['CF', 'ST'].includes(type) ? 'FWD'
                  : type  // GK, DEF types map directly
  const tm = TYPE_META[type] ?? TYPE_META.CAM
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
      <div className="h-1.5 w-full flex-shrink-0" style={{ background: tc.solid }} />
      <div className="flex flex-col items-center gap-2 px-3 pt-4 pb-3 flex-1">
        <div className="relative w-14 h-14 flex-shrink-0">
          {player.imageUrl ? (
            <img
              src={player.imageUrl}
              alt={player.displayName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover object-top"
              style={{ border: `2px solid ${tc.solid}` }}
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
            />
          ) : null}
          <div
            className="w-14 h-14 rounded-full items-center justify-center text-xl font-black text-white"
            style={{ background: tc.ring, border: `2px solid ${tc.solid}`, display: player.imageUrl ? 'none' : 'flex' }}
          >
            {player.shirtNumber}
          </div>
          {player.imageUrl && (
            <span
              className="absolute bottom-0 right-0 text-[9px] font-black text-white px-1 py-0.5 rounded-full leading-none"
              style={{ background: tc.solid }}
            >
              {player.shirtNumber}
            </span>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tm.color}`}>{type}</span>
        <p className="text-white text-xs font-semibold text-center leading-snug px-1">
          {player.displayName || (player.positionName && player.positionName !== 'Unknown' ? player.positionName : player.position)}
        </p>
        <span
          className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
          style={{ background: tc.ring, color: tc.text }}
        >
          {player.teamName}
        </span>
        <StatBadges stats={player.stats} group={statGroup} />
      </div>
      {state === 'chosen' && (
        <p className="text-green-400 text-[10px] font-bold text-center pb-2.5">✓ PICKED</p>
      )}
    </button>
  )
}

// ─── Stat legend ─────────────────────────────────────────────────────────────

const STAT_LEGEND = [
  { abbr: 'SAV', full: 'Saves' },
  { abbr: 'PAS', full: 'Pass accuracy' },
  { abbr: 'PSS', full: 'Passes made' },
  { abbr: 'TCK', full: 'Tackles won' },
  { abbr: 'GOL', full: 'Goals scored' },
  { abbr: 'SHO', full: 'Shots on target' },
  { abbr: 'xG',  full: 'Expected goals' },
]

function StatLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex justify-center">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all
          ${open ? 'bg-white/15 text-white' : 'bg-white/8 text-gray-400 hover:text-gray-200 hover:bg-white/12'}`}
      >
        <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[9px] font-black leading-none">?</span>
        Stats guide
      </button>
      {open && (
        <div
          className="absolute top-full mt-2 z-10 rounded-2xl px-4 py-3 grid grid-cols-2 gap-x-5 gap-y-1.5 w-64"
          style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          {STAT_LEGEND.map(({ abbr, full }) => (
            <div key={abbr} className="flex items-baseline gap-1.5">
              <span className="text-white text-[11px] font-black w-7 flex-shrink-0">{abbr}</span>
              <span className="text-gray-400 text-[10px] leading-tight">{full}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Player chip (for Select XI phase) ───────────────────────────────────────

function PlayerChip({ player, isStarter, onToggle, disabled }) {
  const type = POS_TO_TYPE[player.position] ?? 'CAM'
  const tm   = TYPE_META[type] ?? TYPE_META.CAM
  const tc   = ac(player.teamRole)

  return (
    <button
      onClick={onToggle}
      disabled={disabled && !isStarter}
      className={`
        flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border text-left
        transition-all duration-200
        ${isStarter
          ? 'ring-2 ring-green-400 border-green-500/40 bg-green-500/10'
          : disabled
            ? 'opacity-40 cursor-not-allowed border-white/5 bg-white/[0.02]'
            : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
        }
      `}
    >
      {/* Avatar */}
      <div className="relative w-9 h-9 flex-shrink-0">
        {player.imageUrl ? (
          <img
            src={player.imageUrl}
            alt={player.displayName}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover object-top"
            style={{ border: `1.5px solid ${tc.solid}` }}
            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
          />
        ) : null}
        <div
          className="w-9 h-9 rounded-full items-center justify-center text-sm font-black text-white"
          style={{ background: tc.ring, border: `1.5px solid ${tc.solid}`, display: player.imageUrl ? 'none' : 'flex' }}
        >
          {player.shirtNumber}
        </div>
        {player.imageUrl && (
          <span
            className="absolute bottom-0 right-0 text-[8px] font-black text-white px-0.5 leading-none rounded-full"
            style={{ background: tc.solid, paddingTop: '1px', paddingBottom: '1px' }}
          >
            {player.shirtNumber}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold truncate">
          {player.displayName || (player.positionName && player.positionName !== 'Unknown' ? player.positionName : player.position)}
        </p>
        <p className="text-gray-500 text-[10px] truncate">
          {player.positionName && player.positionName !== 'Unknown' ? player.positionName : player.position}
        </p>
      </div>

      {/* Position badge */}
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${tm.color}`}>
        {type}
      </span>

      {/* Starter checkmark */}
      {isStarter && (
        <span className="text-green-400 text-sm flex-shrink-0">✓</span>
      )}
    </button>
  )
}

// ─── Draft state persistence ──────────────────────────────────────────────────

const draftKey = (rc) => `draft_progress_${rc}`

function saveDraft(roomCode, state) {
  try { sessionStorage.setItem(draftKey(roomCode), JSON.stringify(state)) } catch {}
}

function loadDraft(roomCode) {
  try {
    const raw = sessionStorage.getItem(draftKey(roomCode))
    return raw ? JSON.parse(raw) : null
  } catch {}
  return null
}

function clearDraft(roomCode) {
  try { sessionStorage.removeItem(draftKey(roomCode)) } catch {}
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function TeamSelectionModal({ matchId, roomCode, onDone }) {
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Draft state
  const [pool,          setPool]          = useState([])
  const [myPicks,       setMyPicks]       = useState([])
  const [opponentPicks, setOpponentPicks] = useState([])
  const [currentPair,   setCurrentPair]   = useState(null)
  const [chosen,        setChosen]        = useState(null)

  // Select XI state
  const [starterIds, setStarterIds] = useState(new Set())
  const [selectedId, setSelectedId] = useState(null)

  // Total number of pair-decisions in this draft (set once on load)
  const [totalPairs, setTotalPairs] = useState(0)

  // Phase: 'draft' | 'select_xi' | 'preview'
  const [phase, setPhase] = useState('draft')

  // ── Persist draft progress whenever meaningful state changes ──────────────
  useEffect(() => {
    if (loading) return  // don't save empty initial state
    saveDraft(roomCode, {
      phase,
      myPicks,
      opponentPicks,
      pool,
      currentPair,
      totalPairs,
      starterIds: [...starterIds],
    })
  }, [phase, myPicks, opponentPicks, pool, currentPair, totalPairs, starterIds])

  useEffect(() => {
    matchesApi.getPlayers(matchId)
      .then(players => {
        // ── Restore saved draft progress if available ─────────────────────
        const saved = loadDraft(roomCode)
        if (saved && (saved.myPicks?.length > 0 || saved.pool?.length > 0 || saved.currentPair)) {
          setMyPicks(saved.myPicks       ?? [])
          setOpponentPicks(saved.opponentPicks ?? [])
          setPool(saved.pool             ?? [])
          setCurrentPair(saved.currentPair   ?? null)
          setTotalPairs(saved.totalPairs     ?? 0)
          setStarterIds(new Set(saved.starterIds ?? []))
          // Draft is "complete" when the pool is empty and there's no current
          // pair to choose. In that case, jump straight to select_xi (to swap
          // starters) — never back to 'draft' (no decisions left) or stuck on
          // 'preview' (user clicked Edit because they want to change something).
          const draftComplete = (saved.pool?.length ?? 0) === 0 && !saved.currentPair
          setPhase(draftComplete ? 'select_xi' : (saved.phase ?? 'draft'))
          return  // skip fresh setup
        }

        // ── Fresh draft setup ─────────────────────────────────────────────
        // Only keep players with a valid position code
        const withPos = players.filter(p => POS_TO_TYPE[p.position])

        const byZone = {}
        for (const p of withPos) {
          const type = POS_TO_TYPE[p.position]
          const zone = TYPE_TO_DRAFT_ZONE[type] ?? 'ATK'
          if (!byZone[zone]) byZone[zone] = []
          byZone[zone].push(p)
        }

        const pairs = []
        const autoMyPicks = []
        for (const zone of ['GK', 'DEF', 'CDM', 'WIDE', 'ATK']) {
          const members = [...(byZone[zone] ?? [])].sort(() => Math.random() - 0.5)
          for (let i = 0; i + 1 < members.length; i += 2) {
            pairs.push([members[i], members[i + 1]])
          }
          if (members.length % 2 === 1) {
            autoMyPicks.push(members[members.length - 1])
          }
        }

        pairs.sort(() => Math.random() - 0.5)

        if (autoMyPicks.length) setMyPicks(autoMyPicks)
        setTotalPairs(pairs.length)
        setPool(pairs.slice(1))
        setCurrentPair(pairs[0] ?? null)
      })
      .catch(() => toast.error('Failed to load players'))
      .finally(() => setLoading(false))
  }, [matchId])

  // Decisions made so far (excludes auto-picked odd-zone players)
  const decisionsMade = totalPairs - pool.length - (currentPair ? 1 : 0)

  const draftProgress = myPicks.length

  const pick = (chosen_player, other_player) => {
    if (chosen || phase !== 'draft') return
    setChosen(chosen_player.playerId)

    setTimeout(() => {
      const newMyPicks  = [...myPicks, chosen_player]
      const newOppPicks = [...opponentPicks, other_player]
      setMyPicks(newMyPicks)
      setOpponentPicks(newOppPicks)
      setChosen(null)

      if (pool.length === 0) {
        // Draft complete
        setCurrentPair(null)
        // Persist both sides for the squad tab
        try {
          sessionStorage.setItem(`draft_opponent_picks_${roomCode}`, JSON.stringify(newOppPicks))
          sessionStorage.setItem(`draft_my_picks_${roomCode}`, JSON.stringify(newMyPicks))
        } catch {}
        setPhase('select_xi')
        return
      }

      // Next pair (pool is now [[a,b], [c,d], ...])
      const nextPool = [...pool]
      const nextPair = nextPool.shift()
      setPool(nextPool)
      setCurrentPair(nextPair)
    }, 420)
  }

  const starters     = myPicks.filter(p =>  starterIds.has(p.playerId))
  const benchPlayers = myPicks.filter(p => !starterIds.has(p.playerId))
  const starterCount = starterIds.size

  // ── Swap mechanic ──────────────────────────────────────────────────────────
  // Any player (starter or bench) can be selected.
  // Tapping a second player performs the swap.
  const handleSelectXiClick = (player) => {
    const pid          = player.playerId
    const isStarter    = starterIds.has(pid)
    const selIsStarter = selectedId ? starterIds.has(selectedId) : false

    // Tap same player → deselect
    if (selectedId === pid) { setSelectedId(null); return }

    if (!selectedId) {
      // Nothing selected yet
      if (isStarter) {
        // Select this starter for swap
        setSelectedId(pid)
      } else {
        // Bench player, XI not full → add immediately
        if (starterCount < 11) {
          setStarterIds(prev => new Set([...prev, pid]))
        } else {
          // XI full → select for swap
          setSelectedId(pid)
        }
      }
      return
    }

    // Something already selected
    setStarterIds(prev => {
      const next = new Set(prev)
      if (selIsStarter && !isStarter) {
        // Selected starter ↔ tapped bench
        next.delete(selectedId); next.add(pid)
      } else if (!selIsStarter && isStarter) {
        // Selected bench ↔ tapped starter
        next.delete(pid); next.add(selectedId)
      } else if (selIsStarter && isStarter) {
        // Starter ↔ Starter: both stay, auto-assign handles positions
        // (no Set change needed — just clear selection)
      } else {
        // Bench ↔ Bench: just clear
      }
      return next
    })
    setSelectedId(null)
  }

  // Legacy toggle (unused in pitch UI but kept for safety)
  const toggleStarter = (playerId) => {
    setStarterIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) { next.delete(playerId) }
      else if (next.size < 11) { next.add(playerId) }
      return next
    })
  }

  const confirm = async () => {
    setSubmitting(true)
    try {
      await roomsApi.selectTeam(roomCode, starters.map(p => p.playerId))
      // KEEP draft progress in sessionStorage even after lock-in. Reopening the
      // modal restores the user's 14 picks and starting XI, dropping them
      // straight into 'select_xi' (load path forces this when draft is
      // complete). The 14 draft choices themselves are immutable — the user
      // can only swap who's starter vs bench, not re-do the picks.
      try { sessionStorage.removeItem(`match_started_${roomCode}`) } catch {}
      toast.success('Squad locked in! ⚡')
      onDone()
    } catch (err) {
      toast.error(err.message || 'Failed to save team')
    } finally {
      setSubmitting(false)
    }
  }

  const currentZone = currentPair
    ? (TYPE_TO_DRAFT_ZONE[POS_TO_TYPE[currentPair[0]?.position]] ?? 'ATK')
    : 'ATK'
  const zoneMeta = ZONE_META[currentZone] ?? ZONE_META.ATK

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0d1117' }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-3">
        <button
          onClick={onDone}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white text-sm"
        >✕</button>

        <div className="text-center">
          <p className="text-white font-bold text-sm tracking-wider uppercase">
            {phase === 'draft'     && 'Draft Battle'}
            {phase === 'select_xi' && 'Pick Your XI'}
            {phase === 'preview'   && 'Squad Ready'}
          </p>
          {phase === 'draft' && currentPair && (
            <p className={`text-[11px] font-semibold mt-0.5 ${zoneMeta.textClass}`}>
              Pick a {zoneMeta.label}
            </p>
          )}
          {phase === 'draft' && (
            <div className="mt-2"><StatLegend /></div>
          )}
        </div>

        <div className={`text-sm font-bold tabular-nums px-2.5 py-1 rounded-full transition-colors ${
          phase === 'draft'
            ? 'bg-white/10 text-gray-300'
            : starterCount === 11
              ? 'bg-green-500/20 text-green-400'
              : 'bg-white/10 text-gray-300'
        }`}>
          {phase === 'draft' ? `${decisionsMade} / ${totalPairs}` : `${starterCount} / 11`}
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading players…</p>
        </div>

      ) : phase === 'draft' && currentPair?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
          {/* Opponent squad building hint */}
          <p className="text-gray-600 text-[10px] uppercase tracking-widest text-center">
            Unchosen player goes to opponent's squad
          </p>

          {/* Cards */}
          <div className="flex gap-3 w-full max-w-sm">
            {currentPair.map((player, idx) => {
              const other = currentPair[1 - idx]
              return (
                <DraftCard
                  key={player.playerId}
                  player={player}
                  state={
                    chosen === null               ? 'idle'
                    : chosen === player.playerId  ? 'chosen'
                    : 'rejected'
                  }
                  onClick={() => pick(player, other)}
                />
              )
            })}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-sm">
            <div className="h-1 rounded-full bg-white/10">
              <div
                className="h-1 rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${(decisionsMade / Math.max(totalPairs, 1)) * 100}%` }}
              />
            </div>
            <p className="text-gray-600 text-[10px] text-center mt-1">
              Round {decisionsMade + 1} of {totalPairs}
            </p>
          </div>
        </div>

      ) : phase === 'select_xi' ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Pitch ── */}
          <div className="flex-1 min-h-0 px-3 pt-1 overflow-hidden">
            {starterCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 opacity-60">
                <span className="text-4xl">⚽</span>
                <p className="text-gray-500 text-sm text-center">
                  Tap players from the bench below to fill your XI
                </p>
              </div>
            ) : (
              <div style={{ marginTop: '-120px' }}>
                <PitchView
                  teamPlayers={starters}
                  teamRole="home"
                  formation={starterCount >= 3 ? detectFormation(starters) : '4-2-3-1'}
                  onPlayerClick={handleSelectXiClick}
                  selectedPlayerId={selectedId}
                  maxHeight="260px"
                  showHeader={false}
                />
              </div>
            )}
          </div>

          {/* ── Composition pills ── */}
          {starterCount > 0 && (() => {
            const v = validateSquad(starters)
            const pills = [
              { label: 'GK',  count: v.gk,  ok: v.gk === 1 },
              { label: 'DEF', count: v.def, ok: v.def >= 3 && v.def <= 5 },
              { label: 'MID', count: v.mid, ok: v.mid >= 2 && v.mid <= 6 },
              { label: 'FWD', count: v.fwd, ok: v.fwd >= 1 && v.fwd <= 3 },
            ]
            return (
              <div className="flex justify-center gap-2 px-4 pt-1">
                {pills.map(p => (
                  <span key={p.label}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.ok ? 'bg-green-700/50 text-green-300' : 'bg-red-700/50 text-red-300'
                    }`}>
                    {p.label} {p.count}
                  </span>
                ))}
              </div>
            )
          })()}

          {/* ── Swap hint bar ── */}
          <div className="flex-shrink-0 px-4 py-1.5 text-center min-h-[28px]">
            {selectedId ? (
              <p className="text-green-400 text-[11px] font-semibold animate-pulse">
                ⇄ Tap another player to swap · tap same to cancel
              </p>
            ) : starterCount < 11 ? (
              <p className="text-gray-600 text-[11px]">
                {11 - starterCount} more to pick · tap pitch player to swap
              </p>
            ) : (
              <p className="text-gray-600 text-[11px]">
                Tap a player on the pitch to swap with bench
              </p>
            )}
          </div>

          {/* ── Bench strip ── */}
          <div className="flex-shrink-0 border-t border-white/[0.06] pt-2 pb-2">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest px-4 mb-1.5">
              Bench ({benchPlayers.length})
            </p>
            {benchPlayers.length === 0 ? (
              <p className="text-gray-700 text-xs text-center py-2">All players are starting</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
                {benchPlayers.map(player => {
                  const type = POS_TO_TYPE[player.position] ?? 'CAM'
                  const tm   = TYPE_META[type] ?? TYPE_META.CAM
                  const tc   = ac(player.teamRole)
                  const isSel = selectedId === player.playerId
                  return (
                    <button
                      key={player.playerId}
                      onClick={() => handleSelectXiClick(player)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-xl border transition-all
                        ${isSel
                          ? 'ring-2 ring-green-400 border-green-500/40 bg-green-500/10'
                          : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07]'
                        }`}
                      style={{ minWidth: 52 }}
                    >
                      <div className="relative w-9 h-9">
                        {player.imageUrl && !isSel ? (
                          <img
                            src={player.imageUrl}
                            alt={player.displayName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover object-top"
                            style={{ border: `1.5px solid ${tc.solid}` }}
                            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                          />
                        ) : null}
                        <div
                          className="w-9 h-9 rounded-full items-center justify-center text-sm font-black text-white"
                          style={{
                            background: tc.ring,
                            border: `1.5px solid ${tc.solid}`,
                            display: (player.imageUrl && !isSel) ? 'none' : 'flex',
                          }}
                        >
                          {isSel ? '⇄' : player.shirtNumber}
                        </div>
                        {player.imageUrl && !isSel && (
                          <span
                            className="absolute bottom-0 right-0 text-[8px] font-black text-white px-0.5 rounded-full leading-none"
                            style={{ background: tc.solid, paddingTop: '1px', paddingBottom: '1px' }}
                          >
                            {player.shirtNumber}
                          </span>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded border leading-none ${tm.color}`}>
                        {type}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Confirm button ── */}
          <div className="flex-shrink-0 px-4 pb-6 pt-2 border-t border-white/[0.06]">
            {(() => {
              const v = starterCount === 11 ? validateSquad(starters) : null
              const ready = starterCount === 11 && v?.valid
              const label = starterCount < 11
                ? `Pick ${11 - starterCount} more from bench`
                : v?.valid
                  ? `View Formation · ${detectFormation(starters)}`
                  : v?.errors[0] ?? 'Invalid squad'
              return (
                <button
                  onClick={() => { setSelectedId(null); setPhase('preview') }}
                  disabled={!ready}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                    bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white
                    disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              )
            })()}
          </div>
        </div>

      ) : phase === 'preview' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <PitchView
              teamPlayers={starters}
              benchPlayers={benchPlayers}
              teamRole="home"
              teamName="Your Squad"
              formation={detectFormation(starters)}
              showHeader
            />
          </div>

          <div className="flex-shrink-0 px-4 pb-8 pt-3 border-t border-white/10 flex gap-3">
            <button
              onClick={() => setPhase('select_xi')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm text-gray-400 bg-white/8 hover:bg-white/12 transition-all"
            >
              ← Edit XI
            </button>
            <button
              onClick={confirm}
              disabled={submitting}
              className="flex-[2] py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
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
