import { GROUP_COLORS, TEAM_COLORS } from '../../utils/formationPositions'

/**
 * Player bubble for pitch visualization
 * Rendered as SVG circle with shirt number
 */
export function PlayerBubble({
  player,           // { shirtNumber, position, positionName, playerId, ... }
  position,         // { x, y }
  group,            // 'GK' | 'DEF' | 'MID' | 'FWD'
  teamRole,         // 'home' | 'away'
  onClick,          // callback when clicked
  size = 'md',      // 'sm' | 'md' | 'lg'
}) {
  if (!position || position.x == null || position.y == null) {
    return null
  }

  // Bubble radius based on size
  const radiusMap = { sm: 16, md: 20, lg: 24 }
  const radius = radiusMap[size] || 20

  // Colors
  const fillColor = GROUP_COLORS[group] || '#666666'
  const strokeColor = TEAM_COLORS[teamRole] || '#FFFFFF'

  // Handle click
  const handleClick = () => {
    if (onClick) {
      onClick(player)
    }
  }

  return (
    <g
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
      title={`${player.shirtNumber} - ${player.positionName || player.position}`}
    >
      {/* Bubble circle */}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2"
        opacity="0.8"
        style={{
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        }}
      />

      {/* Shirt number */}
      <text
        x={position.x}
        y={position.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={radius * 0.75}
        fontWeight="bold"
        pointerEvents="none"
      >
        {player.shirtNumber || '?'}
      </text>
    </g>
  )
}
