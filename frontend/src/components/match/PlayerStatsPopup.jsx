import { formatFootballTime, gameTimeToSeconds } from '../../utils/matchEvents'
import { POS_TO_TYPE } from '../../utils/formationPositions'

// ─── Points rules ─────────────────────────────────────────────────────────────
// Mirror of backend/event-processor/service.py::_calculate_member_changes.
// Goal value depends on the SCORER's FPL bucket (GK/DEF/MID/FWD); other
// events have flat values. Keep these in sync if the backend rules change.
const GOAL_BY_FPL_BUCKET = { GK: 10, DEF: 6, MID: 5, FWD: 4 }
const POINTS = { assist: 3, save: 2, concede: -1, yellow: -1, red: -3 }

// Map our 5-tier popup group → backend's 4-tier FPL bucket. The popup splits
// midfielders into CDM/CAM for layout reasons; the scoring rules only know
// MID. FWD stays FWD.
const POPUP_GROUP_TO_FPL = { GK: 'GK', DEF: 'DEF', CDM: 'MID', CAM: 'MID', FWD: 'FWD' }
const fplBucket = (popupGroup) => POPUP_GROUP_TO_FPL[popupGroup] ?? 'MID'
const goalValueFor = (popupGroup) => GOAL_BY_FPL_BUCKET[fplBucket(popupGroup)]

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
function getPlayerMatchEvents(player, events, htStoredSec, popupGroup) {
  if (!player || !events?.length) return []
  const pid = player.playerId
  const isGK = popupGroup === 'GK'
  const result = []

  for (const e of events) {
    if (e.eventType === 'goal') {
      if (e.scoringPlayerId === pid) {
        // Goal value uses the SCORER's bucket — i.e. this player's bucket,
        // since this branch fires when the player IS the scorer.
        result.push({
          type: 'goal', icon: '⚽', label: 'Goal', points: goalValueFor(popupGroup),
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
      } else if (isGK && e.scoringTeamRole && e.scoringTeamRole !== player.teamRole) {
        // GK on the conceding side — −1 per opposing-team goal. Without
        // this row the user sees +18 from saves but doesn't see why their
        // leaderboard score is lower (concedes silently apply on backend).
        result.push({
          type: 'concede', icon: '🥅', label: 'Conceded', points: POINTS.concede,
          time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
          detail: e.scoringDisplay ? `vs ${e.scoringDisplay}` : null,
          eventId: e.eventId + '_concede',
        })
      }
    } else if (e.eventType === 'saved_shot' && e.goalKeeperId === pid) {
      result.push({
        type: 'save', icon: '🧤', label: 'Save', points: POINTS.save,
        time: formatFootballTime(gameTimeToSeconds(e.gameTime), htStoredSec),
        detail: e.saveResult ? String(e.saveResult) : null,
        eventId: e.eventId,
      })
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
    goal:    { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-300', pts: 'text-emerald-400' },
    assist:  { bg: 'bg-blue-500/20',  border: 'border-blue-500/30',  text: 'text-blue-300',  pts: 'text-blue-400' },
    save:    { bg: 'bg-purple-500/20',border: 'border-purple-500/30',text: 'text-purple-300',pts: 'text-purple-400' },
    concede: { bg: 'bg-red-500/10',   border: 'border-red-500/20',   text: 'text-red-300/80',pts: 'text-red-400' },
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
  // userSide = which user owns this player (drives popup color so the
  // owner is instantly recognisable). player.teamRole = the player's
  // actual match team — used by the concede check, not for color.
  const userSide   = player.userSide ?? player.teamRole ?? 'home'
  const teamColor  = userSide === 'home' ? '#DC2626' : '#1D4ED8'
  const teamRing   = userSide === 'home' ? 'rgba(220,38,38,0.25)' : 'rgba(29,78,216,0.25)'

  const playerEvents = getPlayerMatchEvents(player, events, htStoredSec, group)
  const totalPoints  = playerEvents.reduce((s, e) => s + e.points, 0)
  // Live overrides on top of the season stats: count match events involving
  // this player so the card reflects what's happening right now (especially
  // saves for goalkeepers — KPI XML never refreshes mid-match).
  const liveSaves = playerEvents.reduce((n, e) => n + (e.type === 'save' ? 1 : 0), 0)
  const liveGoals = playerEvents.reduce((n, e) => n + (e.type === 'goal' ? 1 : 0), 0)
  const baseStats = player.stats || {}
  const stats = {
    ...baseStats,
    // Take whichever is higher — preserves season totals when live count is 0
    // and bumps up immediately as match events fire.
    saves: Math.max(Number(baseStats.saves) || 0, liveSaves),
    goals: Math.max(Number(baseStats.goals) || 0, liveGoals),
  }

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
        style={{
          background: 'linear-gradient(180deg, #0f1622 0%, #0a0f1a 100%)',
          border: `1px solid ${teamColor}55`,
          boxShadow: `0 30px 80px -20px rgba(0,0,0,0.75), 0 0 0 1px ${teamRing}`,
          maxWidth: 440,
          width: 'calc(100% - 32px)',
          maxHeight: 'calc(100dvh - 160px)',
          animation: 'playerPopupIn 320ms cubic-bezier(.22,1.4,.36,1)',
        }}
      >
        {/* ── FIFA-style header ── */}
        <div
          className="flex-shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${teamColor}55, ${teamColor}22)` }}
        >
          {/* Header shimmer accent — a faint diagonal highlight band that
              sweeps in once on mount, FUT-card style. */}
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)',
              animation: 'playerHeaderSweep 1.2s ease-out 0.1s 1',
            }}
          />
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

              {/* Match points badge — glow when non-zero so an active scorer
                  reads as "hot" at a glance. Live pulsing dot reinforces
                  the "this is live" feel even when the count is 0. */}
              <div className="flex items-center gap-2 mt-3">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{
                    background: totalPoints > 0 ? 'rgba(34,197,94,0.22)'
                              : totalPoints < 0 ? 'rgba(239,68,68,0.22)'
                              : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${
                      totalPoints > 0 ? 'rgba(34,197,94,0.55)'
                      : totalPoints < 0 ? 'rgba(239,68,68,0.55)'
                      : 'rgba(255,255,255,0.10)'
                    }`,
                    boxShadow: totalPoints > 0 ? '0 0 14px rgba(34,197,94,0.35)'
                             : totalPoints < 0 ? '0 0 14px rgba(239,68,68,0.30)'
                             : 'none',
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{
                      background: totalPoints > 0 ? '#22c55e'
                                : totalPoints < 0 ? '#ef4444'
                                : '#6b7280',
                      animation: 'playerPtsPulse 1.6s ease-in-out infinite',
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-gray-300 uppercase tracking-wider font-bold">Match pts</span>
                  <span className={`text-sm font-black tabular-nums ${
                    totalPoints > 0 ? 'text-emerald-300'
                    : totalPoints < 0 ? 'text-red-300'
                    : 'text-gray-300'
                  }`}>
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
            <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
              {/* Soft team-tinted ring + pulse so the empty state still
                  feels lively. Beats a flat emoji + grey text. */}
              <div
                className="relative w-16 h-16 rounded-full flex items-center justify-center"
                style={{
                  background: `radial-gradient(circle at 50% 35%, ${teamColor}25 0%, transparent 70%)`,
                  border: `1px dashed ${teamColor}55`,
                  boxShadow: `inset 0 0 18px ${teamColor}22`,
                  animation: 'playerEmptyPulse 2.4s ease-in-out infinite',
                }}
              >
                <span className="text-3xl" aria-hidden="true">⏱️</span>
              </div>
              <p className="text-gray-300 text-sm font-semibold tracking-wide">No moments yet</p>
              <p className="text-gray-600 text-xs">
                Watch the feed — events involving {displayName} land here.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── compact pill chips per scoring rule so the legend
            reads as a glanceable summary instead of a long sentence. */}
        <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-2.5">
          <div className="flex flex-wrap gap-1 justify-center">
            <ScoreChip label="GOL"   sub="GK +10 / DEF +6 / MID +5 / FWD +4" tone="emerald" />
            <ScoreChip label="AST"   sub="+3" tone="sky" />
            <ScoreChip label="SAVE"  sub="+2" tone="violet" />
            <ScoreChip label="CONC"  sub="−1" tone="rose-dim" />
            <ScoreChip label="YEL"   sub="−1" tone="amber" />
            <ScoreChip label="RED"   sub="−3" tone="rose" />
          </div>
        </div>
      </div>

      {/* Inline keyframes — keeps the component self-contained, matches
          the convention used by ScoreToast / MatchEndCelebration. */}
      <style>{`
        @keyframes playerPopupIn {
          0%   { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes playerHeaderSweep {
          0%   { transform: translateX(-30%); }
          100% { transform: translateX(30%); }
        }
        @keyframes playerPtsPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.25); }
        }
        @keyframes playerEmptyPulse {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%      { transform: scale(1.04); opacity: 1; }
        }
      `}</style>
    </>
  )
}

// Tiny chip used in the scoring-rules footer. Tone keys hold the
// (bg, border, text) Tailwind classes literally so the JIT keeps them
// during build.
function ScoreChip({ label, sub, tone }) {
  const tones = {
    emerald:  { bg: 'bg-emerald-500/12', border: 'border-emerald-500/30', text: 'text-emerald-300' },
    sky:      { bg: 'bg-sky-500/12',     border: 'border-sky-500/30',     text: 'text-sky-300' },
    violet:   { bg: 'bg-violet-500/12',  border: 'border-violet-500/30',  text: 'text-violet-300' },
    amber:    { bg: 'bg-amber-500/12',   border: 'border-amber-500/30',   text: 'text-amber-300' },
    rose:     { bg: 'bg-rose-500/15',    border: 'border-rose-500/35',    text: 'text-rose-300' },
    'rose-dim': { bg: 'bg-rose-500/8',   border: 'border-rose-500/22',    text: 'text-rose-300/80' },
  }
  const t = tones[tone] ?? tones.emerald
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${t.bg} ${t.border}`}
      title={`${label}: ${sub}`}
    >
      <span className={`text-[8px] font-black tracking-widest uppercase ${t.text}`}>{label}</span>
      <span className="text-[8px] text-gray-500 font-medium">{sub}</span>
    </div>
  )
}
