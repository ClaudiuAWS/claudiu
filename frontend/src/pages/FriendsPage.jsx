import { useState, useEffect, useCallback } from 'react'
import { friendsApi } from '../services/api'

const AVATAR_COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-amber-400 to-orange-500',
]

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const cardStyle = {
  background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
}

function Avatar({ friend }) {
  const initials = (friend.displayName || friend.email || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
      {friend.avatarUrl ? (
        <img src={friend.avatarUrl} alt={friend.displayName} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${avatarColor(friend.displayName)} flex items-center justify-center text-white text-sm font-bold`}>
          {initials}
        </div>
      )}
    </div>
  )
}

function FriendRow({ friend, actions }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar friend={friend} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{friend.displayName || friend.email}</p>
        <p className="text-gray-500 text-xs truncate">{friend.email}</p>
      </div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  )
}

function IconButton({ onClick, disabled, label, color = 'gray', children }) {
  const colors = {
    gray:    'text-gray-600 hover:text-gray-300',
    red:     'text-gray-600 hover:text-red-400',
    emerald: 'text-emerald-400 hover:text-emerald-300',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${colors[color]} transition-colors disabled:opacity-40 p-2`}
    >
      {children}
    </button>
  )
}

const CheckIcon  = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
const CrossIcon  = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>

function Section({ title, count, children }) {
  if (count === 0) return null
  return (
    <section className="mb-6">
      <h2 className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 mb-2 px-1">
        {title} <span className="text-gray-600">· {count}</span>
      </h2>
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="divide-y divide-white/5">{children}</div>
      </div>
    </section>
  )
}

function AddFriendForm({ onAdd }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | loading | error
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setState('loading')
    setError(null)
    try {
      await onAdd(trimmed)
      setEmail('')
      setState('idle')
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setState('idle'); setError(null) }}
            placeholder="Add friend by email"
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"
          />
          <button
            type="submit"
            disabled={state === 'loading' || !email.trim()}
            className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40 font-semibold text-sm"
          >
            {state === 'loading' ? 'Sending…' : 'Send'}
          </button>
        </div>
        {error && <p className="px-4 pb-3 text-xs text-red-400">{error}</p>}
      </div>
    </form>
  )
}

export default function FriendsPage() {
  const [data, setData] = useState({ accepted: [], incoming: [], outgoing: [] })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const result = await friendsApi.list()
    setData({
      accepted: result.accepted || [],
      incoming: result.incoming || [],
      outgoing: result.outgoing || [],
    })
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const handleAdd = async (email) => {
    await friendsApi.add(email)
    await refresh()
  }

  const handleAccept = async (friendId) => {
    await friendsApi.accept(friendId)
    await refresh()
  }

  const handleRemove = async (friendId) => {
    await friendsApi.remove(friendId)
    await refresh()
  }

  const isEmpty = !loading
    && data.accepted.length === 0
    && data.incoming.length === 0
    && data.outgoing.length === 0

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <h1 className="text-white text-2xl font-bold tracking-tight mb-6">Friends</h1>

      <AddFriendForm onAdd={handleAdd} />

      {loading && (
        <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
      )}

      <Section title="Friend requests" count={data.incoming.length}>
        {data.incoming.map(f => (
          <FriendRow
            key={f.friendId}
            friend={f}
            actions={
              <>
                <IconButton onClick={() => handleAccept(f.friendId)} label="Accept" color="emerald">{CheckIcon}</IconButton>
                <IconButton onClick={() => handleRemove(f.friendId)} label="Decline" color="red">{CrossIcon}</IconButton>
              </>
            }
          />
        ))}
      </Section>

      <Section title="Friends" count={data.accepted.length}>
        {data.accepted.map(f => (
          <FriendRow
            key={f.friendId}
            friend={f}
            actions={
              <IconButton onClick={() => handleRemove(f.friendId)} label="Remove" color="red">{CrossIcon}</IconButton>
            }
          />
        ))}
      </Section>

      <Section title="Pending" count={data.outgoing.length}>
        {data.outgoing.map(f => (
          <FriendRow
            key={f.friendId}
            friend={f}
            actions={
              <IconButton onClick={() => handleRemove(f.friendId)} label="Cancel request" color="red">{CrossIcon}</IconButton>
            }
          />
        ))}
      </Section>

      {isEmpty && (
        <div className="rounded-2xl py-10 text-center" style={cardStyle}>
          <p className="text-gray-600 text-sm">No friends yet. Add someone above.</p>
        </div>
      )}
    </div>
  )
}
