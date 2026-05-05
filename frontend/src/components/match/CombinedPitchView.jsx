import { assignPlayersToFormation } from '../../utils/formationPositions'

const HOME_COLOR = '#DC2626'
const AWAY_COLOR = '#2563EB'
const GRASS_DARK  = '#1a6b2f'
const GRASS_LIGHT = '#1d7534'
const LINE_COLOR  = 'rgba(255,255,255,0.85)'

// Outfield tier order: defensive → attacking
const OUTFIELD_ORDER = ['DEF', 'CDM', 'CAM', 'FWD']

/**
 * Dynamically compute yPct for each tier based on how many rows are
 * actually populated. With 3 active rows the gaps are ~74 px; with 4
 * rows ~50 px — both comfortably clear of the 34 px dot diameter.
 */
function computeRowPcts(positioned, team) {
  const isHome = team === 'home'
  const gkPct  = isHome ? 93 :  7
  const nearGK = isHome ? 84 : 16   // first outfield row (closest to GK)
  const farGK  = isHome ? 53 : 47   // last  outfield row (closest to midline)

  const active = OUTFIELD_ORDER.filter(g => positioned.some(p => p.group === g))
  const n = active.length
  const pcts = { GK: gkPct }

  active.forEach((group, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    pcts[group] = nearGK + t * (farGK - nearGK)
  })

  return pcts
}

function PlayerDot({ player, xPct, yPct, color, isSelected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: 'translate(-50%, -50%)',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: isSelected ? '#14532d' : `${color}44`,
        border: `2px solid ${isSelected ? '#22c55e' : color}`,
        boxShadow: isSelected ? '0 0 8px rgba(34,197,94,0.7)' : '0 1px 6px rgba(0,0,0,0.7)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
      }}
    >
      {player.imageUrl ? (
        <>
          <img
            src={player.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block' }}
          />
          <span style={{ display: 'none', color: 'white', fontWeight: 900, fontSize: 10, fontFamily: 'system-ui' }}>
            {player.shirtNumber || '?'}
          </span>
        </>
      ) : (
        <span style={{ color: 'white', fontWeight: 900, fontSize: 10, fontFamily: 'system-ui' }}>
          {player.shirtNumber || '?'}
        </span>
      )}
    </div>
  )
}

export function CombinedPitchView({
  homePlayers = [],
  awayPlayers = [],
  homeTeamName = '',
  awayTeamName = '',
  homeFormation = '',
  awayFormation = '',
  onHomePlayerClick,
  onAwayPlayerClick,
  selectedPlayerId = null,
}) {
  const homePositioned = assignPlayersToFormation(homePlayers)
  const awayPositioned = assignPlayersToFormation(awayPlayers)
  const homeRowPcts = computeRowPcts(homePositioned, 'home')
  const awayRowPcts = computeRowPcts(awayPositioned, 'away')

  return (
    <div style={{ width: '100%' }}>
      {/* Away label */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <span style={{
          color: AWAY_COLOR, fontSize: 9, fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {awayTeamName}{awayFormation ? ` · ${awayFormation}` : ''}
        </span>
      </div>

      {/* Pitch container — flat, no 3D tilt */}
      <div style={{
        position: 'relative',
        width: '82%',
        maxWidth: '300px',
        margin: '0 auto',
        aspectRatio: '74 / 111',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* SVG pitch background */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }}>
          <svg
            viewBox="0 0 74 111"
            style={{ display: 'block', width: '100%', height: '100%' }}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect width="74" height="111" fill={GRASS_DARK} />
            {[0,1,2,3,4,5,6,7].map(i =>
              i % 2 === 0 ? (
                <rect key={i} x="3" y={3 + i * 13.125} width="68" height="13.125" fill={GRASS_LIGHT} opacity="0.5" />
              ) : null
            )}
            <g
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(3,3)"
            >
              <path d="M 0 0 h 68 v 105 h -68 Z" />
              <path d="M 0 52.5 h 68" />
              <circle r="9.15" cx="34" cy="52.5" />
              <circle r="0.75" cx="34" cy="52.5" fill={LINE_COLOR} stroke="none" />
              <path d="M 13.84 0 v 16.5 h 40.32 v -16.5" />
              <path d="M 24.84 0 v 5.5 h 18.32 v -5.5" />
              <circle r="0.75" cx="34" cy="10.94" fill={LINE_COLOR} stroke="none" />
              <path d="M 26.733027 16.5 a 9.15 9.15 0 0 0 14.533946 0" />
              <g transform="rotate(180,34,52.5)">
                <path d="M 13.84 0 v 16.5 h 40.32 v -16.5" />
                <path d="M 24.84 0 v 5.5 h 18.32 v -5.5" />
                <circle r="0.75" cx="34" cy="10.94" fill={LINE_COLOR} stroke="none" />
                <path d="M 26.733027 16.5 a 9.15 9.15 0 0 0 14.533946 0" />
              </g>
              <path d="M 0 2 a 2 2 0 0 0 2 -2 M 66 0 a 2 2 0 0 0 2 2 M 68 103 a 2 2 0 0 0 -2 2 M 2 105 a 2 2 0 0 0 -2 -2" />
            </g>
          </svg>
        </div>

        {/* Away players — top half, row pinned by tier */}
        {awayPositioned.map(player => {
          const xPct = (player.y / 74) * 100
          const yPct = awayRowPcts[player.group] ?? (player.x / 111) * 50
          return (
            <PlayerDot
              key={player.playerId}
              player={player}
              xPct={xPct}
              yPct={yPct}
              color={AWAY_COLOR}
              isSelected={!!(selectedPlayerId && player.playerId === selectedPlayerId)}
              onClick={() => onAwayPlayerClick?.(player)}
            />
          )
        })}

        {/* Home players — bottom half, row pinned by tier */}
        {homePositioned.map(player => {
          const xPct = (player.y / 74) * 100
          const yPct = homeRowPcts[player.group] ?? (50 + ((111 - player.x) / 111) * 50)
          return (
            <PlayerDot
              key={player.playerId}
              player={player}
              xPct={xPct}
              yPct={yPct}
              color={HOME_COLOR}
              isSelected={!!(selectedPlayerId && player.playerId === selectedPlayerId)}
              onClick={() => onHomePlayerClick?.(player)}
            />
          )
        })}
      </div>

      {/* Home label */}
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{
          color: HOME_COLOR, fontSize: 9, fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {homeTeamName}{homeFormation ? ` · ${homeFormation}` : ''}
        </span>
      </div>
    </div>
  )
}
