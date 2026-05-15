import { useCallback, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { useBadges } from '../hooks/useBadges'
import BadgeAwardToast from './BadgeAwardToast'

/**
 * Global per-user WebSocket listener for badge_earned events.
 * Mounts once at the app root (same pattern as InviteListener).
 * Channel: `user#{userId}` — shared with invite notifications.
 */
export default function BadgeListener() {
  const { user } = useAuth()
  const { addBadge } = useBadges()
  const [toast, setToast] = useState(null)

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'badge_earned' && msg.badge) {
      addBadge(msg.badge)
      setToast(msg.badge)
    }
  }, [addBadge])

  useWebSocket(user?.userId ? `user#${user.userId}` : null, handleMessage)

  if (!toast) return null

  return (
    <BadgeAwardToast
      badge={toast}
      onDismiss={() => setToast(null)}
    />
  )
}
