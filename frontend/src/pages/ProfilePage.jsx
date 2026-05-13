import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { profileApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const AVATAR_COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-amber-400 to-orange-500',
]

function pickAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function ProfilePage() {
  const { user, loading, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [uploadState, setUploadState] = useState('idle') // idle | uploading | success | error
  const [uploadError, setUploadError] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Instant local preview
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    setUploadState('uploading')
    setUploadError(null)

    try {
      const { uploadUrl, avatarUrl } = await profileApi.getUploadUrl(file.type)
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      await profileApi.update(avatarUrl)
      await refreshUser()
      setUploadState('success')
      setTimeout(() => setUploadState('idle'), 2000)
    } catch (err) {
      setPreviewUrl(null)
      setUploadError(err.message || 'Upload failed')
      setUploadState('error')
      setTimeout(() => setUploadState('idle'), 3000)
    } finally {
      URL.revokeObjectURL(localUrl)
      e.target.value = ''
    }
  }

  const displayAvatar = previewUrl || user.avatarUrl

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
        {/* Avatar */}
        <button
          onClick={() => uploadState === 'idle' && fileInputRef.current?.click()}
          className="relative group focus:outline-none"
          aria-label="Change profile picture"
        >
          {/* Image or initials */}
          <div className="w-20 h-20 rounded-full ring-4 ring-gray-950 shadow-xl overflow-hidden">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="avatar"
                className="w-full h-full object-cover"
                style={{
                  transition: 'opacity 0.3s ease',
                  opacity: uploadState === 'uploading' ? 0.5 : 1,
                }}
              />
            ) : (
              <div
                className={`w-full h-full bg-gradient-to-br ${pickAvatarColor(user.displayName)} flex items-center justify-center text-white text-2xl font-black`}
              >
                {initials}
              </div>
            )}
          </div>

          {/* Hover / state overlay */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-200"
            style={{
              background: 'rgba(0,0,0,0.55)',
              opacity: uploadState !== 'idle' ? 1 : 0,
            }}
            // show on hover via group
          >
            {uploadState === 'uploading' && (
              <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {uploadState === 'success' && (
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {uploadState === 'error' && (
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          {/* Hover edit hint (idle only) */}
          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
            </svg>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Status text */}
        <div className="h-5 mt-2 flex items-center justify-center">
          {uploadState === 'uploading' && (
            <p className="text-xs text-gray-400 animate-pulse">Uploading…</p>
          )}
          {uploadState === 'success' && (
            <p className="text-xs text-emerald-400">Photo updated</p>
          )}
          {uploadState === 'error' && (
            <p className="text-xs text-red-400">{uploadError}</p>
          )}
        </div>

        <p className="text-white font-bold text-xl mt-2 truncate max-w-full">
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
    <div className={`flex items-center justify-between px-5 py-4 ${divider ? 'border-t border-white/5' : ''}`}>
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
