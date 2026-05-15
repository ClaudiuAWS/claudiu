import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useMatches } from '../hooks/useMatch'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const STATUS = {
  upcoming: { label: 'Upcoming',  pill: 'bg-white/5 text-gray-400',                dot: null },
  live:     { label: 'Live',      pill: 'bg-red-500/15 text-red-400',               dot: 'bg-red-500 animate-pulse' },
  halftime: { label: 'Half Time', pill: 'bg-yellow-500/15 text-yellow-400',         dot: 'bg-yellow-400' },
  fulltime: { label: 'Full Time', pill: 'bg-white/5 text-gray-500',                 dot: null },
}

function MatchCard({ match, onSelect }) {
  const s = STATUS[match.status] ?? STATUS.upcoming
  const isFinished = match.status === 'fulltime'
  const hasScore = match.status !== 'upcoming'

  return (
    <button
      onClick={() => !isFinished && onSelect(match)}
      disabled={isFinished}
      className="group w-full text-left rounded-3xl overflow-hidden transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-default"
      style={{ background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          {s.dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
          <span className={`text-[11px] font-semibold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${s.pill}`}>
            {s.label}
          </span>
        </div>
        <span className="text-[11px] text-gray-600 tracking-wider uppercase font-medium">Bundesliga</span>
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex-1">
          <p className="text-white font-semibold text-base leading-tight">{match.homeTeamName}</p>
          <p className="text-gray-600 text-xs mt-0.5">Home</p>
        </div>

        <div className="px-5 text-center min-w-[90px]">
          {hasScore ? (
            <>
              <p className="text-white font-bold text-3xl tracking-tight tabular-nums">
                {match.homeScore ?? 0}
                <span className="text-gray-700 mx-2">:</span>
                {match.awayScore ?? 0}
              </p>
              {match.currentMinute && match.status !== 'fulltime' && (
                <p className="text-red-400 text-xs mt-1 tabular-nums">{match.currentMinute}</p>
              )}
            </>
          ) : (
            <p className="text-gray-600 text-sm font-medium">vs</p>
          )}
        </div>

        <div className="flex-1 text-right">
          <p className="text-white font-semibold text-base leading-tight">{match.awayTeamName}</p>
          <p className="text-gray-600 text-xs mt-0.5">Away</p>
        </div>
      </div>

      {/* CTA footer */}
      {!isFinished && (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.03] group-active:bg-white/[0.06] transition-colors">
            <span className="text-xs text-gray-500">
              {match.status === 'upcoming' ? 'Create or join a party' : 'Join the action'}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6h7M6.5 3.5L9 6l-2.5 2.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      )}
    </button>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const { matches, loading, error } = useMatches()
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner />

  const live = matches.filter(m => m.status === 'live' || m.status === 'halftime')
  const rest = matches.filter(m => m.status !== 'live' && m.status !== 'halftime')

  return (
    <div className="px-4 pt-10 pb-4 space-y-8">

      {/* Matchday greeting — Serie-A "Mister" style with a stadium-glow chip
          and a thin red accent rule. The displayName drops in as the Mister's
          name; default is "Boss" so the slot never collapses. */}
      <div className="px-2">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3"
          style={{
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.35)',
            boxShadow: '0 0 14px -4px rgba(220,38,38,0.45)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-red-300">
            Matchday
          </span>
        </div>
        <h1
          className="text-white font-stadium text-4xl leading-none"
          style={{
            letterSpacing: '0.08em',
            textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
          }}
        >
          MISTER {(user?.displayName ?? 'Boss').toUpperCase()}
        </h1>
        <div
          className="mt-2.5 h-px w-14"
          style={{ background: 'linear-gradient(90deg, #dc2626 0%, transparent 100%)' }}
        />
        <p className="text-gray-400 text-xs mt-2 tracking-wide italic">
          The squad is yours. Forza.
        </p>
      </div>

      {error && (
        <div className="mx-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Live section */}
      {live.length > 0 && (
        <section className="space-y-3">
          <p className="px-2 text-[11px] font-semibold tracking-widest uppercase text-gray-500">Live now</p>
          {live.map(match => (
            <MatchCard key={match.matchId} match={match} onSelect={m => navigate(`/lobby/${m.matchId}`)} />
          ))}
        </section>
      )}

      {/* All other matches */}
      {rest.length > 0 && (
        <section className="space-y-3">
          <p className="px-2 text-[11px] font-semibold tracking-widest uppercase text-gray-500">
            {live.length > 0 ? 'Other matches' : 'Matches'}
          </p>
          {rest.map(match => (
            <MatchCard key={match.matchId} match={match} onSelect={m => navigate(`/lobby/${m.matchId}`)} />
          ))}
        </section>
      )}

      {matches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-4xl">⚽</p>
          <p className="text-gray-500 text-sm">No matches right now</p>
        </div>
      )}
    </div>
  )
}
