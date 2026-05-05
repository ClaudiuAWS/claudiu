import { useState } from 'react'
import { CombinedPitchView } from './CombinedPitchView'
import { PlayerStatsPopup } from './PlayerStatsPopup'
import { gameTimeToSeconds, formatFootballTime } from '../../utils/matchEvents'
import { detectFormation } from '../../utils/formationPositions'

const HOME_COLOR = '#DC2626'
const AWAY_COLOR = '#2563EB'

function MiniAvatar({ player, color }) {
  return (
    <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
      {player.imageUrl ? (
        <img
          src={player.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            objectFit: 'cover', objectPosition: 'center top',
            border: `1.5px solid ${color}`, display: 'block',
          }}
          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
        />
      ) : null}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: `${color}33`, border: `1.5px solid ${color}`,
        display: player.imageUrl ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: 900, fontSize: 8, fontFamily: 'system-ui',
      }}>
        {player.shirtNumber || '?'}
      </div>
    </div>
  )
}

export function SquadVisualization({
  match            = {},
  homeTeamPlayers  = [],
  awayTeamPlayers  = [],
  homeBenchPlayers = [],
  awayBenchPlayers = [],
  events           = [],
  homeMemberName   = null,
  awayMemberName   = null,
  onPlayerClick,
}) {
  const [selectedPlayer,   setSelectedPlayer]   = useState(null)
  const [selectedTeamRole, setSelectedTeamRole] = useState(null)

  const homeTeamName  = homeMemberName || match.homeTeamName  || 'Home'
  const awayTeamName  = awayMemberName || match.awayTeamName  || 'Away'

  const homeFormation = homeTeamPlayers.length > 0 ? detectFormation(homeTeamPlayers) : (match.homeFormation || '')
  const awayFormation = awayTeamPlayers.length > 0 ? detectFormation(awayTeamPlayers) : (match.awayFormation || '')

  const htEvent     = events.find(e => e.eventType === 'halftime')
  const htStoredSec = htEvent ? gameTimeToSeconds(htEvent.gameTime) : -1

  const handleHomeClick = (player) => {
    const p = { ...player, teamRole: 'home' }
    setSelectedPlayer(p)
    setSelectedTeamRole('home')
    onPlayerClick?.(p, 'home')
  }

  const handleAwayClick = (player) => {
    const p = { ...player, teamRole: 'away' }
    setSelectedPlayer(p)
    setSelectedTeamRole('away')
    onPlayerClick?.(p, 'away')
  }

  const handleClose = () => {
    setSelectedPlayer(null)
    setSelectedTeamRole(null)
  }

  const subs = events
    .filter(e => e.eventType === 'substitution')
    .sort((a, b) => gameTimeToSeconds(a.gameTime) - gameTimeToSeconds(b.gameTime))

  const hasBench = homeBenchPlayers.length > 0 || awayBenchPlayers.length > 0

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <CombinedPitchView
        homePlayers={homeTeamPlayers}
        awayPlayers={awayTeamPlayers}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeFormation={homeFormation}
        awayFormation={awayFormation}
        onHomePlayerClick={handleHomeClick}
        onAwayPlayerClick={handleAwayClick}
        selectedPlayerId={selectedPlayer?.playerId ?? null}
      />

      {/* Bench */}
      {hasBench && (
        <div className="w-full px-3">
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '10px 12px' }}>
            <p className="text-[8px] text-gray-600 uppercase tracking-widest mb-2">Bench</p>
            <div className="flex gap-4">
              {homeBenchPlayers.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-[7px] font-black uppercase mb-1.5" style={{ color: HOME_COLOR, letterSpacing: '0.06em' }}>
                    {homeTeamName}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {homeBenchPlayers.map(p => <MiniAvatar key={p.playerId} player={p} color={HOME_COLOR} />)}
                  </div>
                </div>
              )}
              {awayBenchPlayers.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-[7px] font-black uppercase mb-1.5" style={{ color: AWAY_COLOR, letterSpacing: '0.06em' }}>
                    {awayTeamName}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {awayBenchPlayers.map(p => <MiniAvatar key={p.playerId} player={p} color={AWAY_COLOR} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Substitutions */}
      {subs.length > 0 && (
        <div className="w-full px-3 pb-2">
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '10px 12px' }}>
            <p className="text-[8px] text-gray-600 uppercase tracking-widest mb-2">
              Substitutions ({subs.length})
            </p>
            <div className="space-y-1.5">
              {subs.map(ev => (
                <div key={ev.eventId} className="flex items-center gap-2">
                  <span className="text-[9px] tabular-nums text-gray-500 w-8 text-right flex-shrink-0">
                    {formatFootballTime(gameTimeToSeconds(ev.gameTime), htStoredSec)}
                  </span>
                  <span className="text-green-400 font-black text-sm leading-none">↑</span>
                  <span className="text-gray-300 text-[11px] flex-1 min-w-0 truncate">
                    {ev.playerInDisplay || ev.playerInId || '—'}
                  </span>
                  <span className="text-gray-600 font-black text-sm leading-none">↓</span>
                  <span className="text-gray-500 text-[11px] flex-1 min-w-0 truncate text-right">
                    {ev.playerOutDisplay || ev.playerOutId || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <PlayerStatsPopup
        player={selectedPlayer}
        isOpen={selectedPlayer !== null}
        onClose={handleClose}
        events={events}
        htStoredSec={htStoredSec}
      />
    </div>
  )
}
