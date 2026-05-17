import { useEffect, useState } from 'react'
import { useBadges } from '../hooks/useBadges'
import { BADGE_CATALOG, TIER_COLORS, TIER_ORDER, getBadgePrice } from '../utils/badges'
import { getSeenSet } from '../utils/badgesUnseen'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PretzelCoin from '../components/ui/PretzelCoin'
import BadgePreviewModal from '../components/BadgePreviewModal'

export default function BadgesPage() {
  const { badges, loading } = useBadges()
  const [previewBadge, setPreviewBadge] = useState(null)
  // Snapshot the seen-set into state so we can re-read after the preview
  // modal marks a badge seen — without forcing a full BadgeCard re-render
  // dance on every state change.
  const [seenIds, setSeenIds] = useState(() => getSeenSet())

  if (loading) return <LoadingSpinner />

  const earnedIds = new Set(badges.map(b => b.badgeId))

  // Sort by tier first (bronze → silver → gold), then earned vs not
  // within each tier. Within each (tier, earned) bucket, preserve the
  // catalog's original insertion order for stable rendering.
  const tieredCatalog = [...BADGE_CATALOG].sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99)
    if (tierDiff !== 0) return tierDiff
    const aEarned = earnedIds.has(a.id) ? 0 : 1
    const bEarned = earnedIds.has(b.id) ? 0 : 1
    return aEarned - bEarned
  })

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      {/* Glossy header bar — same component shape as TracksPage. */}
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
            style={{
              letterSpacing: '0.10em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
            }}
          >
            BADGES
          </h1>
          <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
            {earnedIds.size} / {BADGE_CATALOG.length} earned
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tieredCatalog.map(badge => {
          const earned = earnedIds.has(badge.id)
          const earnedData = badges.find(b => b.badgeId === badge.id)
          const unseen = earned && !seenIds.has(badge.id)
          return (
            <BadgeCard
              key={badge.id}
              badge={badge}
              earned={earned}
              earnedAt={earnedData?.earnedAt}
              unseen={unseen}
              onClick={() => setPreviewBadge({ badge, earned, earnedAt: earnedData?.earnedAt })}
            />
          )
        })}
      </div>

      {earnedIds.size === 0 && (
        <p className="text-center text-gray-600 text-sm mt-8">
          Play matches to earn badges!
        </p>
      )}

      <BadgePreviewModal
        preview={previewBadge}
        onClose={() => {
          setPreviewBadge(null)
          // Modal marked the badge seen on open; refresh our local copy
          // of the seen-set so the glow stops on the closed card.
          setSeenIds(getSeenSet())
        }}
      />
    </div>
  )
}

function BadgeCard({ badge, earned, earnedAt, unseen, onClick }) {
  const [imgFailed, setImgFailed] = useState(false)
  const tierColor = TIER_COLORS[badge.tier] || TIER_COLORS.bronze

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl p-4 flex flex-col items-center text-center transition-transform active:scale-[0.98] hover:scale-[1.01] focus:outline-none cursor-pointer"
      style={{
        background: earned
          ? 'linear-gradient(145deg, #1a1216 0%, #0d0808 100%)'
          : 'rgba(255,255,255,0.02)',
        border: earned
          ? `1px solid ${tierColor}55`
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: earned
          ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -10px ${tierColor}88`
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
        opacity: earned ? 1 : 0.55,
        animation: unseen ? 'badgeNewGlow 1.6s ease-in-out infinite' : 'none',
        // The glow animation re-defines box-shadow each frame; the static
        // boxShadow above is the resting value for non-unseen earned cards.
      }}
    >
      {/* Inline keyframe: pulses a tier-tinted aura around unseen earned
          cards so the user's eye is drawn to "tap to see your reward". */}
      {unseen && (
        <style>{`
          @keyframes badgeNewGlow {
            0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1.5px ${tierColor}aa, 0 0 16px 2px ${tierColor}55; }
            50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px   ${tierColor}ff, 0 0 28px 8px ${tierColor}99; }
          }
          @keyframes badgeNewPill {
            0%, 100% { transform: scale(1);    opacity: 1;   }
            50%      { transform: scale(1.05); opacity: 0.9; }
          }
        `}</style>
      )}

      {/* "NEW" pill in the top-left when unseen — pairs with the glow so
          the affordance reads as "this is new — tap to claim". */}
      {unseen && (
        <div
          className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}cc 100%)`,
            border: `1px solid ${tierColor}`,
            color: '#0a0404',
            boxShadow: `0 0 8px ${tierColor}aa`,
            animation: 'badgeNewPill 1.6s ease-in-out infinite',
          }}
        >
          NEW
        </div>
      )}

      {/* Top sheen */}
      {earned && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      )}

      {/* Shooting-star accent in the top-right corner — only on earned. */}
      {earned && (
        <div
          aria-hidden
          className="absolute top-2 right-2 pointer-events-none"
          style={{
            width: 18,
            height: 18,
            background: `radial-gradient(circle at 50% 50%, ${tierColor} 0%, ${tierColor}aa 30%, transparent 70%)`,
            clipPath: 'polygon(50% 0%, 60% 35%, 100% 50%, 60% 65%, 50% 100%, 40% 65%, 0% 50%, 40% 35%)',
            filter: `drop-shadow(0 0 4px ${tierColor}88)`,
          }}
        />
      )}

      {/* Badge artwork — full-bleed when we have a real PNG, plinth
          fallback only for the CSS-letter placeholder. `mix-blend-mode:
          screen` makes the dark circular background baked into the AI-
          generated crests drop out against the dark page bg, so the
          icon "floats" instead of being framed by a black blob. The
          brightness/contrast lift compensates for the wash-out screen
          mode causes on mid-tones. */}
      <div className="relative mb-3">
        {!imgFailed ? (
          <img
            src={badge.image}
            alt={badge.title}
            className="w-20 h-20 object-contain"
            style={{
              mixBlendMode: 'screen',
              filter: earned
                ? `brightness(1.15) contrast(1.05) drop-shadow(0 4px 12px ${tierColor}66) drop-shadow(0 0 10px ${tierColor}88)`
                : 'grayscale(1) brightness(0.45) contrast(0.95)',
            }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{
              background: earned
                ? 'radial-gradient(circle at 50% 30%, #2a1518 0%, #0a0404 100%)'
                : 'rgba(255,255,255,0.04)',
              border: earned ? `2px solid ${tierColor}80` : '2px solid rgba(255,255,255,0.10)',
              boxShadow: earned
                ? `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 12px -4px ${tierColor}66`
                : 'none',
            }}
          >
            <BadgePlaceholder badge={badge} earned={earned} tierColor={tierColor} />
          </div>
        )}
        {earned && (
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 rounded-full"
            style={{
              width: '60%',
              background: `linear-gradient(90deg, transparent 0%, ${tierColor} 50%, transparent 100%)`,
              boxShadow: `0 0 6px ${tierColor}aa`,
            }}
          />
        )}
      </div>

      <p
        className={`text-sm font-semibold leading-tight ${earned ? 'text-white' : 'text-gray-500'}`}
        style={earned ? { textShadow: '0 1px 0 rgba(0,0,0,0.6)' } : {}}
      >
        {badge.title}
      </p>
      <p className="text-gray-500 text-[11px] mt-1 leading-snug">
        {badge.description}
      </p>

      {/* Price tag — Brezn (in-game currency). Earning in-match is
          always free; this is the credit-grind alternative. */}
      <div
        className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
        style={{
          background: earned
            ? 'rgba(250,204,21,0.08)'
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${earned ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <PretzelCoin size={11} color={earned ? '#fcd34d' : '#6b7280'} />
        <span
          className="text-[10px] font-bold tracking-wider tabular-nums"
          style={{ color: earned ? '#fde68a' : '#6b7280' }}
        >
          {getBadgePrice(badge).toLocaleString()}
        </span>
      </div>

      {/* Disc-reward marker */}
      {badge.discReward && (
        <div
          className="mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
          style={{
            background: earned
              ? 'linear-gradient(135deg, rgba(220,38,38,0.30) 0%, rgba(127,29,29,0.20) 100%)'
              : 'rgba(255,255,255,0.04)',
            border: `1px solid ${earned ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.10)'}`,
            color: earned ? '#fca5a5' : '#6b7280',
          }}
        >
          💿 Disc
        </div>
      )}

      {earned && earnedAt && (
        <p
          className="text-[9px] mt-2 font-medium tracking-wider"
          style={{ color: `${tierColor}c0` }}
        >
          ✓ {new Date(earnedAt).toLocaleDateString()}
        </p>
      )}
    </button>
  )
}

/** CSS-only fallback for badges that don't have artwork yet. */
function BadgePlaceholder({ badge, earned, tierColor }) {
  const initial = (badge.title || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center font-stadium"
      style={{
        background: earned
          ? `radial-gradient(circle at 35% 30%, ${tierColor} 0%, ${tierColor}aa 50%, #1a0303 100%)`
          : 'radial-gradient(circle at 35% 30%, #4a4a4a 0%, #2a2a2a 100%)',
        boxShadow: earned
          ? `inset 0 1px 0 rgba(255,255,255,0.30), 0 0 8px -2px ${tierColor}aa`
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        color: earned ? '#fff' : '#9ca3af',
        fontSize: 22,
        textShadow: '0 1px 0 rgba(0,0,0,0.6)',
        letterSpacing: '0.05em',
      }}
    >
      {initial}
    </div>
  )
}
