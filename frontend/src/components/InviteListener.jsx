import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { roomsApi } from '../services/api'
import toast from 'react-hot-toast'

/**
 * Global per-user WebSocket listener for cross-page notifications
 * (currently: party invites). Mounts once at the app root.
 *
 * Channel: `user#{userId}` — every authenticated tab opens one. The Lambda
 * pushes a `room_invite` payload when a friend invites you to their party.
 */
export default function InviteListener() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(null)   // { roomCode, matchId, inviter }
  const [accepting, setAccepting] = useState(false)

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'room_invite') {
      // If a previous invite is still showing, replace it with the new one.
      setPending({
        roomCode: msg.roomCode,
        matchId:  msg.matchId,
        inviter:  msg.inviter || {},
      })
    }
  }, [])

  useWebSocket(user?.userId ? `user#${user.userId}` : null, handleMessage)

  const handleAccept = () => {
    if (!pending) return
    // Optimistic navigation: the WS payload already carries roomCode +
    // matchId, so we can flip routes BEFORE the join API resolves. This
    // makes the perceived experience instant regardless of whatever
    // screen the user was on (album editor, tracks page, mid-modal —
    // doesn't matter, the route change unmounts everything).
    //
    // The join request fires in parallel; the lobby's useRoom hook
    // picks up the room state via WS `room_update` once the server
    // acknowledges, so a slow join just delays "you're in the
    // members list" — the user never waits to navigate.
    const { roomCode, matchId: payloadMatchId } = pending
    if (!roomCode) {
      toast.error("Invite is missing a room code — ask your friend to resend.")
      setPending(null)
      return
    }
    if (!payloadMatchId) {
      // Payload had no matchId (legacy backend / race). Fall back to
      // the slower-but-safe path: await join, derive matchId from the
      // response, then navigate. Pass the joined room as initialRoom
      // so LobbyPage renders fully-populated on the first frame instead
      // of showing a spinner while useRoom re-fetches.
      setAccepting(true)
      ;(async () => {
        try {
          const joined = await roomsApi.join(roomCode)
          const fullRoom = joined?.room || joined  // some shapes return room at top level
          const mid = fullRoom?.matchId
          if (!mid) {
            toast.error("Couldn't find that party — try again from the friend's profile.")
            return
          }
          sessionStorage.setItem('fan_squad_room_code', roomCode)
          setPending(null)
          navigate(`/lobby/${mid}`, { state: { initialRoom: fullRoom } })
        } catch (err) {
          toast.error(err.message || 'Failed to join')
        } finally {
          setAccepting(false)
        }
      })()
      return
    }

    // Happy path — instant navigate, join in the background. Build a
    // RICH initialRoom stub: we know enough to pre-populate the members
    // list with both the inviter (host) and the accepter (self), so the
    // friend's lobby looks fully populated on the first frame instead of
    // an empty members list that feels like "nothing happened".
    //
    // Field shape matches what backend room.members[] uses (consumed by
    // MembersList.jsx: userId, displayName, avatarUrl, score,
    // teamSelection). The WS room_update that arrives ~300-500 ms later
    // overwrites this stub with the authoritative server state — but
    // since the data matches what's already on screen, there's no
    // visible flicker.
    const inviterMember = pending.inviter?.userId ? {
      userId:        pending.inviter.userId,
      displayName:   pending.inviter.displayName || 'Friend',
      avatarUrl:     pending.inviter.avatarUrl || '',
      score:         0,
      teamSelection: [],
    } : null
    const selfMember = user?.userId ? {
      userId:        user.userId,
      displayName:   user.displayName || 'You',
      avatarUrl:     user.avatarUrl || '',
      score:         0,
      teamSelection: [],
    } : null
    const stubMembers = [inviterMember, selfMember].filter(Boolean)

    sessionStorage.setItem('fan_squad_room_code', roomCode)
    setPending(null)
    navigate(`/lobby/${payloadMatchId}`, {
      state: {
        initialRoom: {
          roomCode,
          matchId:    payloadMatchId,
          members:    stubMembers,
          // The inviter is the host of the room they're inviting from.
          // (Backend guards this in invite_to_room — only members can invite,
          // and the room creator is always a member; here we assume the
          // inviter created the party, which is the common case. If they
          // didn't, the WS room_update will correct the hostUserId.)
          hostUserId: pending.inviter?.userId || null,
          status:     'lobby',
        },
      },
    })

    roomsApi.join(roomCode).catch(err => {
      // If the background join fails, surface a toast + bounce back
      // home so the user isn't stranded on a lobby they're not in.
      toast.error(err?.message || 'Failed to join — sent you back home.')
      navigate('/')
    })
  }

  const handleDecline = () => setPending(null)

  if (!pending) return null

  const inviter = pending.inviter
  const initials = (inviter.displayName || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] px-4 pt-3 pointer-events-none animate-[slideDown_300ms_ease-out]">
      <div
        className="max-w-md mx-auto rounded-2xl p-4 pointer-events-auto shadow-2xl"
        style={{
          background: 'linear-gradient(145deg, #1a2438 0%, #0d1117 100%)',
          border: '1px solid rgba(34,197,94,0.25)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            {inviter.avatarUrl ? (
              <img src={inviter.avatarUrl} alt={inviter.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{inviter.displayName || 'A friend'}</p>
            <p className="text-gray-400 text-xs truncate">invited you to a party</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            disabled={accepting}
            className="flex-1 py-2.5 rounded-xl text-gray-300 text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {accepting ? 'Joining…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
