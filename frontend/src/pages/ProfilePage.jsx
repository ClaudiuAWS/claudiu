import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { profileApi, leaderboardApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useAppAudio } from '../hooks/useAppAudio'
import { useCredits } from '../hooks/useCredits'
import DiscArtwork from '../components/ui/DiscArtwork'
import PretzelCoin from '../components/ui/PretzelCoin'
import DisplayName from '../components/ui/DisplayName'
import BadgesShowcase from '../components/profile/BadgesShowcase'

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
      {/* Glossy header */}
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
            style={{ letterSpacing: '0.10em', textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)' }}
          >
            PROFILE
          </h1>
          <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
            Your identity & settings
          </p>
        </div>
      </div>

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

        <DisplayName
          name={user.displayName || 'Anonymous'}
          userId={user.userId}
          className="text-white font-bold text-xl mt-2 truncate max-w-full"
          style={{ display: 'block' }}
        />
        <p className="text-gray-500 text-sm mt-1 truncate max-w-full">{user.email}</p>
      </div>

      {/* Portfolio: earned crests above the wallet — trophies first. */}
      <BadgesShowcase />

      {/* Stats row */}
      <StatsRow />

      {/* Quick actions */}
      <QuickActions />

      {/* Wallet */}
      <CreditsCard />

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

      {/* Help & Tutorial */}
      <HelpCard />

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

function StatsRow() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    leaderboardApi.me().then(d => setStats(d.me)).catch(() => {})
  }, [])
  if (!stats || !stats.matchesPlayed) return null
  const winRate = stats.matchesPlayed > 0 ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0
  return (
    <div
      className="mt-4 rounded-2xl px-4 py-3 flex items-center justify-around"
      style={{ background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <StatPill label="Matches" value={stats.matchesPlayed} />
      <div className="w-px h-8 bg-white/10" />
      <StatPill label="Wins" value={stats.wins} />
      <div className="w-px h-8 bg-white/10" />
      <StatPill label="Win %" value={`${winRate}%`} />
      <div className="w-px h-8 bg-white/10" />
      <StatPill label="Rank" value={stats.rank ? `#${stats.rank}` : '—'} />
    </div>
  )
}

function StatPill({ label, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-white font-stadium text-base tabular-nums leading-none">{value}</span>
      <span className="text-gray-500 text-[9px] tracking-widest uppercase font-semibold">{label}</span>
    </div>
  )
}

function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { icon: '🛒', label: 'Shop', path: '/shop' },
    { icon: '🏅', label: 'Badges', path: '/badges' },
    { icon: '📜', label: 'History', path: '/history' },
    { icon: '🏆', label: 'Ranks', path: '/leaderboard' },
  ]
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {actions.map(a => (
        <button
          key={a.path}
          onClick={() => navigate(a.path)}
          className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-lg">{a.icon}</span>
          <span className="text-gray-400 text-[10px] font-semibold tracking-wider uppercase">{a.label}</span>
        </button>
      ))}
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
    appTrack,
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
          {sub && (
            <p className="text-gray-500 text-[11px] truncate leading-tight">{sub}</p>
          )}
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

/**
 * Wallet card — current Brezn balance + lifetime earned/spent + a
 * shortcut to the Brezn Shop where the balance can be spent.
 * Balance ticks up via event-processor awards during live matches.
 */
function CreditsCard() {
  const { balance, totalEarned, totalSpent, loading } = useCredits()
  const navigate = useNavigate()
  return (
    <div
      className="mt-4 rounded-2xl px-5 py-4"
      style={{
        background: 'linear-gradient(145deg, #1a1410 0%, #0d0806 100%)',
        border: '1px solid rgba(250,204,21,0.20)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -16px rgba(250,204,21,0.35)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">
          Wallet
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/80 tracking-widest uppercase">
          <PretzelCoin size={12} color="#fcd34d" />
          Brezn
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <PretzelCoin size={24} color="#fcd34d" />
        <p
          className="text-white font-stadium text-3xl leading-none tabular-nums"
          style={{ letterSpacing: '0.05em', textShadow: '0 2px 0 rgba(0,0,0,0.6)' }}
        >
          {loading ? '—' : Number(balance).toLocaleString()}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-[10px] tracking-wider uppercase text-gray-500">
          <span>Earned <span className="text-gray-300 tabular-nums">{Number(totalEarned).toLocaleString()}</span></span>
          <span>Spent  <span className="text-gray-300 tabular-nums">{Number(totalSpent).toLocaleString()}</span></span>
        </div>
        <button
          onClick={() => navigate('/shop')}
          className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, rgba(252,211,77,0.20) 0%, rgba(217,119,6,0.10) 100%)',
            border: '1px solid rgba(252,211,77,0.40)',
            color: '#fcd34d',
          }}
        >
          Open shop →
        </button>
      </div>
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

/**
 * Help & tutorial card.
 *
 * Same visual language as MusicCard — dark gradient surface, red accent.
 * Plain-language explainers in collapsible sections so the card stays
 * compact by default. Each section is a single self-contained "topic"
 * the user can open without scrolling past everything else.
 */
function HelpCard() {
  return (
    <div
      className="mt-4 rounded-2xl p-5"
      style={{
        background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">
        Help & how to play
      </p>

      <div className="space-y-2">
        {HELP_TOPICS.map((topic, idx) => (
          <HelpTopic key={topic.id} topic={topic} firstItem={idx === 0} />
        ))}
      </div>
    </div>
  )
}

const HELP_TOPICS = [
  {
    id: 'overview',
    icon: '⚽',
    title: 'What is this app?',
    body: (
      <>
        <p>
          You and a friend watch a real Bundesliga match together. Before the
          match starts, you each pick a squad of players. As the match plays
          out, the players you picked earn you points when they do good things
          (score, save, assist). Whoever has more points at the final whistle
          wins.
        </p>
        <p className="mt-2">
          You can play solo too — the app fills in a bot opponent so the
          competition still happens.
        </p>
      </>
    ),
  },
  {
    id: 'rooms',
    icon: '🚪',
    title: 'How do I play with someone?',
    body: (
      <>
        <p>
          From the home screen, pick a match and either <b>create a room</b>
          {' '}or <b>join one</b> with a 6-character code. Share the code with
          your friend, or send them a link from the Friends tab.
        </p>
        <p className="mt-2">
          Two humans per room. Both need to be in the room before the host
          starts the match.
        </p>
      </>
    ),
  },
  {
    id: 'draft',
    icon: '🎯',
    title: 'How does the draft work?',
    body: (
      <>
        <p>
          The draft is how you pick your squad. The app shows you two players
          at a time and you tap the one you want. Your opponent does the same
          on their phone — neither of you sees what the other picked until
          both have chosen.
        </p>
        <p className="mt-2">
          Most of the time you'll both pick different players, so you each
          just get the one you wanted. If you both pick the same player,
          there's a coin flip — the winner gets the player they wanted, the
          loser gets the other one. The flip is rigged to keep things even
          (no one can win three coin flips in a row).
        </p>
        <p className="mt-2">
          After the draft, you pick a starting XI from the players you
          drafted. Those are the ones that earn you points during the match.
        </p>
      </>
    ),
  },
  {
    id: 'scoring',
    icon: '📊',
    title: 'How do I earn points?',
    body: (
      <>
        <p>
          Every time a player on your starting XI does something good in the
          real match, you get points:
        </p>
        <ul className="mt-2 space-y-1 text-gray-400">
          <li>• Goal — <span className="text-white">+5</span></li>
          <li>• Assist — <span className="text-white">+3</span></li>
          <li>• Save (goalkeeper) — <span className="text-white">+3</span></li>
          <li>• Yellow card — <span className="text-red-400">−1</span></li>
        </ul>
        <p className="mt-2">
          On top of that, mini-games pop up during the match (offside reflex,
          halftime quiz, penalty shootout). Tap fast and accurately for
          bonus points.
        </p>
      </>
    ),
  },
  {
    id: 'minigames',
    icon: '⚡',
    title: 'What are the mini-games?',
    body: (
      <>
        <p>
          When something interesting happens in the match, a quick reaction
          challenge pops up for both players at the same time:
        </p>
        <ul className="mt-2 space-y-1.5 text-gray-400">
          <li>
            <span className="text-white font-semibold">Offside Reflex</span> —
            tap the moment the attacker crosses the line. Faster = more
            points (max +6).
          </li>
          <li>
            <span className="text-white font-semibold">Halftime Quiz</span> —
            three football trivia questions during the break. Answer fast
            and right.
          </li>
          <li>
            <span className="text-white font-semibold">Penalty Shootout</span>
            {' '}— pick a corner. If you're the shooter, score it. If you're
            the keeper, save it.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'badges',
    icon: '🏅',
    title: 'Badges, history & leaderboard',
    body: (
      <>
        <p>
          Badges unlock automatically when you hit milestones — your first
          goal, five saves, things like that. Open the Badges tab to see all
          of them.
        </p>
        <p className="mt-2">
          Every match you finish gets recorded in the History tab forever.
          Your all-time score across every match shows up on the global
          Leaderboard (link on the home screen).
        </p>
      </>
    ),
  },
  {
    id: 'tips',
    icon: '💡',
    title: 'A few tips',
    body: (
      <>
        <ul className="space-y-1.5 text-gray-400">
          <li>
            • The match clock is what matters, not real wall time. If
            something looks delayed, give it a second — events show up when
            the clock catches up.
          </li>
          <li>
            • Each browser tab is a separate session. Open two tabs to test
            with two accounts on the same machine.
          </li>
          <li>
            • Closing your tab signs you out of <i>that tab</i>, but your
            badges, history and points are saved on the server.
          </li>
          <li>
            • The host picks the playback speed when starting the match. 5×
            is the recommended pace.
          </li>
        </ul>
      </>
    ),
  },
]

function HelpTopic({ topic, firstItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={firstItem ? '' : 'border-t border-white/5 pt-2'}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 py-2 text-left active:opacity-70 transition-opacity"
        aria-expanded={open}
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base leading-none"
          style={{
            background: open
              ? 'linear-gradient(135deg, rgba(220,38,38,0.20) 0%, rgba(153,27,27,0.10) 100%)'
              : 'rgba(255,255,255,0.04)',
            border: open
              ? '1px solid rgba(248,113,113,0.35)'
              : '1px solid rgba(255,255,255,0.08)',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          aria-hidden
        >
          {topic.icon}
        </span>
        <span className={`flex-1 text-sm font-semibold leading-tight ${open ? 'text-white' : 'text-gray-200'}`}>
          {topic.title}
        </span>
        <span
          className={`text-gray-500 text-xs flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="pl-11 pr-1 pb-3 pt-1 text-[12.5px] leading-relaxed text-gray-300 space-y-1">
          {topic.body}
        </div>
      )}
    </div>
  )
}
