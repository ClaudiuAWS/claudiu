import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { friendsApi } from '../services/api'

const PENDING_INVITE_KEY = 'claudiu.pendingInviter'

/**
 * PendingInviteConsumer — fires the deferred accept-invite call after a
 * post-signup login.
 *
 * Mounted inside the post-auth Layout, so it only runs once the user is
 * authenticated. Reads `claudiu.pendingInviter` (stashed by InvitePage
 * when a recipient hit the invite link before signing in), fires the
 * accept-invite endpoint, then clears the key. The clear-first pattern
 * prevents a network blip from looping a retry on every Layout remount.
 */
export default function PendingInviteConsumer() {
  useEffect(() => {
    let inviterUserId
    try { inviterUserId = localStorage.getItem(PENDING_INVITE_KEY) } catch { return }
    if (!inviterUserId) return
    try { localStorage.removeItem(PENDING_INVITE_KEY) } catch {}

    friendsApi.acceptInvite(inviterUserId)
      .then(({ friend }) => {
        toast.success(`You're now friends with ${friend?.displayName || friend?.email || 'them'}.`)
      })
      .catch(err => {
        toast.error(`Couldn't accept invite: ${err?.message || 'unknown error'}`)
      })
  }, [])

  return null
}
