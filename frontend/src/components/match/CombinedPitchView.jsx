import { assignPlayersToFormation } from '../../utils/formationPositions'

const HOME_COLOR = '#DC2626'
const AWAY_COLOR = '#2563EB'
const GRASS_DARK  = '#1a6b2f'
const GRASS_LIGHT = '#1d7534'
const LINE_COLOR  = 'rgba(255,255,255,0.85)'

/**
 * Compute yPct for each row based on the formation template's x value,
 * NOT the group label. Players at the same x form a single row — this
 * matters for 3-4-3 where the template puts CDM and CAM both at x=48 so
 * all 4 mids sit in ONE horizontal line. Grouping by the old `group`
 * label put CDM and CAM in separate rows (two layers of 2) regardless
 * of what the template said, breaking the textbook 3-4-3 shape.
 *
 * For every other formation, distinct groups already live at distinct x
 * values (DEF≈22 / CDM≈40-52 / CAM≈58-62 / FWD≈82-87), so x-grouping
 * gives the same row count and same positions as today.
 */
function computeRowPcts(positioned, team) {
  const isHome = team === 'home'
  const gkPct  = isHome ? 93 :  7
  const nearGK = isHome ? 84 : 16   // first outfield row (closest to GK)
  const farGK  = isHome ? 53 : 47   // last  outfield row (closest to midline)

  // Distinct outfield x values. Rounded so near-equal x doesn't split a
  // row by floating-point noise from the assignment algorithm's even
  // spread. Sorted ascending so the lowest x (defenders, x≈22) is the
  // row NEAREST the GK and the highest x (forwards, x≈85) is the row
  // FARTHEST from the GK.
  const outfieldXs = [...new Set(
    positioned.filter(p => p.group !== 'GK').map(p => Math.round(p.x))
  )].sort((a, b) => a - b)

  // Keyed by rounded x; reserved key '__GK__' for the keeper row so an
  // accidental x=0 player can't collide with the GK slot.
  const pcts = { __GK__: gkPct }
  const n = outfieldXs.length
  outfieldXs.forEach((x, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    pcts[x] = nearGK + t * (farGK - nearGK)
  })

  return pcts
}

function PlayerDot({ player, xPct, yPct, color, isSelected, isCaptain, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        top: `${yPct}%`,
        // outer wrapper keeps the captain badge OUTSIDE the dot's circular
        // clip; the dot's `overflow: hidden` lives on the inner avatar wrapper.
        transform: 'translate(-50%, -50%)',
        width: 34,
        height: 34,
        cursor: 'pointer',
        zIndex: isCaptain ? 2 : 1,
        WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
      }}
    >
      {/* Captain marker — yellow "C" disc at the top-right of the dot.
          Renders for every member's captain on the pitch (current user
          + opponents) so users see who has the 2× scoring boost. */}
      {isCaptain && (
        <div style={{
          position: 'absolute',
          top: -4,
          right: -4,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #fcd34d 0%, #d97706 100%)',
          border: '1.5px solid #fbbf24',
          boxShadow: '0 0 6px rgba(252,211,77,0.7), 0 2px 3px rgba(0,0,0,0.4)',
          color: '#1a0606',
          fontSize: 10,
          fontWeight: 900,
          lineHeight: '13px',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          zIndex: 3,
          pointerEvents: 'none',
        }}>C</div>
      )}

      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: isSelected ? '#14532d' : `${color}44`,
          border: `2px solid ${isSelected ? '#22c55e' : color}`,
          boxShadow: isSelected ? '0 0 8px rgba(34,197,94,0.7)' : '0 1px 6px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
  captainPlayerIds = null,   // Set<string> of every member's captainPlayerId
}) {
  const captainSet = captainPlayerIds instanceof Set ? captainPlayerIds : new Set()
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

        {/* Away players — top half, row pinned by formation x */}
        {awayPositioned.map(player => {
          const xPct = (player.y / 74) * 100
          const yPct = player.group === 'GK'
            ? awayRowPcts.__GK__
            : (awayRowPcts[Math.round(player.x)] ?? (player.x / 111) * 50)
          return (
            <PlayerDot
              key={player.playerId}
              player={player}
              xPct={xPct}
              yPct={yPct}
              color={AWAY_COLOR}
              isSelected={!!(selectedPlayerId && player.playerId === selectedPlayerId)}
              isCaptain={captainSet.has(player.playerId)}
              onClick={() => onAwayPlayerClick?.(player)}
            />
          )
        })}

        {/* Home players — bottom half, row pinned by formation x */}
        {homePositioned.map(player => {
          const xPct = (player.y / 74) * 100
          const yPct = player.group === 'GK'
            ? homeRowPcts.__GK__
            : (homeRowPcts[Math.round(player.x)] ?? (50 + ((111 - player.x) / 111) * 50))
          return (
            <PlayerDot
              key={player.playerId}
              player={player}
              xPct={xPct}
              yPct={yPct}
              color={HOME_COLOR}
              isSelected={!!(selectedPlayerId && player.playerId === selectedPlayerId)}
              isCaptain={captainSet.has(player.playerId)}
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
