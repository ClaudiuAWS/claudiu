import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { roomsApi } from '../services/api'
import toast from 'react-hot-toast'

/**
 * Global per-user WebSocket listener for cross-page notifications
 * (currently: party invites). Mounts once at the app root.
 *
 * Channel: `user#{userId}` — every authenticated tab opens one. The Lambda
 * pushes a `room_invite` payload when a friend invites you to their party.
 */
export default function InviteListener() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(null)   // { roomCode, matchId, inviter }
  const [accepting, setAccepting] = useState(false)

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'room_invite') {
      // If a previous invite is still showing, replace it with the new one.
      setPending({
        roomCode: msg.roomCode,
        matchId:  msg.matchId,
        inviter:  msg.inviter || {},
      })
    }
  }, [])

  useWebSocket(user?.userId ? `user#${user.userId}` : null, handleMessage)

  const handleAccept = async () => {
    if (!pending) return
    setAccepting(true)
    try {
      await roomsApi.join(pending.roomCode)
      sessionStorage.setItem('fan_squad_room_code', pending.roomCode)
      toast.success('Joined the party!')
      navigate(`/lobby/${pending.matchId}`)
      setPending(null)
    } catch (err) {
      toast.error(err.message || 'Failed to join')
    } finally {
      setAccepting(false)
    }
  }

  const handleDecline = () => setPending(null)

  if (!pending) return null

  const inviter = pending.inviter
  const initials = (inviter.displayName || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] px-4 pt-3 pointer-events-none animate-[slideDown_300ms_ease-out]">
      <div
        className="max-w-md mx-auto rounded-2xl p-4 pointer-events-auto shadow-2xl"
        style={{
          background: 'linear-gradient(145deg, #1a2438 0%, #0d1117 100%)',
          border: '1px solid rgba(34,197,94,0.25)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            {inviter.avatarUrl ? (
              <img src={inviter.avatarUrl} alt={inviter.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{inviter.displayName || 'A friend'}</p>
            <p className="text-gray-400 text-xs truncate">invited you to a party</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            disabled={accepting}
            className="flex-1 py-2.5 rounded-xl text-gray-300 text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {accepting ? 'Joining…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
