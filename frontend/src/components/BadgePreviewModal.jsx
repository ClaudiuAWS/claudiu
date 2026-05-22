import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { TIER_COLORS, getBadgePrice } from '../utils/badges'
import { TRACKS } from '../utils/tracks'
import { markSeen } from '../utils/badgesUnseen'
import { badgesApi } from '../services/api'
import { useBadges } from '../hooks/useBadges'
import { useCredits } from '../hooks/useCredits'
import PretzelCoin from './ui/PretzelCoin'

/**
 * BadgePreviewModal — tap-to-preview for any badge on the BadgesPage.
 *
 * Mirrors the ItemPreviewModal scaffolding (backdrop, slide-up animation,
 * header/body/footer layout) but renders badge-specific content:
 *   - Large badge image with the same screen-blend + tier-glow as the
 *     BadgesPage card (so it reads consistent).
 *   - Stadium-font title + tier pill + description.
 *   - Disc-reward marker if the badge unlocks a track.
 *   - Earned pill (green) when owned; otherwise a "Buy for N 🥨" button
 *     that pays the tier price and writes the badge atomically via
 *     POST /badges/buy.
 */
export default function BadgePreviewModal({ preview, onClose }) {
  const { refresh: refreshBadges } = useBadges()
  const { balance, refresh: refreshCredits } = useCredits()
  const [submitting, setSubmitting] = useState(false)

  // When an EARNED badge is previewed, mark it seen so the glow + "NEW"
  // pill on the BadgesPage card retire. Idempotent + safe to fire for
  // unearned badges too (markSeen is no-op-friendly on unowned ids).
  useEffect(() => {
    if (preview?.earned && preview?.badge?.id) {
      markSeen(preview.badge.id)
    }
  }, [preview?.earned, preview?.badge?.id])

  if (!preview) return null

  const { badge, earned, earnedAt } = preview
  const tierColor = TIER_COLORS[badge.tier] || TIER_COLORS.bronze
  const tierLabel = (badge.tier || 'bronze').toUpperCase()
  const rewardTrack = badge.discReward
    ? TRACKS.find(t => t.id === badge.discReward)
    : null
  const price = getBadgePrice(badge)
  const canAfford = balance >= price

  const handleBuy = async () => {
    if (submitting || earned || price <= 0) return
    if (!canAfford) {
      toast.error('Not enough brezn')
      return
    }
    setSubmitting(true)
    try {
      await badgesApi.buy(badge.id)
      // Refresh both caches so the card flips to "Earned" and the
      // header brezn pill ticks down.
      await Promise.all([refreshBadges(), refreshCredits()])
      toast.success(`${badge.title} unlocked!`)
      onClose()
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase()
      if (msg.includes('insufficient')) toast.error('Not enough brezn')
      else if (msg.includes('already owned')) toast.error('Already owned')
      else toast.error(err?.message || 'Purchase failed')
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
          <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Preview</p>
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

        {/* Body */}
        <div className="px-5 py-6 flex flex-col items-center">
          <img
            src={badge.image}
            alt={badge.title}
            style={{
              width: 160,
              height: 160,
              objectFit: 'contain',
              mixBlendMode: 'screen',
              filter: `brightness(1.15) contrast(1.05) drop-shadow(0 4px 16px ${tierColor}66) drop-shadow(0 0 16px ${tierColor}88)`,
            }}
          />

          <h2
            className="text-white font-stadium text-3xl tracking-wide mt-3 text-center"
            style={{ letterSpacing: '0.06em', textShadow: '0 2px 0 rgba(0,0,0,0.6)' }}
          >
            {badge.title}
          </h2>

          <div
            className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full"
            style={{
              background: `${tierColor}22`,
              border: `1px solid ${tierColor}55`,
            }}
          >
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: tierColor }}
            >
              {tierLabel}
            </span>
          </div>

          <p className="text-gray-400 text-sm mt-4 text-center leading-snug max-w-[20rem]">
            {badge.description}
          </p>

          {rewardTrack && (
            <div
              className="mt-4 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.20) 0%, rgba(127,29,29,0.10) 100%)',
                border: '1px solid rgba(248,113,113,0.45)',
              }}
            >
              <span className="text-base">💿</span>
              <div className="text-left">
                <p className="text-[9px] tracking-widest uppercase text-red-300/80">Also unlocks</p>
                <p className="text-white text-xs font-semibold">{rewardTrack.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-white/[0.06]">
          {earned ? (
            <div
              className="w-full py-3 rounded-2xl text-center font-bold text-sm"
              style={{
                background: 'rgba(220,38,38,0.15)',
                border: '1px solid rgba(248,113,113,0.40)',
                color: '#fca5a5',
              }}
            >
              ✓ Earned{earnedAt ? ` on ${new Date(earnedAt).toLocaleDateString()}` : ''}
            </div>
          ) : (
            <button
              onClick={handleBuy}
              disabled={submitting || price <= 0}
              className="w-full py-3 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
              style={{
                background: canAfford
                  ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${canAfford ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
                color: canAfford ? '#ffffff' : '#6b7280',
              }}
            >
              {submitting
                ? 'Buying…'
                : canAfford
                  ? <>Buy for {price.toLocaleString()} <PretzelCoin size={14} color="#fcd34d" /></>
                  : `Need ${(price - balance).toLocaleString()} more brezn`}
            </button>
          )}
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
