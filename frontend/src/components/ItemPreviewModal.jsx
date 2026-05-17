import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCredits } from '../hooks/useCredits'
import { useInventory } from '../hooks/useInventory'
import { TRACKS } from '../utils/tracks'
import DiscArtwork from './ui/DiscArtwork'
import MemberAvatar from './ui/MemberAvatar'
import PretzelCoin from './ui/PretzelCoin'

/**
 * ItemPreviewModal — "see what you'll get" before buying.
 *
 * Opens when a user taps any shop card. Renders a category-specific
 * preview + the Buy button (so commitment happens HERE, not on the
 * card itself).
 *
 * Category branches:
 *   - name-color  → <DisplayName>-style preview of the user's name
 *                   with the cosmetic forced on.
 *   - avatar-frame → <MemberAvatar> showing the user's actual avatar
 *                    with the frame forced on.
 *   - disc        → <DiscArtwork> + "Play 10s sample" button.
 *   - match-perk  → rule text + a small visual diagram.
 *   - badge-buy   → generic tier-coloured medal preview.
 */

// Map of catalog itemId → (category, kind) for preview routing.
// Sourced from the breznCatalog shape; kept local because the modal
// only cares about a few specific categories.
const CATEGORY_RENDER = {
  'name-red':         'name-color',
  'name-rainbow':     'name-color',
  'frame-gold':       'avatar-frame',
  'frame-pretzel':    'avatar-frame',
  'disc-waka-waka':   'disc',
  'disc-we-are-one':  'disc',
  'disc-walk':        'disc',
  'captain-triple':   'match-perk',
  'pick-reroll':      'match-perk',
  'free-hit':         'match-perk',
  'reaction-pack':    'match-perk',
  'badge-bronze':     'badge-buy',
  'badge-silver':     'badge-buy',
  'badge-gold':       'badge-buy',
}

export default function ItemPreviewModal({ item, onClose }) {
  const { user } = useAuth()
  const { balance, refresh: refreshBalance } = useCredits()
  const { owns, purchase } = useInventory()
  const [submitting, setSubmitting] = useState(false)

  if (!item) return null

  const isOwned   = owns(item.id)
  const isLive    = item.status === 'live'
  const canAfford = balance >= item.cost
  const category  = CATEGORY_RENDER[item.id] || 'match-perk'

  const handleBuy = async () => {
    if (!isLive || isOwned || submitting) return
    if (!canAfford) return
    setSubmitting(true)
    try {
      await purchase(item.id)
      refreshBalance()
      onClose()
    } catch {
      // useInventory.purchase already toasts; keep modal open so user
      // can see what went wrong + retry.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 py-6"
      style={{ background: 'rgba(5,8,15,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #111827 0%, #0b1220 55%, #08101c 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.75)',
          animation: 'previewIn 280ms cubic-bezier(.22,1.4,.36,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Preview</p>
            <p className="text-white text-sm font-bold mt-0.5">{item.label}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="Close preview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview body */}
        <div className="flex-1 px-5 py-6">
          {category === 'name-color'   && <NameColorPreview item={item} user={user} />}
          {category === 'avatar-frame' && <AvatarFramePreview item={item} user={user} />}
          {category === 'disc'         && <DiscPreview item={item} />}
          {category === 'match-perk'   && <PerkPreview item={item} />}
          {category === 'badge-buy'    && <BadgeBuyPreview item={item} />}
        </div>

        {item.detail && (
          <p className="px-5 pb-3 text-gray-400 text-xs leading-snug">{item.detail}</p>
        )}

        {/* CTA */}
        <div className="px-5 pb-5 pt-2 border-t border-white/[0.06] flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(252,211,77,0.18) 0%, rgba(217,119,6,0.10) 100%)',
              border: '1px solid rgba(252,211,77,0.40)',
            }}
          >
            <PretzelCoin size={14} color="#fcd34d" />
            <span className="text-amber-200 font-black tabular-nums text-sm">{item.cost}</span>
          </div>
          <button
            onClick={handleBuy}
            disabled={!isLive || isOwned || !canAfford || submitting}
            className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.98]
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isOwned
                ? 'rgba(34,197,94,0.20)'
                : !isLive
                  ? 'rgba(255,255,255,0.05)'
                  : canAfford
                    ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                    : 'rgba(255,255,255,0.05)',
              border: `1px solid ${
                isOwned ? 'rgba(34,197,94,0.40)'
                : !isLive ? 'rgba(255,255,255,0.10)'
                : canAfford ? 'rgba(248,113,113,0.55)'
                : 'rgba(255,255,255,0.10)'
              }`,
              color: isOwned ? '#86efac' : canAfford ? '#ffffff' : '#6b7280',
            }}
          >
            {submitting ? 'Buying…'
              : isOwned ? 'Owned'
              : !isLive ? 'Coming soon'
              : !canAfford ? `Need ${item.cost - balance} more brezn`
              : `Buy for ${item.cost}`}
          </button>
        </div>

        <style>{`
          @keyframes previewIn {
            0%   { opacity: 0; transform: translateY(20px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0)    scale(1); }
          }
        `}</style>
      </div>
    </div>
  )
}

// ─── Per-category preview components ─────────────────────────────────────

function NameColorPreview({ item, user }) {
  const displayName = user?.displayName || 'Your name'
  const isRainbow = item.id === 'name-rainbow'

  const style = isRainbow ? {
    backgroundImage:      'linear-gradient(90deg, #f87171, #fcd34d, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)',
    backgroundSize:       '200% 100%',
    WebkitBackgroundClip: 'text',
    backgroundClip:       'text',
    color:                'transparent',
    WebkitTextFillColor:  'transparent',
    animation:            'displayNameRainbow 6s linear infinite',
  } : {
    color: '#f87171',
  }

  return (
    <div className="text-center py-4">
      <p className="text-gray-500 text-[10px] tracking-widest uppercase mb-3">Your name will look like this</p>
      <p
        className="font-stadium text-4xl leading-none"
        style={{ letterSpacing: '0.05em', ...style }}
      >
        {displayName}
      </p>
      <style>{`
        @keyframes displayNameRainbow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  )
}

function AvatarFramePreview({ item, user }) {
  // Render a forced-frame avatar by constructing a fake "owns" override.
  // The cleanest path is to render a plain image + the same frame ring
  // box-shadow that MemberAvatar uses, since we can't easily force
  // useInventory.owns from here.
  const isPretzel = item.id === 'frame-pretzel'
  const shadow = isPretzel
    ? '0 0 0 2px #d97706, 0 0 22px rgba(217,119,6,1.00), inset 0 0 10px rgba(252,211,77,0.65)'
    : '0 0 0 2px #fbbf24, 0 0 14px rgba(251,191,36,0.85)'

  const url = (user?.avatarUrl || '').trim()
  const initial = (user?.displayName || 'U')[0].toUpperCase()

  return (
    <div className="text-center py-2">
      <p className="text-gray-500 text-[10px] tracking-widest uppercase mb-4">Frame around YOUR avatar</p>
      <div className="flex items-center justify-center">
        <div
          style={{
            width: 96, height: 96, borderRadius: '50%',
            boxShadow: shadow,
            animation: isPretzel ? 'framePretzelPulsePreview 2.8s ease-in-out infinite' : 'none',
          }}
        >
          {url ? (
            <img src={url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <div
              className="w-full h-full rounded-full flex items-center justify-center text-3xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #14181f 0%, #0a0d12 100%)' }}
            >
              {initial}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes framePretzelPulsePreview {
          0%, 100% { box-shadow: 0 0 0 2px #d97706, 0 0 14px rgba(217,119,6,0.70), inset 0 0 6px rgba(252,211,77,0.55); }
          50%      { box-shadow: 0 0 0 2px #f59e0b, 0 0 22px rgba(245,158,11,1.00), inset 0 0 12px rgba(252,211,77,0.80); }
        }
      `}</style>
    </div>
  )
}

function DiscPreview({ item }) {
  // Find the matching track in the catalog so we can show its actual
  // artwork + offer an audio sample.
  const trackIdByItem = {
    'disc-waka-waka':  'shakira-waka-waka',
    'disc-we-are-one': 'pitbull-we-are-one',
    'disc-walk':       'kwabs-walk',
  }
  const trackId = trackIdByItem[item.id]
  const track = TRACKS.find(t => t.id === trackId)
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.currentTime = 0
      a.volume = 0.6
      a.play().then(() => {
        setPlaying(true)
        // Auto-stop after 10s.
        setTimeout(() => {
          if (audioRef.current === a) { a.pause(); setPlaying(false) }
        }, 10000)
      }).catch(() => {})
    } else {
      a.pause()
      setPlaying(false)
    }
  }

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause()
  }, [])

  if (!track) return <p className="text-gray-500 text-sm">Track not found.</p>

  return (
    <div className="flex flex-col items-center gap-4">
      <DiscArtwork track={track} size={140} />
      <div className="text-center">
        <p className="text-white font-bold text-base">{track.title}</p>
        <p className="text-gray-500 text-sm">{track.artist}</p>
      </div>
      <button
        onClick={toggle}
        className="px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: '#fff',
        }}
      >
        {playing ? '⏸ Stop' : '▶ Play 10s sample'}
      </button>
      <audio ref={audioRef} src={track.file} preload="none" />
    </div>
  )
}

const PERK_GLYPH = {
  'captain-triple': '🅒',
  'pick-reroll':    '🔄',
  'free-hit':       '⇄',
  'reaction-pack':  '🎉',
}

function PerkPreview({ item }) {
  const glyph = PERK_GLYPH[item.id] || '⚡'
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(217,119,6,0.10) 100%)',
          border: '1px solid rgba(245,158,11,0.40)',
          boxShadow: '0 0 24px -8px rgba(245,158,11,0.45)',
        }}
        aria-hidden="true"
      >
        {glyph}
      </div>
      <p className="text-gray-500 text-[10px] tracking-widest uppercase">
        Auto-armed next match
      </p>
    </div>
  )
}

const TIER_TINT = {
  'badge-bronze': { color: '#cd7f32', glow: 'rgba(205,127,50,0.45)' },
  'badge-silver': { color: '#c0c0c0', glow: 'rgba(192,192,192,0.45)' },
  'badge-gold':   { color: '#ffd700', glow: 'rgba(255,215,0,0.55)' },
}

function BadgeBuyPreview({ item }) {
  const tint = TIER_TINT[item.id] || TIER_TINT['badge-bronze']
  const tierLabel = item.id.replace('badge-', '').toUpperCase()
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center"
        style={{
          background: 'radial-gradient(circle at 30% 25%, #4a0808 0%, #1a0303 60%, #0a0000 100%)',
          border: `3px solid ${tint.color}`,
          boxShadow: `0 0 24px -4px ${tint.glow}, inset 0 0 12px rgba(0,0,0,0.5)`,
        }}
      >
        <span className="text-2xl font-black tracking-widest" style={{ color: tint.color }}>
          {tierLabel}
        </span>
      </div>
      <p className="text-gray-400 text-xs text-center max-w-[16rem]">
        Unlocks any unearned <span style={{ color: tint.color }}>{tierLabel.toLowerCase()}</span>{' '}
        badge of your choice. Earning the badge in-match is always cheaper.
      </p>
    </div>
  )
}
