import { assignPlayersToFormation, GROUP_COLORS, TEAM_COLORS } from '../../utils/formationPositions'

/**
 * Portrait pitch (74×111 SVG units, GK at bottom) with a mild 3D perspective.
 * Pitch lines are drawn in SVG (tilted). Player cards are HTML elements that
 * counter-rotate (rotateX -26deg) so they stand upright facing the camera.
 *
 * Coordinate mapping (landscape 111×74 → portrait 74×111):
 *   left%  = (player.y / 74)  * 100
 *   top%   = ((111 - player.x) / 111) * 100
 */
export function PitchView({
  teamPlayers      = [],
  benchPlayers     = [],
  teamRole         = 'home',
  teamName         = '',
  formation        = '4-2-3-1',
  onPlayerClick,
  selectedPlayerId = null,
  maxHeight        = '380px',
  showHeader       = true,
}) {
  const positioned = assignPlayersToFormation(teamPlayers)

  const POS_ABBR = {
    TW: 'GK',
    IVZ: 'CB', IVL: 'CB', IVR: 'CB',
    LV: 'LB', RV: 'RB',
    DMZ: 'CDM', DML: 'CDM', DMR: 'CDM', DLM: 'CDM', DRM: 'CDM',
    ZO: 'CAM',
    OLM: 'LM', ORM: 'RM',
    LA: 'LW', RA: 'RW',
    STZ: 'ST', STL: 'CF', STR: 'CF',
  }

  const GRASS_DARK  = '#1a6b2f'
  const GRASS_LIGHT = '#1d7534'
  const LINE_COLOR  = 'rgba(255,255,255,0.85)'

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {showHeader && (
        <div className="text-center">
          <h3 className="text-white font-bold text-base leading-tight">{teamName}</h3>
          <p className="text-gray-500 text-xs mt-0.5 tracking-wider">{formation}</p>
        </div>
      )}

      {/* Perspective parent */}
      <div style={{ perspective: '560px', perspectiveOrigin: '50% 100%', width: '100%', display: 'flex', justifyContent: 'center' }}>

        {/* 3D tilted container — preserve-3d so children can counter-rotate */}
        <div style={{
          width: '82%',
          maxWidth: '340px',
          aspectRatio: '74 / 111',
          position: 'relative',
          transform: 'rotateX(26deg)',
          transformOrigin: 'center bottom',
          transformStyle: 'preserve-3d',
          boxShadow: '0 20px 40px rgba(0,0,0,0.55)',
          borderRadius: '10px',
        }}>

          {/* Pitch background — clipped separately so overflow doesn't cut player cards */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '10px', overflow: 'hidden' }}>
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

          {/* Player cards — rotateX(-26deg) cancels parent tilt → faces camera */}
          {positioned.map((player) => {
            const cx = player.y
            const cy = 111 - player.x
            const xPct = (cx / 74)  * 100
            const yPct = (cy / 111) * 100

            const fill       = GROUP_COLORS[player.group] || '#374151'
            const stroke     = TEAM_COLORS[teamRole] || '#ffffff'
            const isSelected = !!(selectedPlayerId && player.playerId === selectedPlayerId)

            return (
              <div
                key={player.playerId}
                onClick={() => onPlayerClick?.(player)}
                style={{
                  position: 'absolute',
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  /* card stands upright: counter-rotate, then lift so bottom sits at player coord */
                  transform: 'rotateX(-26deg) translate(-50%, -92%)',
                  transformOrigin: '50% 100%',
                  cursor: 'pointer',
                  zIndex: Math.round(yPct),   // players lower on screen (higher y%) drawn on top
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Selection glow ring */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    inset: -4,
                    borderRadius: 11,
                    border: '2px solid #22c55e',
                    boxShadow: '0 0 14px rgba(34,197,94,0.7)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} />
                )}

                {/* Card */}
                <div style={{
                  width: 40,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: isSelected ? '#14532d' : 'rgba(8,12,26,0.92)',
                  border: `2px solid ${isSelected ? '#22c55e' : stroke}`,
                  boxShadow: '0 5px 18px rgba(0,0,0,0.9)',
                }}>
                  {/* Photo */}
                  <div style={{ width: '100%', height: 46, background: fill, overflow: 'hidden', position: 'relative' }}>
                    {player.imageUrl && !isSelected ? (
                      <img
                        src={player.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{
                          width: '85%',
                          height: 54,
                          objectFit: 'cover',
                          objectPosition: 'center top',
                          display: 'block',
                          margin: '0 auto',
                        }}
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 900, fontSize: 15,
                        fontFamily: 'system-ui, sans-serif',
                      }}>
                        {isSelected ? '⇄' : (player.shirtNumber || '?')}
                      </div>
                    )}
                  </div>

                  {/* Position label strip */}
                  <div style={{
                    textAlign: 'center',
                    padding: '2px 2px 4px',
                    background: `${stroke}28`,
                    borderTop: `1px solid ${stroke}70`,
                    color: 'white',
                    fontSize: 9,
                    fontWeight: 900,
                    lineHeight: 1.1,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    {POS_ABBR[player.position] || player.position || '?'}
                  </div>
                </div>
              </div>
            )
          })}

        </div>
      </div>

      {/* Bench strip */}
      {benchPlayers.length > 0 && (
        <div className="w-full">
          <p className="text-gray-600 text-[9px] uppercase tracking-widest mb-1.5 text-center">
            Bench ({benchPlayers.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 justify-center flex-wrap">
            {benchPlayers.map(player => {
              const pos   = POS_ABBR[player.position] || player.position || '?'
              const fill  = GROUP_COLORS[player.group] || '#374151'
              const solid = TEAM_COLORS[teamRole] || '#ffffff'
              return (
                <div
                  key={player.playerId}
                  onClick={() => onPlayerClick?.(player)}
                  className="flex flex-col items-center gap-0.5 cursor-pointer flex-shrink-0"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="relative w-9 h-9">
                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover object-top"
                        style={{ border: `1.5px solid ${solid}` }}
                        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                      />
                    ) : null}
                    <div
                      className="w-9 h-9 rounded-full items-center justify-center text-xs font-black text-white"
                      style={{
                        background: fill,
                        border: `1.5px solid ${solid}`,
                        display: player.imageUrl ? 'none' : 'flex',
                      }}
                    >
                      {player.shirtNumber || '?'}
                    </div>
                    {player.imageUrl && (
                      <span
                        className="absolute bottom-0 right-0 text-[7px] font-black text-white px-0.5 rounded-full leading-none"
                        style={{ background: solid, paddingTop: '1px', paddingBottom: '1px' }}
                      >
                        {player.shirtNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">{pos}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
