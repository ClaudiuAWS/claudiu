import { useEffect, useState } from 'react'
import { historyApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'

/**
 * Match History — permanent record of every match the user has played.
 *
 * Writes happen once at match end (event-processor → shared/history.py).
 * This page is read-only. Reverse-chronological order.
 */
export default function HistoryPage() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    historyApi.list(100)
      .then(data => { if (!cancelled) setItems(data.history || []) })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load') })
    return () => { cancelled = true }
  }, [])

  if (items === null && !error) return <LoadingSpinner />

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <h1 className="text-white text-2xl font-bold tracking-tight mb-1">Match History</h1>
      <p className="text-gray-500 text-sm mb-6">
        {error
          ? 'Couldn\'t load history.'
          : `${items?.length ?? 0} match${(items?.length ?? 0) === 1 ? '' : 'es'} played`}
      </p>

      {error && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {items && items.length === 0 && !error && (
        <div className="rounded-2xl p-8 flex flex-col items-center text-center"
          style={{ background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-gray-400 text-sm mb-2">No matches yet</p>
          <p className="text-gray-600 text-xs">Play your first match — it will show up here permanently.</p>
        </div>
      )}

      <div className="space-y-3">
        {items?.map((it, idx) => <HistoryRow key={`${it.endedAt}-${idx}`} item={it} />)}
      </div>
    </div>
  )
}

function HistoryRow({ item }) {
  const date = new Date(item.endedAt)
  const dateLabel = isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  const score = Number(item.userScore ?? 0)
  const rank = Number(item.rank ?? 0)
  const members = Number(item.members ?? 0)
  const won = !!item.won
  const solo = members <= 1
  const finalResult = item.finalResult || '—'

  // Result chip — won (gold), lost (red dim), or solo (neutral)
  const chipBg = won
    ? 'linear-gradient(135deg, rgba(234,179,8,0.20) 0%, rgba(202,138,4,0.10) 100%)'
    : solo
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(239,68,68,0.10)'
  const chipBorder = won
    ? 'rgba(234,179,8,0.40)'
    : solo
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(239,68,68,0.25)'
  const chipText = won
    ? 'text-yellow-300'
    : solo
      ? 'text-gray-400'
      : 'text-red-300'
  const chipLabel = won ? 'WIN' : solo ? 'PLAYED' : 'LOSS'

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Top: chip + date */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
        <span
          className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${chipText}`}
          style={{ background: chipBg, border: `1px solid ${chipBorder}` }}
        >
          {chipLabel}
        </span>
        <span className="text-[10px] text-gray-600 tracking-wider uppercase font-medium">{dateLabel}</span>
      </div>

      {/* Teams + match score */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{item.homeTeamName || 'Home'}</p>
          <p className="text-gray-600 text-[10px] mt-0.5 tracking-wider uppercase">Home</p>
        </div>
        <div className="px-3 text-center min-w-[68px]">
          <p className="text-white font-bold text-lg tabular-nums">{finalResult}</p>
          <p className="text-gray-600 text-[10px] mt-0.5 tracking-wider uppercase">Final</p>
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-white font-semibold text-sm truncate">{item.awayTeamName || 'Away'}</p>
          <p className="text-gray-600 text-[10px] mt-0.5 tracking-wider uppercase">Away</p>
        </div>
      </div>

      {/* Bottom: your stats */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-white/[0.015]">
        <div>
          <p className="text-[10px] text-gray-500 tracking-widest uppercase font-semibold">Your points</p>
          <p className={`text-base font-bold tabular-nums ${score > 0 ? 'text-white' : score < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {score > 0 ? '+' : ''}{score}
          </p>
        </div>
        {!solo && (
          <div className="text-right">
            <p className="text-[10px] text-gray-500 tracking-widest uppercase font-semibold">Rank</p>
            <p className="text-base font-bold tabular-nums text-white">
              {rank}<span className="text-gray-600">/{members}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
