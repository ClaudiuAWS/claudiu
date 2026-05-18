import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCredits } from '../hooks/useCredits'
import { useInventory } from '../hooks/useInventory'
import { useBadges } from '../hooks/useBadges'
import { getBadgeForShopItem } from '../utils/badges'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const { balance, refresh: refreshBalance } = useCredits()
  const { owns, purchase } = useInventory()
  const { badges } = useBadges()
  const [submitting, setSubmitting] = useState(false)

  // Tier-buy items (badge-bronze/silver/gold) don't go through the
  // inventory-map purchase path — they live in the claudiu-badges
  // table and need a specific badgeId. We special-case them: the Buy
  // CTA navigates to /badges where the user picks a specific badge
  // and confirms via BadgePreviewModal's Buy flow.
  const isBadgeTierItem = item?.id?.startsWith?.('badge-')

  // Discs that the user already unlocked via earning the corresponding
  // badge — the Buy button reads "Already unlocked" so they don't waste
  // brezn on a duplicate purchase.
  const earnedBadgeIds = useMemo(() => new Set((badges || []).map(b => b.badgeId)), [badges])
  const viaBadge = item && (() => {
    const bid = getBadgeForShopItem(item.id)
    return !!bid && earnedBadgeIds.has(bid)
  })()

  if (!item) return null

  const isOwned   = owns(item.id)
  const isLive    = item.status === 'live'
  const canAfford = balance >= item.cost
  const category  = CATEGORY_RENDER[item.id] || 'match-perk'

  const handleBuy = async () => {
    if (!isLive || isOwned || viaBadge || submitting) return
    // Tier-buy items: bounce the user to /badges. The actual buy
    // happens there once they pick a specific badge.
    if (isBadgeTierItem) {
      onClose()
      navigate('/badges')
      return
    }
    if (!canAfford) return
    setSubmitting(true)
    try {
      await purchase(item.id)
      refreshBalance()
      onClose()
    } catch {
      // useInventory.purchase toasts on failure; we just keep the
      // modal open so the user can retry without losing context.
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
            disabled={!isLive || isOwned || viaBadge || submitting || (!isBadgeTierItem && !canAfford)}
            className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.98]
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: (isOwned || viaBadge)
                ? 'rgba(34,197,94,0.20)'
                : !isLive
                  ? 'rgba(255,255,255,0.05)'
                  : (isBadgeTierItem || canAfford)
                    ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                    : 'rgba(255,255,255,0.05)',
              border: `1px solid ${
                (isOwned || viaBadge) ? 'rgba(34,197,94,0.40)'
                : !isLive ? 'rgba(255,255,255,0.10)'
                : (isBadgeTierItem || canAfford) ? 'rgba(248,113,113,0.55)'
                : 'rgba(255,255,255,0.10)'
              }`,
              color: (isOwned || viaBadge) ? '#86efac' : (isBadgeTierItem || canAfford) ? '#ffffff' : '#6b7280',
            }}
          >
            {submitting ? 'Buying…'
              : isOwned ? 'Owned'
              : viaBadge ? '✓ Already unlocked via badge'
              : !isLive ? 'Coming soon'
              : isBadgeTierItem ? `Browse ${item.id.replace('badge-', '')} badges →`
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

// PerkPreview dispatcher — each match-perk gets its own in-app diagram
// rather than a generic glyph, so the visual reads consistent with the
// rest of the app (Bundesliga red, stadium font, position pills).
function PerkPreview({ item }) {
  switch (item.id) {
    case 'captain-triple': return <CaptainTriplePreview />
    case 'pick-reroll':    return <PickRerollPreview />
    case 'free-hit':       return <FreeHitPreview />
    case 'reaction-pack':  return <ReactionsPackPreview />
    default:               return <GenericPerkPreview />
  }
}

// Inline silhouette icon reused by every player-card mock.
function PlayerSilhouette({ size = 24, opacity = 0.85 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={`rgba(156,163,175,${opacity})`} aria-hidden="true">
      <path d="M12 2a5 5 0 110 10 5 5 0 010-10zm0 12c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
    </svg>
  )
}

function CaptainTriplePreview() {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="flex items-center justify-center gap-5">
        {/* Player card mock — same vocabulary as the lobby PitchView */}
        <div className="relative" style={{ width: 88, height: 110 }}>
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(160deg, #1a0a0a 0%, #0d0606 100%)',
              border: '1px solid rgba(220,38,38,0.35)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -8px rgba(220,38,38,0.55)',
            }}
          />
          {/* Position pill */}
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full font-bold tracking-widest uppercase"
            style={{
              fontSize: 8,
              background: 'rgba(220,38,38,0.30)',
              color: '#fca5a5',
              border: '1px solid rgba(248,113,113,0.50)',
            }}
          >
            FWD
          </div>
          {/* Avatar silhouette */}
          <div
            className="absolute left-1/2 top-7 -translate-x-1/2 w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #14181f 0%, #0a0d12 100%)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <PlayerSilhouette size={26} />
          </div>
          {/* CAPTAIN label */}
          <div
            className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-stadium text-white"
            style={{ fontSize: 9, letterSpacing: '0.18em' }}
          >
            CAPTAIN
          </div>
          {/* Yellow C disc badge */}
          <div
            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center font-black"
            style={{
              fontSize: 12,
              background: 'linear-gradient(135deg, #fcd34d 0%, #d97706 100%)',
              border: '1.5px solid #fbbf24',
              boxShadow: '0 0 8px rgba(252,211,77,0.65)',
              color: '#1a0606',
            }}
          >
            C
          </div>
        </div>
        {/* ×3 multiplier in stadium font */}
        <div
          className="font-stadium leading-none"
          style={{
            fontSize: 56,
            backgroundImage: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 8px rgba(220,38,38,0.55)) drop-shadow(0 2px 0 rgba(0,0,0,0.4))',
            letterSpacing: '0.02em',
          }}
        >
          ×3
        </div>
      </div>
      <p className="text-gray-500 text-[10px] tracking-widest uppercase">Auto-armed next match</p>
    </div>
  )
}

function DraftMiniCard({ ringColor, label, dim }) {
  return (
    <div className="relative" style={{ width: 60, height: 76, opacity: dim ? 0.45 : 1 }}>
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          background: 'linear-gradient(160deg, #14181f 0%, #0a0d12 100%)',
          border: `1.5px solid ${ringColor}aa`,
          boxShadow: `0 0 10px -2px ${ringColor}55`,
        }}
      />
      <div
        className="absolute left-1/2 top-2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #14181f 0%, #0a0d12 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <PlayerSilhouette size={16} />
      </div>
      <div
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-semibold text-white whitespace-nowrap"
        style={{ fontSize: 8 }}
      >
        {label}
      </div>
    </div>
  )
}

function PickRerollPreview() {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="flex items-center justify-center gap-3">
        <DraftMiniCard ringColor="#60a5fa" label="Player A" dim />
        <div
          className="text-amber-300 leading-none"
          style={{ fontSize: 26, filter: 'drop-shadow(0 0 6px rgba(252,211,77,0.6))' }}
        >
          ⟲
        </div>
        <DraftMiniCard ringColor="#60a5fa" label="Player B" />
      </div>
      <p className="text-gray-500 text-[10px] tracking-widest uppercase text-center">
        Re-roll one draft pair
      </p>
    </div>
  )
}

function PlayerSwapTile({ label, pos, state }) {
  const isIn = state === 'in'
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{
        width: 220,
        background: isIn
          ? 'linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(21,128,61,0.10) 100%)'
          : 'linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(127,29,29,0.06) 100%)',
        border: `1px solid ${isIn ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.30)'}`,
        opacity: isIn ? 1 : 0.7,
      }}
    >
      <div
        className="px-2 py-0.5 rounded-full font-bold tracking-widest uppercase"
        style={{
          fontSize: 8,
          background: 'rgba(220,38,38,0.30)',
          color: '#fca5a5',
          border: '1px solid rgba(248,113,113,0.50)',
        }}
      >
        {pos}
      </div>
      <div className="flex-1 text-white text-xs font-semibold truncate">{label}</div>
      <div
        className="font-bold tracking-widest"
        style={{ fontSize: 9, color: isIn ? '#86efac' : '#fca5a5' }}
      >
        {isIn ? 'IN' : 'OUT'}
      </div>
    </div>
  )
}

function FreeHitPreview() {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <PlayerSwapTile label="Lewandowski" pos="FWD" state="out" />
      <div
        className="text-amber-300 leading-none"
        style={{ fontSize: 24, filter: 'drop-shadow(0 0 6px rgba(252,211,77,0.6))' }}
      >
        ⇅
      </div>
      <PlayerSwapTile label="Müller" pos="FWD" state="in" />
      <p className="text-gray-500 text-[10px] tracking-widest uppercase text-center mt-2">
        Swap one player after squad lock
      </p>
    </div>
  )
}

function ReactionsPackPreview() {
  const emojis = ['🍺', '🌭', '👑', '🐐', '🎺', '🏆']
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <div className="flex flex-col gap-1.5">
        {emojis.map(e => (
          <div
            key={e}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xl"
            style={{
              background: 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px -4px rgba(0,0,0,0.5)',
            }}
            aria-hidden="true"
          >
            {e}
          </div>
        ))}
      </div>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-xl mt-1"
        style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          border: '1px solid rgba(248,113,113,0.55)',
          boxShadow: '0 8px 24px -8px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
        }}
        aria-hidden="true"
      >
        🥨
      </div>
      <p className="text-gray-500 text-[10px] tracking-widest uppercase text-center mt-1">
        Stacked above the base set
      </p>
    </div>
  )
}

function GenericPerkPreview() {
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
        ⚡
      </div>
      <p className="text-gray-500 text-[10px] tracking-widest uppercase">Auto-armed next match</p>
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
