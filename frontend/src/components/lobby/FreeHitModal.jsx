import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { matchesApi, roomsApi } from '../../services/api'

// Mirror of backend/rooms/service.py:_POS_BUCKET — kept in sync with
// utils/formationPositions's POS_TO_GROUP shape.
const POS_BUCKET = {
  TW:  'GK',
  IVL: 'DEF', IVR: 'DEF', IVZ: 'DEF', IV: 'DEF', LV: 'DEF', RV: 'DEF',
  DMZ: 'MID', DML: 'MID', DMR: 'MID', DLM: 'MID', DRM: 'MID',
  ZO:  'MID', OLM: 'MID', ORM: 'MID',
  LA:  'FWD', RA:  'FWD', STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}
const bucketOf = (pos) => POS_BUCKET[pos] || 'MID'

const BUCKET_TINT = {
  GK:  'rgba(234,179,8,0.18)',
  DEF: 'rgba(59,130,246,0.18)',
  MID: 'rgba(16,185,129,0.18)',
  FWD: 'rgba(239,68,68,0.18)',
}

/**
 * FreeHitModal — consumes the user's armed 'free-hit' perk by swapping
 * one drafted player for another from the same position bucket.
 *
 * Two-step flow inside the modal:
 *   1. Tap a starter on the LEFT to mark as "swap out". The right
 *      panel fills with eligible incoming players (same bucket, not
 *      already drafted by ANY user).
 *   2. Tap an incoming player to confirm. POST → backend validates +
 *      writes → broadcasts room_update → modal closes.
 */
export default function FreeHitModal({ open, onClose, room, matchId, currentUserId }) {
  const [outPid, setOutPid] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !matchId) return
    setLoading(true)
    matchesApi.getPlayers(matchId)
      .then(players => setAllPlayers(Array.isArray(players) ? players : []))
      .catch(() => setAllPlayers([]))
      .finally(() => setLoading(false))
  }, [open, matchId])

  if (!open) return null

  const me = (room?.members || []).find(m => m.userId === currentUserId)
  const starters = me?.teamSelectionDetails || []

  // All player ids already drafted across every member — these are
  // ineligible as swap-in candidates.
  const draftedIds = new Set()
  for (const m of (room?.members || [])) {
    for (const pid of (m.teamSelection || [])) draftedIds.add(pid)
  }

  const outPlayer = starters.find(p => p.playerId === outPid)
  const outBucket = outPlayer ? bucketOf(outPlayer.position) : null

  // Eligible incoming players: same bucket, not already drafted.
  const eligible = outBucket
    ? allPlayers.filter(p => bucketOf(p.position) === outBucket && !draftedIds.has(p.playerId))
    : []

  const handleSwap = async (inPid) => {
    if (!room?.roomCode || !outPid || !inPid) return
    setSubmitting(true)
    try {
      await roomsApi.freeHitSwap(room.roomCode, outPid, inPid)
      toast.success('Free hit used — squad updated')
      onClose()
    } catch (e) {
      toast.error(e?.message || 'Swap failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md max-h-[88vh] rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #111827 0%, #0b1220 55%, #08101c 100%)',
          border: '1px solid rgba(245,158,11,0.40)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)',
        }}
      >
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <p className="text-amber-300 text-[10px] font-bold tracking-widest uppercase">Free Hit</p>
            <p className="text-white text-sm font-semibold mt-0.5">
              {outPid ? `Choose a ${outBucket} to bring in` : 'Tap a player to swap OUT'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {!outPid ? (
            // Step 1: list of current XI
            starters.map((p, i) => (
              <button
                key={p.playerId}
                onClick={() => setOutPid(p.playerId)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                style={{
                  background: BUCKET_TINT[bucketOf(p.position)],
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-white/70 text-[10px] font-bold w-5 text-center">{i + 1}</span>
                <span className="text-white text-sm font-semibold flex-1 truncate">
                  {p.displayName || `#${p.shirtNumber || '?'}`}
                </span>
                <span className="text-[9px] font-black tracking-widest uppercase text-white/60">
                  {bucketOf(p.position)}
                </span>
              </button>
            ))
          ) : loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading players…</p>
          ) : eligible.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No eligible {outBucket} replacements.</p>
          ) : (
            <>
              <button
                onClick={() => setOutPid(null)}
                className="text-[10px] font-bold tracking-widest uppercase text-gray-400 px-3 py-1.5"
              >
                ← Pick a different out
              </button>
              {eligible.map(p => (
                <button
                  key={p.playerId}
                  onClick={() => handleSwap(p.playerId)}
                  disabled={submitting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99] disabled:opacity-50"
                  style={{
                    background: BUCKET_TINT[bucketOf(p.position)],
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-white text-sm font-semibold flex-1 truncate">
                    {p.displayName || `#${p.shirtNumber || '?'}`}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate max-w-[40%]">
                    {p.teamName || ''}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
