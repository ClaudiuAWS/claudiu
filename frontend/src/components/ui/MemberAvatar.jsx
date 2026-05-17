import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useInventory } from '../../hooks/useInventory'

const COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-cyan-500',
]

/**
 * Avatar circle for a room member.
 *
 * Renders the user's uploaded profile picture when `member.avatarUrl` is
 * set (persisted on the member dict by `rooms/service.py` on create/join,
 * sourced from the Cognito `custom:avatar_url` claim). Falls back to a
 * deterministic coloured-initial circle when no URL is present OR the
 * image fails to load.
 *
 * Cosmetic frames — when the avatar belongs to the CURRENT user and they
 * own the `frame-gold` or `frame-pretzel` cosmetic, a coloured ring +
 * glow wraps the image. Pretzel takes precedence over gold when both
 * are owned. Other members see the avatar plain for now (cosmetics
 * broadcast to all members is a separate pass).
 */
export default function MemberAvatar({ member, size = 36, colorIndex = 0, ring = '' }) {
  const [broken, setBroken] = useState(false)
  const { user } = useAuth()
  const { owns } = useInventory()

  const url = (member?.avatarUrl || '').trim()
  const name = member?.displayName || ''
  const initial = name?.[0]?.toUpperCase() || '?'
  const fallbackColor = COLORS[colorIndex % COLORS.length]
  const px = `${size}px`

  const isMe = !!member?.userId && user?.userId === member.userId
  const frame = isMe ? _resolveFrame(owns) : null

  const innerImg = (url && !broken) ? (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`rounded-full object-cover flex-shrink-0 ${frame ? '' : ring}`}
      style={{ width: px, height: px, objectPosition: 'center top' }}
    />
  ) : (
    <div
      className={`rounded-full ${fallbackColor} flex items-center justify-center text-white font-bold flex-shrink-0 ${frame ? '' : ring}`}
      style={{
        width:  px,
        height: px,
        fontSize: `${Math.max(10, Math.round(size * 0.4))}px`,
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  )

  if (!frame) return innerImg

  // Wrap with the cosmetic frame ring. The wrapper sits at the same
  // size as the avatar; the ring is drawn via an outer box-shadow so it
  // doesn't push out the surrounding layout.
  return (
    <div
      className={`relative flex-shrink-0 ${ring}`}
      style={{
        width:  px,
        height: px,
        borderRadius: '50%',
        boxShadow: frame.shadow,
        animation: frame.animation,
      }}
    >
      {innerImg}
      {/* Optional decorative overlay (sparkles for pretzel etc.). */}
      {frame.overlay}
      <style>{frame.keyframes}</style>
    </div>
  )
}

// Returns the active frame's render config, or null if none owned.
// Precedence: pretzel > gold.
function _resolveFrame(owns) {
  if (owns('frame-pretzel')) {
    return {
      shadow:    '0 0 0 2px #d97706, 0 0 14px rgba(217,119,6,0.85), inset 0 0 6px rgba(252,211,77,0.55)',
      animation: 'framePretzelPulse 2.8s ease-in-out infinite',
      keyframes: `
        @keyframes framePretzelPulse {
          0%, 100% { box-shadow: 0 0 0 2px #d97706, 0 0 12px rgba(217,119,6,0.70), inset 0 0 6px rgba(252,211,77,0.55); }
          50%      { box-shadow: 0 0 0 2px #f59e0b, 0 0 20px rgba(245,158,11,1.00), inset 0 0 10px rgba(252,211,77,0.75); }
        }
      `,
      overlay: null,
    }
  }
  if (owns('frame-gold')) {
    return {
      shadow:    '0 0 0 2px #fbbf24, 0 0 10px rgba(251,191,36,0.75)',
      animation: 'none',
      keyframes: '',
      overlay:   null,
    }
  }
  return null
}
