import { useState } from 'react'
import toast from 'react-hot-toast'
import { roomsApi } from '../../services/api'

const MEDALS = ['🥇', '🥈', '🥉']

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-cyan-500',
]

const GROUP_COLOR = {
  GK:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  DEF: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  MID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  FWD: 'bg-red-500/20 text-red-400 border-red-500/40',
}

const POS_TO_GROUP = {
  TW:  'GK',
  IVR: 'DEF', IVL: 'DEF', IVZ: 'DEF', RV: 'DEF', LV: 'DEF',
  DMZ: 'MID', DMR: 'MID', DML: 'MID', DRM: 'MID', DLM: 'MID',
  ZO:  'MID', OLM: 'MID', ORM: 'MID',
  LA:  'FWD', RA: 'FWD', STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}

const TEAM_RING = {
  home: { solid: '#dc2626', ring: 'rgba(220,38,38,0.18)' },
  away: { solid: '#1d4ed8', ring: 'rgba(29,78,216,0.18)' },
}

// Each tile renders with a captain indicator. When the squad belongs to
// the current user, tapping a tile sets that player as captain (boost
// multiplier is 2× baseline, 3× when the user has captain-triple armed).
// The `onPickCaptain` prop being defined toggles "interactive" mode — for
// other members' squads, it's display-only.
function SquadList({ details = [], captainPlayerId = '', onPickCaptain = null, capMult = 2 }) {
  if (!details.length) {
    return <p className="text-gray-600 text-xs text-center py-3">No squad selected</p>
  }

  const grouped = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const d of details) {
    const g = POS_TO_GROUP[d.position] ?? 'MID'
    grouped[g].push(d)
  }

  return (
    <div className="mt-2 mb-1 space-y-1.5">
      {onPickCaptain && (
        <p className="text-[9px] text-amber-300/80 tracking-widest uppercase mb-1">
          Tap a player to set as captain ({capMult}× boost)
        </p>
      )}
      {['GK', 'DEF', 'MID', 'FWD'].map(g => {
        const players = grouped[g]
        if (!players.length) return null
        const gc = GROUP_COLOR[g]
        return (
          <div key={g} className="flex items-center gap-2">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 w-8 text-center ${gc}`}>
              {g}
            </span>
            <div className="flex gap-1 flex-wrap">
              {players.map((d, i) => {
                const tc = TEAM_RING[d.teamRole] ?? TEAM_RING.home
                const isCaptain = d.playerId && captainPlayerId === d.playerId
                const interactive = !!onPickCaptain
                const Tile = interactive ? 'button' : 'div'
                return (
                  <Tile
                    key={i}
                    type={interactive ? 'button' : undefined}
                    onClick={interactive ? () => onPickCaptain(d.playerId) : undefined}
                    className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0 transition-all ${interactive ? 'active:scale-90 hover:scale-110' : ''}`}
                    style={{
                      background: tc.ring,
                      border: `1.5px solid ${isCaptain ? '#fcd34d' : tc.solid}`,
                      boxShadow: isCaptain ? '0 0 8px -1px rgba(252,211,77,0.75)' : 'none',
                    }}
                    title={`${d.displayName || d.position} · ${d.teamRole}${isCaptain ? ' · Captain' : ''}`}
                  >
                    {d.shirtNumber ?? '?'}
                    {isCaptain && (
                      <span
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-black text-black"
                        style={{
                          background: '#fcd34d',
                          boxShadow: '0 0 4px rgba(252,211,77,0.8)',
                        }}
                      >
                        C
                      </span>
                    )}
                  </Tile>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LeaderboardPanel({ members = [], currentUserId, roomCode }) {
  const [expandedId, setExpandedId] = useState(null)
  const sorted = [...members].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // 3× when this user has captain-triple armed, else baseline 2×. Mirrors
  // TeamSelectionModal and the backend scoring path in event-processor's
  // _calculate_member_changes — keep all three in sync.
  const me = members.find(m => m.userId === currentUserId)
  const capMult = (me?.armedPerks || []).includes('captain-triple') ? 3 : 2

  const handlePickCaptain = async (playerId) => {
    try {
      await roomsApi.setCaptain(roomCode, playerId)
      toast.success(`Captain set — ${capMult}× boost active`)
    } catch (err) {
      toast.error(err?.message || 'Could not set captain')
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-gray-500 text-sm">No squad members yet</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {sorted.map((member, i) => {
        const isMe        = member.userId === currentUserId
        const medal       = MEDALS[i] ?? null
        const score       = member.score ?? 0
        const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length]
        const isExpanded  = expandedId === member.userId
        const hasSquad    = (member.teamSelectionDetails ?? []).length > 0

        return (
          <div
            key={member.userId}
            className={`px-4 pt-3 rounded-2xl transition-all border
              ${isMe
                ? 'border-red-500/40 bg-red-500/10'
                : 'border-white/[0.06] bg-white/[0.03]'}`}
          >
            {/* Row */}
            <button
              className="w-full flex items-center gap-3 pb-3"
              onClick={() => hasSquad && setExpandedId(isExpanded ? null : member.userId)}
            >
              {/* Rank */}
              <span className="w-6 text-center text-sm flex-shrink-0">
                {medal ?? <span className="text-gray-500 text-xs font-bold">{i + 1}</span>}
              </span>

              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                {member.displayName?.[0]?.toUpperCase() ?? '?'}
              </div>

              {/* Name */}
              <span className={`flex-1 text-sm truncate text-left ${isMe ? 'text-red-300 font-semibold' : 'text-white'}`}>
                {member.displayName}
                {isMe && <span className="ml-1.5 text-[10px] text-red-500 font-normal">you</span>}
              </span>

              {/* Score */}
              <span className={`text-sm font-bold tabular-nums ${score > 0 ? 'text-white' : score < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {score > 0 ? '+' : ''}{score}
              </span>

              {/* Expand chevron */}
              {hasSquad && (
                <span className={`text-gray-600 text-xs ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
              )}
            </button>

            {/* Squad */}
            {isExpanded && (
              <SquadList
                details={member.teamSelectionDetails ?? []}
                captainPlayerId={member.captainPlayerId || ''}
                onPickCaptain={isMe && roomCode ? handlePickCaptain : null}
                capMult={capMult}
              />
            )}
          </div>
        )
      })}

      <p className="text-center text-gray-600 text-[10px] pt-2">
        Points: Goal scorer +5 · Assist +3 · Valid-opponent bonus +2 · Yellow −1 · Red −3
      </p>
    </div>
  )
}
