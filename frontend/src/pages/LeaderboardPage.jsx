import { useEffect, useState } from 'react'
import { leaderboardApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/ui/LoadingSpinner'

/**
 * Global Leaderboard — all-time totalPoints across every match.
 *
 * Data source: claudiu-leaderboard table. Updated by event-processor at
 * match-end time via shared/leaderboard.py (called from history.py).
 *
 * UI pattern matches BadgesPage / TracksPage — glossy red header, dark
 * card body. Podium row for top 3, list for the rest. Current user is
 * highlighted in Bundesliga red wherever they appear.
 */
export default function LeaderboardPage() {
  const { user } = useAuth()
  const [list, setList] = useState(null)
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      leaderboardApi.list(100).catch(() => ({ leaderboard: [] })),
      leaderboardApi.me().catch(() => ({ me: null })),
    ])
      .then(([top, mine]) => {
        if (cancelled) return
        setList(top.leaderboard || [])
        setMe(mine.me || null)
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load') })
    return () => { cancelled = true }
  }, [])

  if (list === null && !error) return <LoadingSpinner />

  const myUserId = user?.userId
  const meIsInTop = !!list?.find(r => r.userId === myUserId)
  const myRow = me && me.matchesPlayed > 0 ? me : null

  // Top 3 → podium; rest → list
  const top3 = list?.slice(0, 3) || []
  const rest = list?.slice(3) || []

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      {/* Glossy header bar — same shape as BadgesPage / TracksPage */}
      <div className="relative overflow-hidden rounded-2xl mb-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
        <div
          className="relative px-5 py-4"
          style={{
            background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
            border: '1px solid rgba(220,38,38,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -12px rgba(220,38,38,0.50)',
          }}
        >
          <h1
            className="text-white font-stadium text-2xl leading-none"
            style={{
              letterSpacing: '0.10em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
            }}
          >
            LEADERBOARD
          </h1>
          <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
            All-time global rankings
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {(!list || list.length === 0) && !error && (
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center"
          style={{ background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-gray-400 text-sm mb-2">Leaderboard is empty</p>
          <p className="text-gray-600 text-xs">Play a match to land on the board.</p>
        </div>
      )}

      {top3.length > 0 && <Podium top3={top3} myUserId={myUserId} />}

      {rest.length > 0 && (
        <div className="mt-5 space-y-2">
          {rest.map((row, idx) => (
            <ListRow
              key={row.userId}
              row={row}
              rank={idx + 4}
              isMe={row.userId === myUserId}
            />
          ))}
        </div>
      )}

      {/* "Your rank" sticky card — only when user is OUTSIDE the top-N
          but has a row on the leaderboard */}
      {!meIsInTop && myRow && (
        <div className="mt-6">
          <p className="text-[10px] text-gray-500 tracking-widest uppercase font-semibold mb-2 px-1">
            Your rank
          </p>
          <ListRow
            row={{
              userId:        myRow.userId,
              displayName:   myRow.displayName || user?.displayName || 'You',
              avatarUrl:     myRow.avatarUrl || user?.avatarUrl || '',
              totalPoints:   myRow.totalPoints,
              matchesPlayed: myRow.matchesPlayed,
              wins:          myRow.wins,
            }}
            rank={myRow.rank ?? '—'}
            isMe={true}
          />
        </div>
      )}

      {/* If the user has zero matches yet, encourage them */}
      {!myRow && list && list.length > 0 && (
        <p className="text-center text-gray-600 text-xs mt-6 leading-relaxed">
          Play a match to climb the global ranks.
        </p>
      )}
    </div>
  )
}

// ---------- Podium ----------------------------------------------------

const PODIUM_ORDER = [1, 0, 2] // silver-gold-bronze visual order

function Podium({ top3, myUserId }) {
  // Pad to 3 if fewer
  const filled = [...top3]
  while (filled.length < 3) filled.push(null)

  return (
    <div className="grid grid-cols-3 gap-3 items-end">
      {PODIUM_ORDER.map(idx => {
        const row = filled[idx]
        if (!row) return <div key={idx} className="opacity-0" />
        const place = idx + 1
        return (
          <PodiumCard
            key={row.userId}
            row={row}
            place={place}
            isMe={row.userId === myUserId}
          />
        )
      })}
    </div>
  )
}

const PLACE_META = {
  1: {
    label: '1st',
    medal: '🥇',
    glow: 'rgba(234,179,8,0.55)',     // gold
    ring: 'rgba(234,179,8,0.70)',
    bg:   'linear-gradient(180deg, #1a1306 0%, #0d0a06 100%)',
    border: 'rgba(234,179,8,0.40)',
    height: 'pt-4 pb-5',               // tallest
  },
  2: {
    label: '2nd',
    medal: '🥈',
    glow: 'rgba(203,213,225,0.40)',    // silver
    ring: 'rgba(203,213,225,0.55)',
    bg:   'linear-gradient(180deg, #131720 0%, #0d0f14 100%)',
    border: 'rgba(203,213,225,0.30)',
    height: 'pt-3 pb-4',
  },
  3: {
    label: '3rd',
    medal: '🥉',
    glow: 'rgba(180,83,9,0.40)',       // bronze
    ring: 'rgba(180,83,9,0.55)',
    bg:   'linear-gradient(180deg, #1a0e07 0%, #0d0805 100%)',
    border: 'rgba(180,83,9,0.35)',
    height: 'pt-3 pb-4',
  },
}

function PodiumCard({ row, place, isMe }) {
  const meta = PLACE_META[place]
  const initials = (row.displayName || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()
  const points = Number(row.totalPoints ?? 0)

  return (
    <div
      className={`relative overflow-hidden rounded-2xl flex flex-col items-center px-2 ${meta.height}`}
      style={{
        background: meta.bg,
        border: `1px solid ${isMe ? 'rgba(248,113,113,0.45)' : meta.border}`,
        boxShadow: isMe
          ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 18px -6px ${meta.glow}, 0 0 0 1px rgba(220,38,38,0.25)`
          : `inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 18px -6px ${meta.glow}`,
      }}
    >
      {/* top sheen */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Medal */}
      <span className="text-2xl leading-none mb-1.5" aria-hidden>{meta.medal}</span>

      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 mb-2"
        style={{ border: `2px solid ${meta.ring}`, boxShadow: `0 0 14px -4px ${meta.glow}` }}
      >
        {row.avatarUrl ? (
          <img src={row.avatarUrl} alt={row.displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-sm font-black">
            {initials}
          </div>
        )}
      </div>

      {/* Name */}
      <p className={`text-[12px] font-semibold text-center leading-tight truncate w-full px-1 ${isMe ? 'text-red-300' : 'text-white'}`}>
        {row.displayName || 'Anonymous'}
        {isMe && <span className="block text-[9px] text-red-500 font-normal mt-0.5">YOU</span>}
      </p>

      {/* Points */}
      <p className="text-white font-stadium text-base mt-1 tabular-nums tracking-tight"
         style={{ letterSpacing: '0.04em' }}>
        {points.toLocaleString()}
      </p>
      <p className="text-gray-500 text-[9px] tracking-widest uppercase font-semibold">
        pts
      </p>
    </div>
  )
}

// ---------- List Row --------------------------------------------------

function ListRow({ row, rank, isMe }) {
  const initials = (row.displayName || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()
  const points = Number(row.totalPoints ?? 0)
  const matches = Number(row.matchesPlayed ?? 0)
  const wins = Number(row.wins ?? 0)

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors"
      style={{
        background: isMe
          ? 'linear-gradient(145deg, rgba(220,38,38,0.10) 0%, rgba(153,27,27,0.05) 100%)'
          : 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
        border: isMe
          ? '1px solid rgba(248,113,113,0.40)'
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Rank */}
      <span className={`text-[11px] font-bold tabular-nums w-8 text-center flex-shrink-0 ${isMe ? 'text-red-300' : 'text-gray-500'}`}>
        #{rank}
      </span>

      {/* Avatar */}
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
        {row.avatarUrl ? (
          <img src={row.avatarUrl} alt={row.displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-xs font-black">
            {initials}
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isMe ? 'text-red-300' : 'text-white'}`}>
          {row.displayName || 'Anonymous'}
          {isMe && <span className="ml-1.5 text-[9px] text-red-500 font-normal">YOU</span>}
        </p>
        <p className="text-gray-600 text-[10px] tracking-wider mt-0.5">
          {matches} {matches === 1 ? 'match' : 'matches'}
          {wins > 0 && ` · ${wins} ${wins === 1 ? 'win' : 'wins'}`}
        </p>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <p className="text-white font-stadium text-base tabular-nums" style={{ letterSpacing: '0.04em' }}>
          {points.toLocaleString()}
        </p>
        <p className="text-gray-500 text-[9px] tracking-widest uppercase font-semibold">
          pts
        </p>
      </div>
    </div>
  )
}
