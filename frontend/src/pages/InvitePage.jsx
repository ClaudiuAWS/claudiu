import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { friendsApi } from '../services/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const PENDING_INVITE_KEY = 'claudiu.pendingInviter'

/**
 * /invite/:inviterUserId — pass-through page that turns a shared link
 * into an auto-friendship.
 *
 *   - Logged in: POSTs /friends/accept-invite, navigates to /friends with
 *     a success toast.
 *   - Logged out: stashes the inviter id in localStorage so the next
 *     successful sign-in (handled by PendingInviteConsumer mounted in
 *     Layout) consumes it. Then redirects to /login.
 *
 * Doesn't render anything meaningful — it's just routing glue with a
 * spinner while the redirect/accept resolves.
 */
export default function InvitePage() {
  const { inviterUserId } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!inviterUserId) {
      navigate('/', { replace: true })
      return
    }

    // Logged-in fast path
    if (user) {
      if (user.userId === inviterUserId) {
        toast.error("That's your own invite link — share it with a friend instead.")
        navigate('/friends', { replace: true })
        return
      }
      friendsApi.acceptInvite(inviterUserId)
        .then(({ friend }) => {
          toast.success(`You're now friends with ${friend?.displayName || friend?.email || 'them'}.`)
          navigate('/friends', { replace: true })
        })
        .catch(err => {
          toast.error(err?.message || 'Could not accept this invite.')
          navigate('/friends', { replace: true })
        })
      return
    }

    // Not logged in — stash and bounce to /login. PendingInviteConsumer
    // (inside the post-auth Layout) picks it up after sign-in finishes.
    try { localStorage.setItem(PENDING_INVITE_KEY, inviterUserId) } catch {}
    navigate('/login', { replace: true })
  }, [inviterUserId, user, loading, navigate])

  return <LoadingSpinner />
}
