import { useState } from 'react'
import { CombinedPitchView } from './CombinedPitchView'
import { PlayerStatsPopup } from './PlayerStatsPopup'
import { gameTimeToSeconds, formatFootballTime } from '../../utils/matchEvents'
import { detectFormation } from '../../utils/formationPositions'
import { scoreIcon, styleForReason, formatDelta, scoreEventClass } from '../../utils/scoreFormatting'
import MemberAvatar from '../ui/MemberAvatar'

const HOME_COLOR = '#DC2626'
const AWAY_COLOR = '#2563EB'

/**
 * Compact avatar used by the substitutions list.
 *
 * Differs from `MiniAvatar` (which is for bench rosters) in that it
 *   - prefers a name-initial fallback over a shirt-number badge, which
 *     reads better at small sizes when no `imageUrl` is available,
 *   - takes a semantic `accent` colour so the border matches the row tint
 *     (emerald for IN, rose for OUT) without forcing the caller to ship
 *     a literal hex,
 *   - supports a `dim` flag so the OUT player visually steps back.
 */
function SubAvatar({ player = {}, fallbackName = '', accent = '#94a3b8', dim = false }) {
  const initial = (fallbackName || player.displayName || '?').trim()[0]?.toUpperCase() || '?'
  const ringOpacity = dim ? '88' : 'CC' // hex alpha suffix on the accent
  const fillBg     = dim ? `${accent}1f` : `${accent}33`
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
            border: `1.5px solid ${accent}${ringOpacity}`, display: 'block',
            opacity: dim ? 0.85 : 1,
          }}
          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
        />
      ) : null}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: fillBg,
        border: `1.5px solid ${accent}${ringOpacity}`,
        display: player.imageUrl ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: 900, fontSize: 11, fontFamily: 'system-ui',
        opacity: dim ? 0.9 : 1,
      }}>
        {initial}
      </div>
    </div>
  )
}

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
  members          = [],
  currentUserId    = null,
  scoreEvents      = [],
  playerMap        = {},
  onPlayerClick,
}) {
  const [selectedPlayer,   setSelectedPlayer]   = useState(null)
  const [selectedTeamRole, setSelectedTeamRole] = useState(null)
  const [showLeaderboard,  setShowLeaderboard]  = useState(true)
  // Per-user expansion in the leaderboard — tap a row to reveal that
  // user's scoring history (penalty goals, saves, reactions, cards…).
  // Sourced from sessionStorage-backed scoreEvents that useRoom
  // accumulates from every score_update WS broadcast.
  const [expandedUserId,   setExpandedUserId]   = useState(null)

  const homeTeamName  = homeMemberName || match.homeTeamName  || 'Home'
  const awayTeamName  = awayMemberName || match.awayTeamName  || 'Away'

  const homeFormation = homeTeamPlayers.length > 0 ? detectFormation(homeTeamPlayers) : (match.homeFormation || '')
  const awayFormation = awayTeamPlayers.length > 0 ? detectFormation(awayTeamPlayers) : (match.awayFormation || '')

  const htEvent     = events.find(e => e.eventType === 'halftime')
  const htStoredSec = htEvent ? gameTimeToSeconds(htEvent.gameTime) : -1

  // userSide is which side of THIS user's pitch the player sits on (drives
  // popup color). teamRole is the player's actual match team (Bayern home vs
  // Hamburg away) — must NOT be overwritten or downstream logic that depends
  // on the real team (e.g. GK concede detection) gets the wrong answer.
  const handleHomeClick = (player) => {
    const p = { ...player, userSide: 'home' }
    setSelectedPlayer(p)
    setSelectedTeamRole('home')
    onPlayerClick?.(p, 'home')
  }

  const handleAwayClick = (player) => {
    const p = { ...player, userSide: 'away' }
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

  // Leaderboard rows — newest scores cascade in via room.members WS updates,
  // so this just sorts & renders. Empty when the room has no members yet.
  const sortedMembers = [...members].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

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

      {/* Leaderboard — collapsible. Rendered between the pitch and the
          bench so it sits "right under the pitch" without overlapping the
          substitutions list at the bottom of the tab. */}
      {sortedMembers.length > 0 && (
        <div className="w-full px-3">
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
            <button
              type="button"
              onClick={() => setShowLeaderboard(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5"
            >
              <span className="text-[8px] text-gray-500 uppercase tracking-widest">
                Leaderboard
              </span>
              <div className="flex items-center gap-2">
                {!showLeaderboard && (
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {sortedMembers.map(m => `${(m.displayName || '?').slice(0, 6)} ${m.score ?? 0}`).join(' · ')}
                  </span>
                )}
                <span className={`text-gray-500 text-[10px] transition-transform ${showLeaderboard ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </div>
            </button>

            {showLeaderboard && (
              <div className="px-3 pb-3 space-y-1.5">
                {sortedMembers.map((m, i) => {
                  const isMe       = m.userId === currentUserId
                  const score      = m.score ?? 0
                  const isExpanded = expandedUserId === m.userId
                  const userEvents = scoreEvents
                    .filter(e => e.userId === m.userId && e.delta !== 0)
                    .slice().reverse()
                  const hasEvents  = userEvents.length > 0
                  return (
                    <div key={m.userId}>
                      <button
                        type="button"
                        onClick={() => setExpandedUserId(isExpanded ? null : m.userId)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                          isMe ? 'bg-red-500/10 border border-red-500/30' : 'bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className="w-4 text-center text-[10px] text-gray-500 font-bold">
                          {i + 1}
                        </span>
                        <MemberAvatar member={m} size={24} colorIndex={i} />
                        <span className={`flex-1 text-[12px] truncate ${isMe ? 'text-red-300 font-semibold' : 'text-gray-200'}`}>
                          {m.displayName || 'Player'}
                          {isMe && <span className="ml-1.5 text-[9px] text-red-500 font-normal">you</span>}
                        </span>
                        <span className={`text-[12px] font-bold tabular-nums ${
                          score > 0 ? 'text-white' : score < 0 ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {score > 0 ? '+' : ''}{score}
                        </span>
                        <span className={`text-gray-500 text-[10px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▾
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="mt-1.5 ml-6 mr-1 mb-1 space-y-1.5">
                          {hasEvents ? (
                            userEvents.map((ev, idx) => {
                              const style = styleForReason(ev.reason, ev.delta)
                              const icon  = scoreIcon(ev.reason, ev.delta)
                              const deltaColor = ev.delta > 0
                                ? 'text-emerald-300'
                                : ev.delta < 0 ? 'text-rose-300' : 'text-slate-400'
                              const deltaGlow = ev.delta > 0
                                ? 'drop-shadow(0 0 6px rgba(16,185,129,0.55))'
                                : ev.delta < 0 ? 'drop-shadow(0 0 6px rgba(244,63,94,0.55))' : 'none'
                              // Accent strip colour by event class. Tailwind needs literals.
                              const stripBg = {
                                emerald:  '#10b981',
                                sky:      '#0ea5e9',
                                cyan:     '#06b6d4',
                                amber:    '#f59e0b',
                                rose:     '#f43f5e',
                                violet:   '#8b5cf6',
                                fuchsia:  '#d946ef',
                                orange:   '#fb923c',
                                indigo:   '#6366f1',
                                slate:    '#94a3b8',
                              }[scoreEventClass(ev.reason, ev.delta)] || '#94a3b8'
                              return (
                                <div
                                  key={`${ev.ts}-${idx}`}
                                  className={`relative flex items-center gap-2.5 rounded-lg border ${style.border}
                                              bg-gradient-to-r ${style.gradient}
                                              pl-3 pr-2.5 py-2 overflow-hidden`}
                                  style={{
                                    animation: `scoreRowIn 320ms cubic-bezier(.22,1.4,.36,1) ${idx * 40}ms both`,
                                  }}
                                >
                                  {/* Left accent strip — sport-stat-card feel */}
                                  <span
                                    aria-hidden="true"
                                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-sm"
                                    style={{ background: stripBg, boxShadow: `0 0 8px ${stripBg}66` }}
                                  />
                                  {/* Emoji halo */}
                                  <span
                                    className={`relative w-8 h-8 rounded-full flex items-center justify-center ring-2 ${style.ring} flex-shrink-0`}
                                    style={{ boxShadow: `0 0 12px ${stripBg}33 inset` }}
                                  >
                                    <span className="text-base leading-none">{icon}</span>
                                  </span>
                                  {/* Reason + player */}
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-stadium ${style.text} text-[14px] tracking-wider uppercase truncate leading-tight`}>
                                      {ev.reason || 'Score event'}
                                    </p>
                                    {ev.playerName && (
                                      <p className="text-[10px] text-white/55 truncate leading-tight mt-0.5">
                                        {ev.playerName}
                                      </p>
                                    )}
                                  </div>
                                  {/* Delta — stadium scoreboard treatment */}
                                  <span
                                    className={`font-stadium tabular-nums text-2xl leading-none ${deltaColor}`}
                                    style={{ filter: deltaGlow, letterSpacing: '0.04em' }}
                                  >
                                    {formatDelta(ev.delta)}
                                  </span>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-[10.5px] text-gray-500 italic py-1.5 pl-1">
                              No scoring activity yet — points show up as the match progresses.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="text-center text-gray-600 text-[9px] pt-1">
                  Goal: GK +10 / DEF +6 / MID +5 / FWD +4 · Assist +3 · Save +2 · Yellow −1 · Red −3 · Reaction +2
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
            <div className="space-y-2">
              {subs.map((ev, idx) => {
                const inPlayer  = playerMap[ev.playerInId]  || {}
                const outPlayer = playerMap[ev.playerOutId] || {}
                const inName    = ev.playerInDisplay  || inPlayer.displayName  || '—'
                const outName   = ev.playerOutDisplay || outPlayer.displayName || '—'
                const minute    = formatFootballTime(gameTimeToSeconds(ev.gameTime), htStoredSec)
                return (
                  <div
                    key={ev.eventId}
                    className="flex items-stretch gap-1.5 text-[11px]"
                    style={{ animation: `subRowIn 320ms cubic-bezier(.22,1.4,.36,1) ${idx * 50}ms both` }}
                  >
                    {/* IN — left half */}
                    <div
                      className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-emerald-400/25 px-2 py-1.5"
                      style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0.04) 100%)' }}
                    >
                      <SubAvatar player={inPlayer} fallbackName={inName} accent="#10b981" />
                      <div className="flex-1 min-w-0">
                        <span className="block text-[8px] font-black uppercase tracking-widest text-emerald-300/85 leading-none mb-0.5">
                          IN ↑
                        </span>
                        <span className="block text-white text-[11.5px] font-semibold truncate leading-tight">
                          {inName}
                        </span>
                      </div>
                    </div>

                    {/* Time pill — centre */}
                    <div className="flex-shrink-0 flex items-center">
                      <span className="rounded-full bg-white/10 text-gray-200 text-[9.5px] font-bold tabular-nums px-2 py-0.5 border border-white/10">
                        {minute}
                      </span>
                    </div>

                    {/* OUT — right half */}
                    <div
                      className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-rose-400/25 px-2 py-1.5"
                      style={{ background: 'linear-gradient(270deg, rgba(244,63,94,0.16) 0%, rgba(244,63,94,0.04) 100%)' }}
                    >
                      <div className="flex-1 min-w-0 text-right">
                        <span className="block text-[8px] font-black uppercase tracking-widest text-rose-300/85 leading-none mb-0.5">
                          OUT ↓
                        </span>
                        <span className="block text-gray-200 text-[11.5px] font-semibold truncate leading-tight">
                          {outName}
                        </span>
                      </div>
                      <SubAvatar player={outPlayer} fallbackName={outName} accent="#f43f5e" dim />
                    </div>
                  </div>
                )
              })}
            </div>

            <style>{`
              @keyframes subRowIn {
                0%   { opacity: 0; transform: translateY(6px); }
                100% { opacity: 1; transform: translateY(0);   }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Keyframe used by the leaderboard score-event timeline rows.
          Declared once at root so it's available regardless of which user
          is expanded. */}
      <style>{`
        @keyframes scoreRowIn {
          0%   { opacity: 0; transform: translateX(-8px) scale(0.97); }
          100% { opacity: 1; transform: translateX(0)    scale(1);    }
        }
      `}</style>

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
