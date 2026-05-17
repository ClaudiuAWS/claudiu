import { useState, useEffect, useMemo, useRef } from 'react'
import { matchesApi, roomsApi } from '../../services/api'
import { PitchView } from '../match/PitchView'
import { detectFormation, validateSquad } from '../../utils/formationPositions'
import { useDraft } from '../../hooks/useDraft'
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

// Per-position rgba palette for the FIFA-UT face-off card glow + ring.
// The draft card frame uses these to tint itself with the player's
// position colour — yellow GK, blue DEF, emerald MID, orange wide,
// red FWD — so the pair-pick feels visually charged.
const TYPE_GLOW = {
  GK:  { ring: 'rgba(234,179,8,0.50)',  glow: 'rgba(234,179,8,0.30)'  },
  CB:  { ring: 'rgba(59,130,246,0.50)', glow: 'rgba(59,130,246,0.30)' },
  LB:  { ring: 'rgba(59,130,246,0.50)', glow: 'rgba(59,130,246,0.30)' },
  RB:  { ring: 'rgba(59,130,246,0.50)', glow: 'rgba(59,130,246,0.30)' },
  CDM: { ring: 'rgba(16,185,129,0.50)', glow: 'rgba(16,185,129,0.30)' },
  CM:  { ring: 'rgba(20,184,166,0.50)', glow: 'rgba(20,184,166,0.30)' },
  LM:  { ring: 'rgba(249,115,22,0.50)', glow: 'rgba(249,115,22,0.30)' },
  RM:  { ring: 'rgba(249,115,22,0.50)', glow: 'rgba(249,115,22,0.30)' },
  LW:  { ring: 'rgba(249,115,22,0.50)', glow: 'rgba(249,115,22,0.30)' },
  RW:  { ring: 'rgba(249,115,22,0.50)', glow: 'rgba(249,115,22,0.30)' },
  CAM: { ring: 'rgba(245,158,11,0.50)', glow: 'rgba(245,158,11,0.30)' },
  CF:  { ring: 'rgba(239,68,68,0.50)',  glow: 'rgba(239,68,68,0.30)'  },
  ST:  { ring: 'rgba(239,68,68,0.50)',  glow: 'rgba(239,68,68,0.30)'  },
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
  const tg = TYPE_GLOW[type] ?? TYPE_GLOW.CAM

  // Layered shadows: idle gets a soft position-tinted glow (FIFA UT vibe);
  // chosen intensifies to a bright red ring so the moment lands.
  const idleShadow = `0 0 20px -2px ${tg.glow}, 0 12px 28px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)`
  const chosenShadow = `0 0 36px ${tg.glow}, 0 0 0 4px ${tg.ring}, 0 0 48px rgba(248,113,113,0.45)`

  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      className={`
        flex-1 rounded-2xl overflow-hidden flex flex-col text-left
        transition-all duration-300 ease-out select-none
        ${state === 'chosen'   ? 'scale-105' : ''}
        ${state === 'rejected' ? 'scale-95 opacity-20 pointer-events-none' : ''}
        ${state === 'idle'     ? 'hover:scale-[1.025] active:scale-[0.98]' : ''}
      `}
      style={{
        background: 'linear-gradient(160deg, #1a2238 0%, #131a2a 55%, #0f1421 100%)',
        border: `1px solid ${state === 'chosen' ? tg.ring : 'rgba(255,255,255,0.08)'}`,
        boxShadow: state === 'chosen' ? chosenShadow : idleShadow,
      }}
    >
      <div
        className="h-1.5 w-full flex-shrink-0"
        style={{ background: `linear-gradient(90deg, ${tc.solid} 0%, ${tc.solid} 70%, transparent 100%)` }}
      />
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
        <p className="text-red-400 text-[10px] font-bold text-center pb-2.5">✓ PICKED</p>
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
          ? 'ring-2 ring-red-400 border-red-500/40 bg-red-500/10'
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
        <span className="text-red-400 text-sm flex-shrink-0">✓</span>
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

export default function TeamSelectionModal({ matchId, roomCode, onDone, room, currentUserId }) {
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Draft state (solo mode — local simulation)
  const [pool,          setPool]          = useState([])
  const [myPicks,       setMyPicks]       = useState([])
  const [opponentPicks, setOpponentPicks] = useState([])
  const [currentPair,   setCurrentPair]   = useState(null)
  const [chosen,        setChosen]        = useState(null)

  // Coordinated draft (2-user mode). When the room has 2+ members and the
  // backend has started a draft, this hook drives the source of truth — local
  // pool/myPicks/currentPair are replaced by backend state.
  const draft = useDraft(room, currentUserId)
  const memberCount = room?.members?.length ?? 1
  const isCoordinated = memberCount >= 2 && draft.status !== 'idle'

  // Full player roster, keyed by playerId. Populated by the same getPlayers
  // call used for the local pool. Coordinated mode uses this to enrich the
  // backend's player-id-only pair representation.
  const [playersById, setPlayersById] = useState({})

  // Select XI state
  const [starterIds, setStarterIds] = useState(new Set())
  const [selectedId, setSelectedId] = useState(null)

  // Captain pick — chosen in the preview phase, locked in alongside the XI.
  // The captain gets a 2× scoring multiplier on every points event from their
  // shirt over the course of the match.
  const [captainPlayerId, setCaptainPlayerId] = useState(null)

  // Brezn Agent's captain recommendation. Populated by a one-shot call to
  // the director Lambda (mode='captain-suggestion') when the preview phase
  // is entered with a complete 11-player XI. The banner renders only when
  // the user hasn't picked a captain yet.
  const [captainSuggestion, setCaptainSuggestion] = useState(null)

  // Total number of pair-decisions in this draft (set once on load)
  const [totalPairs, setTotalPairs] = useState(0)

  // Phase: 'draft' | 'select_xi' | 'preview'
  const [phase, setPhase] = useState('draft')

  // ── Persist draft progress whenever meaningful state changes ──────────────
  // In coordinated mode the backend owns pairs/picks state, so we only persist
  // local UI state that's meaningful: phase + starterIds (so refreshing the
  // tab restores your XI selection within the same session).
  useEffect(() => {
    if (loading) return  // don't save empty initial state
    if (isCoordinated) {
      saveDraft(roomCode, {
        phase,
        starterIds: [...starterIds],
        coordinated: true,
      })
      return
    }
    saveDraft(roomCode, {
      phase,
      myPicks,
      opponentPicks,
      pool,
      currentPair,
      totalPairs,
      starterIds: [...starterIds],
    })
  }, [phase, myPicks, opponentPicks, pool, currentPair, totalPairs, starterIds, isCoordinated])

  useEffect(() => {
    matchesApi.getPlayers(matchId)
      .then(players => {
        // Populate the lookup map for both modes (coordinated mode needs
        // it to enrich the backend's playerId-only pairs).
        const map = {}
        for (const p of players) map[p.playerId] = p
        setPlayersById(map)

        // Coordinated mode: skip local pair generation entirely. Backend is
        // the source of truth for pairs, and starterIds restore comes from
        // sessionStorage so the user's XI selection survives a refresh.
        if (isCoordinated) {
          const saved = loadDraft(roomCode)
          if (saved?.starterIds?.length) setStarterIds(new Set(saved.starterIds))
          if (saved?.phase === 'preview') setPhase('preview')
          return
        }

        // ── Restore saved draft progress if available (solo mode) ─────────
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

  // ── Effective state — branches between local (solo) and backend (coordinated) ─
  // In coordinated mode the backend owns pairs, picks, and progress. We
  // enrich the player-id-only payload with full player objects from
  // playersById so the existing render code keeps working unchanged.
  const coordCurrentPair = useMemo(() => {
    if (!isCoordinated) return null
    const ids = draft.currentPair
    if (!ids || !ids.length) return null
    const enriched = ids.map(pid => playersById[pid]).filter(Boolean)
    return enriched.length === 2 ? enriched : null
  }, [isCoordinated, draft.currentPair, playersById])

  const coordMyPicks = useMemo(
    () => isCoordinated ? draft.myPicks.map(pid => playersById[pid]).filter(Boolean) : null,
    [isCoordinated, draft.myPicks, playersById],
  )

  const effectiveCurrentPair = isCoordinated ? coordCurrentPair : currentPair
  const effectiveMyPicks     = isCoordinated ? (coordMyPicks || []) : myPicks
  const effectiveTotalPairs  = isCoordinated ? (draft.totalPairs || 0) : totalPairs
  const decisionsMade = isCoordinated
    ? (draft.currentPairIndex || 0)
    : (totalPairs - pool.length - (currentPair ? 1 : 0))

  const draftProgress = effectiveMyPicks.length

  // ── Coordinated mode: clear `chosen` overlay when backend advances the pair
  //    OR when the draft completes. Drives the "waiting for opponent" → reveal
  //    transition without local state hacks.
  useEffect(() => {
    if (!isCoordinated) return
    setChosen(null)
  }, [isCoordinated, draft.currentPairIndex, draft.status])

  // Coordinated: auto-advance to select_xi when draft completes.
  useEffect(() => {
    if (isCoordinated && draft.status === 'complete' && phase === 'draft') {
      setPhase('select_xi')
    }
  }, [isCoordinated, draft.status, phase])

  // ── Pair-resolved reveal banner ──
  // When the backend broadcasts `draft_pair_resolved`, useRoom stashes the
  // resolution metadata on room.lastDraftReveal. We surface this as a brief
  // (1.6s) banner showing what the opponent picked + tiebreak result.
  // The banner clears itself on a timer so the next pair renders unobstructed.
  const [recentReveal, setRecentReveal] = useState(null)
  useEffect(() => {
    const reveal = room?.lastDraftReveal
    if (!reveal || !isCoordinated) return
    setRecentReveal(reveal)
    // Tiebreaks need extra time for the coin-flip animation (1s spin +
    // ~1.2s to read the verdict). Non-tiebreak reveals stay snappy.
    const dwellMs = reveal.tiebreak ? 2400 : 1800
    const t = setTimeout(() => setRecentReveal(null), dwellMs)
    return () => clearTimeout(t)
  }, [room?.lastDraftReveal?.ts, isCoordinated])

  const opponentDisplayName = useMemo(() => {
    if (!room?.members) return 'Opponent'
    const opp = room.members.find(m => m.userId !== currentUserId)
    return opp?.displayName || 'Opponent'
  }, [room?.members, currentUserId])

  const pick = (chosen_player, other_player) => {
    if (chosen || phase !== 'draft') return

    if (isCoordinated) {
      // Backend-coordinated pick. Optimistic UI — show the chosen card
      // immediately, then wait for `draft_pair_resolved` WS message to
      // advance. The "chosen" overlay shows "waiting for opponent" if the
      // pair isn't resolved yet (see render).
      setChosen(chosen_player.playerId)
      draft.pick(draft.currentPairIndex, chosen_player.playerId)
        .then(out => {
          // Stale-pair race: the opponent's pick + auto-advance resolved
          // this pair before our request landed. Backend returns
          // {ok:true, stale:true} instead of erroring; clear our
          // optimistic lock so the next pair's UI doesn't keep showing
          // "you picked X". The WS room_update is the source of truth
          // for what pair we're on now.
          if (out?.stale) setChosen(null)
        })
        .catch(err => {
          toast.error(err.message || 'Pick failed')
          setChosen(null)
        })
      return
    }

    // Solo mode (existing local simulation).
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

  // Track the latest `chosen` value in a ref so the auto-pick timeout
  // callback can short-circuit if the user squeaked in a pick at the
  // last moment (after the timer fired but before the callback ran).
  const chosenRef = useRef(chosen)
  useEffect(() => { chosenRef.current = chosen }, [chosen])

  // Per-pick auto-pick: when the server-stamped pairStartedAtMs +
  // pickTimerMs deadline passes and the user hasn't locked a pick, fire
  // a random one. Stale-pair race (both clients auto-picking at the same
  // ms) is handled by backend CAS retry + the soft-ack in pass 37.
  useEffect(() => {
    if (!isCoordinated || chosen) return
    if (!effectiveCurrentPair || effectiveCurrentPair.length !== 2) return
    const startedAt = draft.pairStartedAtMs
    const duration  = draft.pickTimerMs || 15000
    if (!startedAt) return  // legacy draft without timer fields — no-op
    const remainingMs = Math.max(0, startedAt + duration - Date.now())
    const fireAutoPick = () => {
      if (chosenRef.current) return  // user picked in the final ms
      const idx = Math.floor(Math.random() * 2)
      pick(effectiveCurrentPair[idx], effectiveCurrentPair[1 - idx])
    }
    if (remainingMs === 0) {
      // Joined / re-rendered past deadline — pick on the next tick so
      // we don't fire mid-render (avoids React state-update warnings).
      const t = setTimeout(fireAutoPick, 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(fireAutoPick, remainingMs)
    return () => clearTimeout(t)
  }, [
    isCoordinated,
    chosen,
    draft.pairStartedAtMs,
    draft.currentPairIndex,
    draft.pickTimerMs,
    // effectiveCurrentPair intentionally NOT in deps — it's a derived
    // array whose reference changes every render. currentPairIndex
    // captures "the pair changed" which is what we actually care about.
  ])

  const starters     = effectiveMyPicks.filter(p =>  starterIds.has(p.playerId))
  const benchPlayers = effectiveMyPicks.filter(p => !starterIds.has(p.playerId))
  const starterCount = starterIds.size

  // Fire the Brezn Agent's captain recommendation once, when the user
  // enters the preview phase with a full 11. Reuses the existing director
  // Lambda via the body-mode multiplexer. Silent failure — the user can
  // still pick a captain manually, so we don't toast on error.
  useEffect(() => {
    if (phase !== 'preview' || captainSuggestion || starters.length !== 11) return
    const payload = {
      mode: 'captain-suggestion',
      starters: starters.map(p => ({
        playerId:     p.playerId,
        displayName:  p.displayName,
        positionCode: p.position,
        teamRole:     p.teamRole,
        shirtNumber:  p.shirtNumber,
      })),
    }
    roomsApi.directorTick(roomCode, payload)
      .then(res => {
        const dec = res?.decision
        if (dec?.recommendedPlayerId) setCaptainSuggestion(dec)
      })
      .catch(() => { /* silent — user picks manually */ })
  }, [phase, captainSuggestion, starters.length, roomCode])

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
      // Captain is required by the preview-phase UI, but guard anyway so a
      // future flow change can't ship a squad without one. Set after the
      // selectTeam call so the server has the player on the user's team by
      // the time it processes the captain pick.
      if (captainPlayerId) await roomsApi.setCaptain(roomCode, captainPlayerId)
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
        {/* Spacer to keep the centred title visually centred without giving
            users an exit hatch — closing mid-draft would orphan the room's
            half-finished selection. The legitimate exit is "leave room" on
            the lobby. */}
        <div className="w-8 h-8" aria-hidden="true" />

        <div className="text-center">
          <p
            className="text-white font-stadium text-lg leading-none"
            style={{ letterSpacing: '0.14em', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}
          >
            {phase === 'draft'     && 'DRAFT BATTLE'}
            {phase === 'select_xi' && 'PICK YOUR XI'}
            {phase === 'preview'   && 'SQUAD READY'}
          </p>
          {phase === 'draft' && effectiveCurrentPair && (
            <p
              className={`text-[11px] font-bold mt-1.5 tracking-widest uppercase ${zoneMeta.textClass}`}
              style={{ filter: `drop-shadow(0 0 6px currentColor)` }}
            >
              Pick a {zoneMeta.label}
            </p>
          )}
          {phase === 'draft' && (
            <div className="mt-2"><StatLegend /></div>
          )}
        </div>

        <div
          className={`text-sm font-bold tabular-nums px-3 py-1 rounded-full transition-all ${
            phase === 'draft'
              ? 'text-amber-200'
              : starterCount === 11
                ? 'text-red-400'
                : 'text-gray-300'
          }`}
          style={{
            background: phase === 'draft'
              ? 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.10) 100%)'
              : starterCount === 11
                ? 'linear-gradient(135deg, rgba(220,38,38,0.22) 0%, rgba(127,29,29,0.12) 100%)'
                : 'rgba(255,255,255,0.08)',
            border: phase === 'draft'
              ? '1px solid rgba(245,158,11,0.35)'
              : starterCount === 11
                ? '1px solid rgba(248,113,113,0.40)'
                : '1px solid rgba(255,255,255,0.08)',
            boxShadow: phase === 'draft'
              ? '0 0 12px -2px rgba(245,158,11,0.30)'
              : starterCount === 11
                ? '0 0 12px -2px rgba(220,38,38,0.35)'
                : 'none',
          }}
        >
          {phase === 'draft' ? `${decisionsMade} / ${effectiveTotalPairs}` : `${starterCount} / 11`}
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading players…</p>
        </div>

      ) : phase === 'draft' && effectiveCurrentPair?.length ? (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-4">
          {/* Ambient home/away rivalry tint in the corners — subtle, just
              enough to suggest a face-off without pulling focus from the
              cards. */}
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(circle at 8% 12%, rgba(220,38,38,0.10) 0%, transparent 38%), ' +
                'radial-gradient(circle at 92% 12%, rgba(29,78,216,0.10) 0%, transparent 38%)',
            }}
          />

          {/* Coordinated mode: hide the "goes to opponent" hint — both
              players pick simultaneously, and a tiebreak handles same-pick. */}
          <div className="flex flex-col items-center gap-2">
            <p
              className="text-amber-200/70 text-[10px] uppercase tracking-[0.25em] text-center font-semibold"
              style={{ textShadow: '0 0 8px rgba(245,158,11,0.30)' }}
            >
              {isCoordinated
                ? 'Both pick at the same time — tap your choice'
                : "Unchosen player goes to opponent's squad"}
            </p>

            {/* Per-pick countdown — only renders in coordinated mode after
                the user enters the pair (chosen is null) and the server has
                stamped a deadline. When chosen is set, the timer goes away
                so the "Waiting for opponent" overlay can breathe. */}
            {isCoordinated && !chosen && draft.pairStartedAtMs && (
              <PickCountdown
                startedAtMs={draft.pairStartedAtMs}
                durationMs={draft.pickTimerMs || 15000}
              />
            )}
          </div>

          {/* Cards + VS divider */}
          <div className="relative flex gap-3 w-full max-w-sm">
            {effectiveCurrentPair.map((player, idx) => {
              const other = effectiveCurrentPair[1 - idx]
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

            {/* VS divider — centred between the two cards. Pointer-events
                disabled so the cards behind it stay tappable at the gap. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center justify-center"
              aria-hidden="true"
            >
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full text-[10px] font-black tracking-widest"
                style={{
                  background: 'linear-gradient(135deg, #fcd34d 0%, #d97706 100%)',
                  color: '#1a1207',
                  border: '2px solid rgba(252,211,77,0.55)',
                  boxShadow: '0 0 18px rgba(252,211,77,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                VS
              </div>
            </div>
          </div>

          {/* Coordinated mode: "waiting for opponent" indicator while our pick
              is locked in but the pair hasn't resolved yet. */}
          {isCoordinated && chosen && !recentReveal && (
            <p className="text-emerald-400 text-xs font-semibold animate-pulse">
              ⏳ Locked in. Waiting for opponent…
            </p>
          )}

          {/* Re-roll button — visible only when the user owns the
              pick-reroll perk for this match AND hasn't used it yet.
              Member.armedPerks is stamped server-side at draft-ready;
              usedDraftReroll flips true when this is consumed. */}
          {isCoordinated && (() => {
            const me = (room?.members || []).find(m => m.userId === currentUserId)
            const ownsReroll = me && (me.armedPerks || []).includes('pick-reroll') && !me.usedDraftReroll
            if (!ownsReroll || chosen) return null
            return (
              <button
                onClick={async () => {
                  try { await roomsApi.draftReroll(room.roomCode) }
                  catch (e) { toast.error(e?.message || 'Re-roll failed') }
                }}
                className="text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(217,119,6,0.10) 100%)',
                  border: '1px solid rgba(245,158,11,0.40)',
                  color: '#fcd34d',
                }}
              >
                🔄 Re-roll this pair
              </button>
            )
          })()}

          {/* Coordinated mode: pair-resolved reveal banner. Shows for 1.8s
              right after the backend broadcasts draft_pair_resolved so the
              user can see what the opponent picked + the tiebreak result
              before the next pair appears. */}
          {isCoordinated && recentReveal && (
            <RevealBanner
              reveal={recentReveal}
              currentUserId={currentUserId}
              opponentDisplayName={opponentDisplayName}
              playersById={playersById}
            />
          )}

          {/* Progress bar */}
          <div className="w-full max-w-sm">
            <div className="h-1 rounded-full bg-white/10">
              <div
                className="h-1 rounded-full bg-red-600 transition-all duration-300"
                style={{ width: `${(decisionsMade / Math.max(effectiveTotalPairs, 1)) * 100}%` }}
              />
            </div>
            <p className="text-gray-600 text-[10px] text-center mt-1">
              Round {decisionsMade + 1} of {effectiveTotalPairs}
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
                      p.ok ? 'bg-emerald-700/50 text-emerald-300' : 'bg-red-700/50 text-red-300'
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
              <p className="text-red-400 text-[11px] font-semibold animate-pulse">
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
                          ? 'ring-2 ring-red-400 border-red-500/40 bg-red-500/10'
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
          {/* Brezn Agent's captain recommendation. Only renders while the
              user hasn't picked yet — once they tap a starter or apply the
              suggestion the banner disappears. */}
          {captainSuggestion?.recommendedPlayerId && !captainPlayerId && (() => {
            const recPlayer = starters.find(p => p.playerId === captainSuggestion.recommendedPlayerId)
            if (!recPlayer) return null
            return (
              <div
                className="flex-shrink-0 mx-4 mt-2 mb-1 rounded-xl px-3 py-2.5 flex items-center gap-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(220,38,38,0.18) 0%, rgba(127,29,29,0.08) 100%)',
                  border: '1px solid rgba(248,113,113,0.40)',
                  boxShadow: '0 4px 16px -8px rgba(220,38,38,0.45)',
                }}
              >
                <img src="/brezn-agent.png?v=3" alt="" className="w-9 h-9 flex-shrink-0 object-contain" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black tracking-widest uppercase text-amber-300/80 mb-0.5">
                    Brezn suggests
                  </p>
                  <p className="text-white text-xs font-semibold leading-snug truncate">
                    <span className="text-amber-200">{recPlayer.displayName}</span>
                    {recPlayer.position ? <span className="text-gray-500"> ({recPlayer.position})</span> : null}
                    {captainSuggestion.reasoning
                      ? <span className="text-gray-400"> — {captainSuggestion.reasoning}</span>
                      : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCaptainPlayerId(captainSuggestion.recommendedPlayerId)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-red-600 hover:bg-red-500 active:bg-red-700 text-white transition-all active:scale-95"
                >
                  Apply
                </button>
              </div>
            )
          })()}

          {/* Captain hint — sits above the pitch so the prompt is the first
              thing the user reads when entering preview. */}
          <p className="flex-shrink-0 px-4 pt-2 text-[10px] font-bold tracking-widest uppercase text-amber-300/80 text-center">
            {captainPlayerId
              ? '✓ Captain picked — 2× boost armed'
              : 'Tap a starter — they get a 2× scoring boost as your captain'}
          </p>

          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
            <PitchView
              teamPlayers={starters}
              benchPlayers={benchPlayers}
              teamRole="home"
              teamName="Your Squad"
              formation={detectFormation(starters)}
              showHeader
              onPlayerClick={p => setCaptainPlayerId(p.playerId)}
              captainPlayerId={captainPlayerId}
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
              disabled={submitting || !captainPlayerId}
              className="flex-[2] py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                bg-red-600 hover:bg-red-500 active:bg-red-700 text-white
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting
                ? 'Locking in…'
                : captainPlayerId
                  ? '⚡ Lock In Squad'
                  : 'Pick a captain first'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── RevealBanner ─────────────────────────────────────────────────────────────
// Brief feedback panel shown after each coordinated-draft pair resolves.
// Two phases when a tiebreak fires:
//   1. 'flipping' — 1s coin-flip animation while we keep the result hidden,
//      so the user sees the gamble actually being settled (real or capped).
//   2. 'result'   — the existing reveal UI showing who got which player.
// Non-tiebreak reveals skip the flip and go straight to result.
function RevealBanner({ reveal, currentUserId, opponentDisplayName, playersById }) {
  const tb = reveal.tiebreak
  const [phase, setPhase] = useState(tb ? 'flipping' : 'result')

  useEffect(() => {
    if (!tb) {
      setPhase('result')
      return
    }
    setPhase('flipping')
    const t = setTimeout(() => setPhase('result'), 1000)  // matches CSS coin-flip duration
    return () => clearTimeout(t)
  }, [reveal.ts, tb])

  const myPid       = reveal.resolved?.[currentUserId]
  const opponentId  = Object.keys(reveal.resolved || {}).find(uid => uid !== currentUserId)
  const oppPid      = opponentId ? reveal.resolved[opponentId] : null
  const myPlayer    = myPid ? playersById[myPid] : null
  const oppPlayer   = oppPid ? playersById[oppPid] : null
  const tbWinnerIsMe = tb && tb.winnerUserId === currentUserId
  const tbContestedName = tb && playersById[tb.contestedPlayerId]?.displayName

  // Phase 1: coin flip — both users picked the same player, tension build.
  if (phase === 'flipping') {
    return (
      <div
        className="w-full max-w-sm rounded-2xl px-4 py-5 border match-event-in flex flex-col items-center gap-2"
        style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.10) 100%)',
          borderColor: 'rgba(245, 158, 11, 0.40)',
        }}
      >
        <p className="text-[10px] font-bold tracking-widest uppercase text-amber-400 text-center">
          🎲 Tiebreak — both picked {tbContestedName || 'the same player'}
        </p>
        <div className="text-4xl coin-flip" aria-hidden>🪙</div>
        <p className="text-[10px] text-amber-300/70 italic">Flipping…</p>
      </div>
    )
  }

  // Phase 2: the reveal — same UI as before, but the coin-flip emoji's gone.
  return (
    <div
      className="w-full max-w-sm rounded-2xl px-4 py-3 border match-event-in"
      style={{
        background: tb
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.10) 100%)'
          : 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.10) 100%)',
        borderColor: tb ? 'rgba(245, 158, 11, 0.40)' : 'rgba(16, 185, 129, 0.40)',
      }}
    >
      {tb && (
        <p className="text-[10px] font-bold tracking-widest uppercase text-amber-400 text-center mb-1.5">
          🎲 {tbWinnerIsMe ? 'You won the toss' : `${opponentDisplayName} won the toss`}
          {tb.capped && <span className="text-amber-300/60 normal-case font-medium"> · balance corrected</span>}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex-1 min-w-0">
          <p className="text-emerald-300/80 font-semibold uppercase tracking-wider">You got</p>
          <p className="text-white text-sm font-bold truncate">{myPlayer?.displayName || myPlayer?.shirtNumber || '—'}</p>
        </div>
        <span className="text-gray-600 px-2">vs</span>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-gray-400/80 font-semibold uppercase tracking-wider">{opponentDisplayName} got</p>
          <p className="text-gray-300 text-sm font-bold truncate">{oppPlayer?.displayName || oppPlayer?.shirtNumber || '—'}</p>
        </div>
      </div>
    </div>
  )
}


// ─── PickCountdown ───────────────────────────────────────────────────────────
// Circular timer that drains from `durationMs` to 0 across the current draft
// pair. Tied to the server-stamped `pairStartedAtMs` so all clients see the
// same number. Color-shifts green → amber → red as the deadline approaches.
// Mirrors the visual vocabulary of CountdownRing in HalftimeQuiz.jsx.
function PickCountdown({ startedAtMs, durationMs }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  if (!startedAtMs || !durationMs) return null

  const elapsed = Math.max(0, now - startedAtMs)
  const remaining = Math.max(0, durationMs - elapsed)
  const progress = remaining / durationMs  // 1.0 → 0.0
  const seconds = Math.ceil(remaining / 1000)

  // Bands match HalftimeQuiz: top third green, middle amber, last third red.
  const color = progress > 2 / 3 ? '#10b981'
              : progress > 1 / 3 ? '#f59e0b'
              : '#ef4444'

  const SIZE = 40
  const RADIUS = 17
  const CIRC = 2 * Math.PI * RADIUS
  const dash = CIRC * (1 - progress)
  const isUrgent = progress <= 1 / 3 && seconds > 0

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{
        width: SIZE,
        height: SIZE,
        animation: isUrgent ? 'pickCountdownPulse 0.7s ease-in-out infinite' : 'none',
      }}
      aria-live="polite"
      aria-label={`${seconds} seconds left to pick`}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90 absolute inset-0">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3"
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 100ms linear, stroke 200ms ease' }}
        />
      </svg>
      <span
        className="relative text-[12px] font-black text-white tabular-nums"
        style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
      >
        {seconds}
      </span>
      <style>{`
        @keyframes pickCountdownPulse {
          0%, 100% { transform: scale(1);   }
          50%      { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
