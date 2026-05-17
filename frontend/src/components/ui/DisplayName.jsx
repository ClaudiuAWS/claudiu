import { useAuth } from '../../hooks/useAuth'
import { useInventory } from '../../hooks/useInventory'

/**
 * DisplayName — renders a member's name with their owned cosmetic
 * applied. Cosmetics scope: ONLY the current user's name uses the
 * owned cosmetic. Other members see plain text for now (a follow-up
 * pass can join the inventory into room state so cosmetics broadcast
 * to everyone).
 *
 * Layering precedence (highest wins): rainbow > red > plain. Owning
 * both name-red and name-rainbow shows rainbow.
 *
 * Usage:
 *   <DisplayName member={m} className="text-sm font-bold" />
 *   <DisplayName name={user.displayName} userId={user.userId} />
 */
export default function DisplayName({
  member,
  name,
  userId,
  className = '',
  style = {},
  ...rest
}) {
  const { user } = useAuth()
  const { owns } = useInventory()

  const text = name ?? member?.displayName ?? '?'
  const mid  = userId ?? member?.userId
  const isMe = !!mid && user?.userId === mid

  let extraStyle = {}
  if (isMe) {
    if (owns('name-rainbow')) {
      extraStyle = {
        backgroundImage:      'linear-gradient(90deg, #f87171, #fcd34d, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)',
        backgroundSize:       '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip:       'text',
        color:                'transparent',
        WebkitTextFillColor:  'transparent',
        animation:            'displayNameRainbow 6s linear infinite',
      }
    } else if (owns('name-red')) {
      extraStyle = { color: '#f87171' }
    }
  }

  return (
    <>
      <span className={className} style={{ ...style, ...extraStyle }} {...rest}>
        {text}
      </span>
      {/* Inline keyframe lives once per render but Tailwind dedupes
          identical inline-style tags. Kept here so consumers don't
          need to import a CSS module. */}
      <style>{`
        @keyframes displayNameRainbow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </>
  )
}
