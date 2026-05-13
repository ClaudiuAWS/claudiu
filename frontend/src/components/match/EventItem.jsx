import { gameTimeToSeconds, formatFootballTime } from '../../utils/matchEvents'

/**
 * Visual tier drives layout shape.
 * - hero    → goal (full photo card, score arrow, assist)
 * - major   → card (red), saved_shot, offside (row with photo)
 * - minor   → card (yellow) (row with compact photo)
 * - marker  → halftime / fulltime / secondhalf (centered chip divider)
 */

const EVENT_META = {
  goal: {
    tier: 'hero',
    label: 'Goal',
    accent: '#22c55e', // green-500
    glow: 'rgba(34,197,94,0.18)',
  },
  card: {
    tier: 'major', // downgraded to minor at runtime if yellow
    label: 'Card',
    accent: '#eab308', // yellow-500
    glow: 'rgba(234,179,8,0.12)',
  },
  saved_shot: {
    tier: 'major',
    label: 'Save',
    accent: '#3b82f6', // blue-500
    glow: 'rgba(59,130,246,0.12)',
  },
  offside: {
    tier: 'major',
    label: 'Offside',
    accent: '#f97316', // orange-500
    glow: 'rgba(249,115,22,0.12)',
  },
  substitution: {
    tier: 'major',
    label: 'Sub',
    accent: '#60a5fa', // blue-400
    glow: 'rgba(96,165,250,0.12)',
  },
  halftime:   { tier: 'marker', label: 'Half Time', accent: '#eab308' },
  fulltime:   { tier: 'marker', label: 'Full Time', accent: '#9ca3af' },
  secondhalf: { tier: 'marker', label: '2nd Half',  accent: '#22c55e' },
  nutmeg: {
    tier: 'major',
    label: 'Nutmeg',
    accent: '#a855f7',
    glow: 'rgba(168,85,247,0.12)',
  },
  spectacular_play: {
    tier: 'major',
    label: 'Skill',
    accent: '#ec4899',
    glow: 'rgba(236,72,153,0.12)',
  },
}

// Fallback meta for any event type we don't know about.
const FALLBACK_META = {
  tier: 'major',
  label: 'Event',
  accent: '#6b7280',
  glow: 'rgba(107,114,128,0.10)',
}

// -----------------------------------------------------------------------------
// Small pieces
// -----------------------------------------------------------------------------

function PlayerAvatar({ imageUrl, fallback, size = 40, accent = '#6b7280' }) {
  return (
    <div
      className="relative rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: '#1f2937',
        boxShadow: `0 0 0 1.5px ${accent}`,
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-gray-400 text-[11px] font-bold tracking-wide">
          {fallback}
        </span>
      )}
    </div>
  )
}

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()
}

function resolvePlayer(playerId, playerMap) {
  if (!playerId || !playerMap) return null
  return playerMap[playerId] || null
}

function teamRoleDot(role) {
  if (role === 'home') return '#3b82f6' // blue
  if (role === 'away') return '#ef4444' // red
  return 'transparent'
}

// -----------------------------------------------------------------------------
// Marker: halftime / fulltime / secondhalf — slim centered divider
// -----------------------------------------------------------------------------

function MarkerRow({ event, meta }) {
  const secondary = event.finalResult ?? null
  return (
    <div className="match-event-in flex items-center gap-3 py-2">
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}44, transparent)` }} />
      <div
        className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-2"
        style={{
          color: meta.accent,
          background: `${meta.accent}14`,
          border: `1px solid ${meta.accent}33`,
        }}
      >
        {meta.label}
        {secondary && <span className="text-gray-500 font-semibold">· {secondary}</span>}
      </div>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}44, transparent)` }} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Hero: Goal
// -----------------------------------------------------------------------------

function GoalHero({ event, meta, playerMap, displayTime }) {
  const scorer   = resolvePlayer(event.scoringPlayerId, playerMap)
  const assister = resolvePlayer(event.assistPlayerId,  playerMap)

  // Score split: "2:1" → ["2","1"]
  const [homeStr, awayStr] = (event.currentResult || '').split(':')
  const homeScore = homeStr?.trim() ?? ''
  const awayScore = awayStr?.trim() ?? ''
  const scoringRole = event.scoringTeamRole // 'home' | 'away'

  return (
    <div
      className="match-event-in goal-hero relative overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(135deg, ${meta.glow} 0%, transparent 60%), linear-gradient(145deg, #101827 0%, #0a0f1a 100%)`,
        border: `1px solid ${meta.accent}33`,
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: meta.accent }}
      />

      {/* Sweep shimmer (runs once on mount via CSS animation) */}
      <div className="goal-sweep absolute inset-0 pointer-events-none" />

      {/* Flying ball — arcs in from the left, spins, settles near the score */}
      <div className="goal-ball absolute pointer-events-none" aria-hidden="true">
        <SoccerBall size={26} />
      </div>

      <div className="relative px-4 py-4 flex items-center gap-4">
        {/* Scorer photo */}
        <PlayerAvatar
          imageUrl={scorer?.imageUrl}
          fallback={initials(event.scoringDisplay)}
          size={52}
          accent={meta.accent}
        />

        {/* Scorer + assist text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: meta.accent }}
            >
              Goal
            </span>
            {event.isPenalty && (
              <span className="text-[9px] font-bold tracking-widest uppercase text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                PEN
              </span>
            )}
            {displayTime && (
              <>
                <span className="text-gray-600 text-[10px]">·</span>
                <span className="text-gray-500 text-[10px] font-semibold tabular-nums">{displayTime}</span>
              </>
            )}
          </div>
          <p className="text-white text-[15px] font-bold truncate mt-0.5">
            {event.scoringDisplay}
          </p>
          {assister && event.assistDisplay && (
            <p className="text-gray-500 text-[11px] truncate mt-0.5">
              Assist · <span className="text-gray-300">{event.assistDisplay}</span>
            </p>
          )}
        </div>

        {/* Score pill */}
        {homeScore && awayScore && (
          <div className="flex-shrink-0 flex items-center gap-2 pl-3">
            <span
              className={`text-lg font-black tabular-nums ${scoringRole === 'home' ? 'text-white' : 'text-gray-500'}`}
            >
              {homeScore}
            </span>
            <span className="text-gray-600 text-xs font-bold">–</span>
            <span
              className={`text-lg font-black tabular-nums ${scoringRole === 'away' ? 'text-white' : 'text-gray-500'}`}
            >
              {awayScore}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Classic black-and-white soccer ball. Pure SVG, no deps.
function SoccerBall({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" fill="white" stroke="#111" strokeWidth="1" />
      {/* Center pentagon */}
      <polygon
        points="16,8 22,12.5 19.7,19.5 12.3,19.5 10,12.5"
        fill="#111"
      />
      {/* Outer seams pointing to the 5 corners */}
      <path d="M16 8 L16 3" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 12.5 L27 10.5" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M19.7 19.5 L23.5 24.5" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12.3 19.5 L8.5 24.5" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 12.5 L5 10.5" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// -----------------------------------------------------------------------------
// Standard row (major / minor) — used by everything that isn't goal or marker
// -----------------------------------------------------------------------------

function StandardRow({ event, meta, playerMap, displayTime }) {
  // Pick the "primary player" for photo depending on event type.
  let primaryPlayerId = null
  let primaryName     = null
  let secondaryName   = null
  let teamRole        = null
  let subtitle        = null

  switch (event.eventType) {
    case 'card':
      primaryPlayerId = event.playerId
      primaryName     = event.playerDisplay
      teamRole        = event.teamRole
      subtitle        = event.cardColor
        ? `${event.cardColor.charAt(0).toUpperCase() + event.cardColor.slice(1)} card`
        : null
      break
    case 'saved_shot':
      primaryPlayerId = event.goalKeeperId
      primaryName     = event.goalKeeperDisplay
      teamRole        = event.teamRole
      subtitle        = event.saveResult ?? null
      break
    case 'offside':
      primaryPlayerId = event.playerId
      primaryName     = event.playerDisplay
      teamRole        = event.teamRole
      subtitle        = 'Caught offside'
      break
    case 'substitution':
      primaryPlayerId = event.playerInId
      primaryName     = event.playerInDisplay
      secondaryName   = event.playerOutDisplay
      teamRole        = event.teamRole
      subtitle        = secondaryName ? `${secondaryName} off` : null
      break
    case 'nutmeg':
      primaryPlayerId = event.playerId
      primaryName     = event.playerDisplay
      teamRole        = event.teamRole
      subtitle        = event.affectedDisplay ? `vs ${event.affectedDisplay}` : null
      break
    case 'spectacular_play':
      primaryPlayerId = event.playerId
      primaryName     = event.playerDisplay
      teamRole        = event.teamRole
      subtitle        = event.playType ?? null
      break
    default:
      primaryName = event.eventType
  }

  const player = resolvePlayer(primaryPlayerId, playerMap)
  const isYellowCard = event.eventType === 'card' && event.cardColor === 'yellow'

  return (
    <div
      className="match-event-in relative flex items-center gap-3 pl-4 pr-4 py-3 rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: meta.accent, opacity: isYellowCard ? 0.6 : 1 }}
      />

      {/* Player photo (or fallback dot) */}
      <div className="relative flex-shrink-0">
        <PlayerAvatar
          imageUrl={player?.imageUrl}
          fallback={initials(primaryName)}
          size={36}
          accent={meta.accent}
        />
        {/* Team dot */}
        {teamRole && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{
              background: teamRoleDot(teamRole),
              borderColor: '#0a0f1a',
            }}
          />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: meta.accent }}
          >
            {isYellowCard ? 'Yellow' : (event.eventType === 'card' && event.cardColor === 'red' ? 'Red' : meta.label)}
          </span>
          {subtitle && <span className="text-gray-700 text-[10px]">·</span>}
          {subtitle && <span className="text-gray-500 text-[10px] truncate">{subtitle}</span>}
        </div>
        <p className="text-white text-sm font-medium mt-0.5 truncate">
          {primaryName}
          {event.eventType === 'substitution' && secondaryName && (
            <span className="text-gray-500 font-normal"> on</span>
          )}
        </p>
      </div>

      {/* Time */}
      {displayTime && (
        <div className="flex-shrink-0">
          <span className="text-gray-500 text-xs font-semibold tabular-nums">
            {displayTime}
          </span>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Public component
// -----------------------------------------------------------------------------

export default function EventItem({ event, htStoredSec = -1, playerMap = {} }) {
  const meta = EVENT_META[event.eventType] ?? FALLBACK_META

  const storedSec = gameTimeToSeconds(event.gameTime)
  const isBoundary = ['halftime', 'secondhalf', 'fulltime'].includes(event.eventType)
  const displayTime = isBoundary ? null : formatFootballTime(storedSec, htStoredSec)

  if (meta.tier === 'marker') {
    return <MarkerRow event={event} meta={meta} />
  }
  if (event.eventType === 'goal') {
    return <GoalHero event={event} meta={meta} playerMap={playerMap} displayTime={displayTime} />
  }
  return <StandardRow event={event} meta={meta} playerMap={playerMap} displayTime={displayTime} />
}
