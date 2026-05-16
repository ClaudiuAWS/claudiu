import { useState, useEffect } from 'react'
import { friendsApi } from '../../services/api'

const cardStyle = {
  background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
}

const AVATAR_COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
]

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function FriendRow({ friend, onInvite, sent }) {
  const initials = (friend.displayName || friend.email || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
        {friend.avatarUrl ? (
          <img src={friend.avatarUrl} alt={friend.displayName} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${avatarColor(friend.displayName)} flex items-center justify-center text-white text-xs font-bold`}>
            {initials}
          </div>
        )}
      </div>
      <span className="text-white text-sm font-medium flex-1 truncate">{friend.displayName || friend.email}</span>
      <button
        onClick={() => onInvite(friend.friendId)}
        disabled={sent}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
          sent
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-green-500 hover:bg-green-400 active:bg-green-600 text-white'
        }`}
      >
        {sent ? 'Sent ✓' : 'Invite'}
      </button>
    </div>
  )
}

export default function InviteFriendsModal({ roomCode, onClose }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [sentIds, setSentIds] = useState(new Set())

  useEffect(() => {
    friendsApi.list()
      .then(data => setFriends(data.accepted || []))
      .finally(() => setLoading(false))
  }, [])

  const handleInvite = async (friendId) => {
    try {
      await friendsApi.invite(friendId, roomCode)
      setSentIds(prev => new Set([...prev, friendId]))
    } catch {
      // Silently fail — user can retry
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pb-[88px] sm:pb-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — capped to the visible area minus the BottomNav so the list
          never disappears under the nav on mobile. */}
      <div
        className="relative w-full max-w-md max-h-[calc(100vh-120px)] sm:max-h-[70vh] rounded-3xl overflow-hidden flex flex-col"
        style={cardStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-bold text-base">Invite Friends</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : friends.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-8">No friends yet. Add some in the Friends tab.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {friends.map(f => (
                <FriendRow
                  key={f.friendId}
                  friend={f}
                  onInvite={handleInvite}
                  sent={sentIds.has(f.friendId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
