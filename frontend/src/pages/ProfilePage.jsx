import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { profileApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAppAudio } from '../hooks/useAppAudio'
import DiscArtwork from '../components/ui/DiscArtwork'

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

      {/* Music */}
      <MusicCard />

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

/**
 * Music preferences card.
 *
 * Two independent on/off toggles + a wallpaper-style track picker:
 *   - App music: ambient track that loops while you're in the app
 *     (post-login).
 *   - Intro music: plays during the splash screen.
 *
 * Each unlocked track shows two pills — "Intro" and "App" — and
 * tapping a pill assigns this track to that role (like setting a
 * wallpaper for the lock screen vs home screen). A track can be
 * the active choice for both, neither (when more songs unlock and
 * the user picks another), or just one.
 *
 * v1 ships one default track ("A Fresh Energy"); future unlocks
 * come from badges and appear in the list automatically (`tracks`
 * is the filtered, unlocked-only list from useAppAudio).
 *
 * All preferences persist via localStorage (handled in useAppAudio).
 */
function MusicCard() {
  const navigate = useNavigate()
  const {
    appEnabled, toggleApp, appVolume, setAppVolume,
    introEnabled, toggleIntro,
    appTrack, tracks,
  } = useAppAudio()

  const volPct = Math.round(appVolume * 100)

  return (
    <div
      className="mt-4 rounded-2xl p-5"
      style={{
        background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">
        Music
      </p>

      {/* App music toggle row */}
      <MusicToggleRow
        icon="🎵"
        title="App music"
        sub="Background track while you watch matches"
        enabled={appEnabled}
        onToggle={toggleApp}
      />

      {/* Volume slider — visible only when app music is enabled. */}
      {appEnabled && (
        <div className="mt-1 mb-2 pl-[52px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
              Volume
            </span>
            <span className="text-[10px] font-bold tracking-widest text-red-300 tabular-nums">
              {volPct}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={volPct}
            onChange={e => setAppVolume(Number(e.target.value) / 100)}
            className="claudiu-slider w-full"
            style={{ '--v': `${volPct}%` }}
          />
        </div>
      )}

      {/* Intro music toggle row */}
      <MusicToggleRow
        icon="🎬"
        title="Intro music"
        sub="Plays during the splash screen"
        enabled={introEnabled}
        onToggle={toggleIntro}
      />

      {/* "Now playing" link to the full TracksPage. */}
      <button
        type="button"
        onClick={() => navigate('/tracks')}
        className="w-full mt-4 pt-4 border-t border-white/5 group text-left"
      >
        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">
          Now playing
        </p>
        <div
          className="flex items-center gap-3 rounded-xl p-2.5 transition-colors group-hover:bg-white/[0.04]"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <DiscArtwork track={appTrack} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">
              {appTrack?.title || '—'}
            </p>
            <p className="text-gray-500 text-[11px] truncate leading-tight">
              {appTrack?.artist || '—'}
            </p>
          </div>
          <span className="text-gray-500 text-lg leading-none flex-shrink-0">›</span>
        </div>
        <p className="text-gray-500 text-[10px] mt-2 leading-snug">
          Browse all {tracks.length} {tracks.length === 1 ? 'disc' : 'discs'} you own →
        </p>
      </button>
    </div>
  )
}

function MusicToggleRow({ icon, title, sub, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: enabled
              ? 'linear-gradient(135deg, rgba(220,38,38,0.30) 0%, rgba(153,27,27,0.20) 100%)'
              : 'rgba(255,255,255,0.06)',
            border: `1px solid ${enabled ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.10)'}`,
            boxShadow: enabled ? '0 0 18px -4px rgba(220,38,38,0.45)' : 'none',
            transition: 'background 0.2s, box-shadow 0.2s, border-color 0.2s',
          }}
        >
          <span className="text-lg leading-none">{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">{title}</p>
          <p className="text-gray-500 text-[11px] truncate leading-tight">{sub}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className="flex-shrink-0 relative w-12 h-7 rounded-full transition-colors"
        style={{
          background: enabled ? '#dc2626' : 'rgba(255,255,255,0.10)',
          boxShadow: enabled ? '0 0 14px -2px rgba(220,38,38,0.55)' : 'none',
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform"
          style={{
            transform: enabled ? 'translateX(20px)' : 'translateX(0)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}
        />
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
