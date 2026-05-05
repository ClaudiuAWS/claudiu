import { formatFootballTime, gameTimeToSeconds } from '../../utils/matchEvents'
import { POS_TO_TYPE } from '../../utils/formationPositions'

// ─── Points rules ─────────────────────────────────────────────────────────────
const POINTS = { goal: 5, assist: 3, yellow: -1, red: -3 }

// 5-tier group colour config (ATM renamed to CAM)
const GROUP_ACCENT = {
  GK:  { bg: '#EAB308', text: '#422006', label: 'GK' },
  DEF: { bg: '#3B82F6', text: '#1e3a5f', label: 'DEF' },
  CDM: { bg: '#10B981', text: '#064e3b', label: 'CDM' },
  CAM: { bg: '#F97316', text: '#431407', label: 'CAM' },
  FWD: { bg: '#EF4444', text: '#450a0a', label: 'FWD' },
}

const POS_TO_GROUP = {
  TW:  'GK',
  IVZ: 'DEF', IVL: 'DEF', IVR: 'DEF', LV: 'DEF', RV: 'DEF',
  // DLM/DRM are centre mids but sit on the CDM line
  DMZ: 'CDM', DMR: 'CDM', DML: 'CDM', DRM: 'CDM', DLM: 'CDM',
  ZO:  'CAM', OLM: 'CAM', ORM: 'CAM', LA: 'CAM', RA: 'CAM',
  STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}

// ─── Stat priority per position group ────────────────────────────────────────
const STAT_PRIORITY = {
  GK:  ['saves', 'passAcc', 'passes', 'tackles', 'goals', 'shots', 'xG'],
  DEF: ['tackles', 'passAcc', 'passes', 'goals', 'shots', 'xG', 'saves'],
  CDM: ['tackles', 'passAcc', 'passes', 'goals', 'shots', 'xG', 'saves'],
  CAM: ['passAcc', 'passes', 'goals', 'shots', 'xG', 'tackles', 'saves'],
  FWD: ['goals', 'shots', 'xG', 'passAcc', 'passes', 'tackles', 'saves'],
}

const STAT_CONFIG = {
  goals:   { label: 'GOL', fmt: v => String(v) },
  shots:   { label: 'SHO', fmt: v => String(v) },
  xG:      { label: 'xG',  fmt: v => parseFloat(v).toFixed(1) },
  passAcc: { label: 'PAS', fmt: v => `${v}%` },
  passes:  { label: 'PSS', fmt: v => String(v) },
  tackles: { label: 'TCK', fmt: v => String(v) },
  saves:   { label: 'SAV', fmt: v => String(v) },
}

// ─── Event matching ────────────────────────────────────────────────────────────
function getPlayerMatchEvents(player, events, htStoredSec) {
  if (!player || !events?.length) return []
  const pid = player.playerId
  const result = []

  for (const e of events) {
    if (e.eventType === 'goal') {
      if (e.scoringPlayerId === pid) {
        result.push({
          type: 'goal', icon: '⚽', label: 'Goal', points: POINTS.goal,
          time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
          detail: e.isPenalty ? 'Penalty' : null,
          eventId: e.eventId,
        })
      } else if (e.assistPlayerId === pid) {
        result.push({
          type: 'assist', icon: '🅰️', label: 'Assist', points: POINTS.assist,
          time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
          detail: e.scoringDisplay || null,
          eventId: e.eventId + '_assist',
        })
      }
    } else if (e.eventType === 'card' && e.playerId === pid) {
      const isRed = e.cardColor === 'red'
      result.push({
        type: isRed ? 'red' : 'yellow',
        icon: isRed ? '🟥' : '🟨',
        label: isRed ? 'Red Card' : 'Yellow Card',
        points: isRed ? POINTS.red : POINTS.yellow,
        time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
        detail: null,
        eventId: e.eventId,
      })
    } else if (e.eventType === 'substitution') {
      if (e.playerInId === pid) {
        result.push({
          type: 'sub_in', icon: '↑', label: 'Came On', points: 0,
          time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
          detail: `Replaced ${e.playerOutDisplay || ''}`,
          eventId: e.eventId + '_in',
        })
      } else if (e.playerOutId === pid) {
        result.push({
          type: 'sub_out', icon: '↓', label: 'Substituted', points: 0,
          time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
          detail: `For ${e.playerInDisplay || ''}`,
          eventId: e.eventId + '_out',
        })
      }
    }
  }

  return result.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatGrid({ stats = {}, group = 'MID' }) {
  const priority = STAT_PRIORITY[group] ?? STAT_PRIORITY.MID
  const items = priority
    .filter(key => {
      const v = stats[key]
      return v != null && parseFloat(v) > 0
    })
    .slice(0, 6)
    .map(key => ({
      label: STAT_CONFIG[key].label,
      value: STAT_CONFIG[key].fmt(stats[key]),
    }))

  if (!items.length) return (
    <p className="text-gray-600 text-xs text-center py-2">No stats available</p>
  )

  const mid   = Math.ceil(items.length / 2)
  const left  = items.slice(0, mid)
  const right = items.slice(mid)

  const Col = ({ col }) => (
    <div className="flex flex-col gap-1.5 flex-1">
      {col.map(({ label, value }) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <span className="text-white text-sm font-black tabular-nums w-8 text-right">{value}</span>
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex gap-0 px-1">
      <Col col={left} />
      {right.length > 0 && (
        <>
          <div className="w-px bg-white/10 mx-3 self-stretch" />
          <Col col={right} />
        </>
      )}
    </div>
  )
}

function EventTimeline({ events }) {
  if (!events.length) return null

  const typeColor = {
    goal:    { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-300', pts: 'text-green-400' },
    assist:  { bg: 'bg-blue-500/20',  border: 'border-blue-500/30',  text: 'text-blue-300',  pts: 'text-blue-400' },
    yellow:  { bg: 'bg-yellow-500/20',border: 'border-yellow-500/30',text: 'text-yellow-300',pts: 'text-yellow-400' },
    red:     { bg: 'bg-red-600/20',   border: 'border-red-600/30',   text: 'text-red-300',   pts: 'text-red-400' },
    sub_in:  { bg: 'bg-emerald-500/20',border:'border-emerald-500/30',text:'text-emerald-300',pts:'text-gray-500' },
    sub_out: { bg: 'bg-gray-600/20',  border: 'border-gray-600/30',  text: 'text-gray-300',  pts: 'text-gray-500' },
  }

  return (
    <div className="space-y-2">
      {events.map(ev => {
        const c = typeColor[ev.type] || typeColor.sub_out
        return (
          <div key={ev.eventId}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${c.bg} ${c.border}`}
          >
            {/* Icon */}
            <span className="text-base w-6 text-center flex-shrink-0">{ev.icon}</span>

            {/* Label + detail */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${c.text}`}>{ev.label}</p>
              {ev.detail && (
                <p className="text-gray-500 text-[10px] truncate">{ev.detail}</p>
              )}
            </div>

            {/* Time */}
            {ev.time && (
              <span className="text-gray-400 text-xs font-semibold tabular-nums flex-shrink-0">
                {ev.time}
              </span>
            )}

            {/* Points */}
            {ev.points !== 0 && (
              <span className={`text-sm font-black tabular-nums w-8 text-right flex-shrink-0 ${c.pts}`}>
                {ev.points > 0 ? `+${ev.points}` : ev.points}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main popup ───────────────────────────────────────────────────────────────

export function PlayerStatsPopup({ player, isOpen, onClose, events = [], htStoredSec = -1 }) {
  if (!isOpen || !player) return null

  const group      = POS_TO_GROUP[player.position] ?? 'CAM'
  const accent     = GROUP_ACCENT[group] ?? GROUP_ACCENT.CAM
  const typeLabel  = POS_TO_TYPE[player.position] ?? group
  const teamRole   = player.teamRole ?? 'home'
  const teamColor  = teamRole === 'home' ? '#DC2626' : '#1D4ED8'
  const teamRing   = teamRole === 'home' ? 'rgba(220,38,38,0.25)' : 'rgba(29,78,216,0.25)'

  const playerEvents = getPlayerMatchEvents(player, events, htStoredSec)
  const totalPoints  = playerEvents.reduce((s, e) => s + e.points, 0)
  const stats        = player.stats || {}

  const displayName = player.displayName
    || (player.shirtNumber ? `#${player.shirtNumber} · ${player.positionName || player.position}` : 'Player')

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#0e1420', border: `1px solid ${teamColor}40`, maxWidth: 440, width: 'calc(100% - 32px)',
                 maxHeight: 'calc(100dvh - 160px)' }}
      >
        {/* ── FIFA-style header ── */}
        <div
          className="flex-shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${teamColor}55, ${teamColor}22)` }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-gray-400 hover:text-white text-sm"
          >✕</button>

          <div className="flex items-stretch gap-0 p-5">
            {/* Left: FIFA-style card — photo + position badge */}
            <div
              className="flex flex-col items-center rounded-xl overflow-hidden mr-4 flex-shrink-0"
              style={{ background: `linear-gradient(160deg, ${teamColor}88, ${teamColor}44)`, border: `1.5px solid ${teamColor}`, width: 72 }}
            >
              {player.imageUrl ? (
                <img
                  src={player.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: 72, objectFit: 'cover', objectPosition: 'center 5%', display: 'block' }}
                  onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div
                className="items-center justify-center"
                style={{
                  width: '100%', height: 72,
                  display: player.imageUrl ? 'none' : 'flex',
                  flexDirection: 'column', gap: 2,
                }}
              >
                <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: accent.bg }}>{typeLabel}</span>
                <span className="text-4xl font-black leading-none text-white" style={{ textShadow: `0 2px 12px ${teamColor}` }}>{player.shirtNumber || '?'}</span>
              </div>
              <div
                className="w-full text-center py-1"
                style={{ background: `${teamColor}99`, borderTop: `1px solid ${teamColor}` }}
              >
                <span className="text-[10px] font-black text-white tracking-widest uppercase">{typeLabel}</span>
              </div>
            </div>

            {/* Right: player info */}
            <div className="flex flex-col justify-center flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{displayName}</p>
              <p className="text-gray-400 text-[11px] mt-0.5">{player.positionName || player.position}</p>

              {/* Match points badge */}
              <div className="flex items-center gap-2 mt-3">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ background: totalPoints >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                           border: `1px solid ${totalPoints >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}
                >
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Match pts</span>
                  <span className={`text-sm font-black tabular-nums ${totalPoints >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalPoints > 0 ? `+${totalPoints}` : totalPoints || '0'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats section inside header */}
          <div className="px-5 pb-4">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Season stats</p>
            <StatGrid stats={stats} group={group} />
          </div>
        </div>

        {/* ── Events timeline ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {playerEvents.length > 0 ? (
            <>
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-3">Match involvement</p>
              <EventTimeline events={playerEvents} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
              <span className="text-3xl">🏃</span>
              <p className="text-gray-600 text-sm">No recorded events yet</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 border-t border-white/[0.06] px-4 py-2.5 flex items-center justify-between">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest">
            Points: Goal +5 · Assist +3 · Yellow −1 · Red −3
          </p>
        </div>
      </div>
    </>
  )
}
