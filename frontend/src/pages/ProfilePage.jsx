import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const AVATAR_COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-amber-400 to-orange-500',
]

// Stable color choice from displayName so the avatar is consistent across sessions.
function pickAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function ProfilePage() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  if (loading) return <LoadingSpinner />
  if (!user) return null

  const initials = (user.displayName || user.email || 'U')
    .split(/\s+/)
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleLogout = async () => {
    setSigningOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <h1 className="text-white text-2xl font-bold tracking-tight mb-6">Profile</h1>

      {/* Identity card */}
      <div
        className="rounded-3xl p-6 flex flex-col items-center"
        style={{
          background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          className={`w-20 h-20 rounded-full bg-gradient-to-br ${pickAvatarColor(user.displayName)} flex items-center justify-center text-white text-2xl font-black ring-4 ring-gray-950 shadow-xl`}
        >
          {initials}
        </div>
        <p className="text-white font-bold text-xl mt-4 truncate max-w-full">
          {user.displayName || 'Anonymous'}
        </p>
        <p className="text-gray-500 text-sm mt-1 truncate max-w-full">{user.email}</p>
      </div>

      {/* Account details */}
      <div
        className="mt-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Row label="Display name" value={user.displayName || '—'} />
        <Row label="Email" value={user.email || '—'} divider />
        <Row label="User ID" value={user.userId} divider mono />
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="mt-6 w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-default"
        style={{
          background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.18) 0%, rgba(220, 38, 38, 0.12) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#fca5a5',
        }}
      >
        {signingOut ? 'Signing out…' : 'Log out'}
      </button>
    </div>
  )
}

function Row({ label, value, divider, mono }) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 ${divider ? 'border-t border-white/5' : ''}`}
    >
      <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500">
        {label}
      </span>
      <span
        className={`text-sm text-gray-200 truncate ml-4 ${mono ? 'font-mono text-xs text-gray-400' : ''}`}
        style={{ maxWidth: '60%' }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
