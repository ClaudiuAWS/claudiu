import { useState } from 'react'

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
 * image fails to load — same palette the SQUAD list used before, so
 * legacy rooms keep their look until members rejoin.
 *
 * Size is configurable via the `size` prop (px). Color index is taken
 * from `colorIndex` (caller-supplied) so position-in-list determines
 * the fallback colour consistently (matching the prior MembersList
 * behaviour).
 */
export default function MemberAvatar({ member, size = 36, colorIndex = 0, ring = '' }) {
  const [broken, setBroken] = useState(false)
  const url = (member?.avatarUrl || '').trim()
  const name = member?.displayName || ''
  const initial = name?.[0]?.toUpperCase() || '?'
  const fallbackColor = COLORS[colorIndex % COLORS.length]
  const px = `${size}px`

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`rounded-full object-cover flex-shrink-0 ${ring}`}
        style={{ width: px, height: px, objectPosition: 'center top' }}
      />
    )
  }

  return (
    <div
      className={`rounded-full ${fallbackColor} flex items-center justify-center text-white font-bold flex-shrink-0 ${ring}`}
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
}
