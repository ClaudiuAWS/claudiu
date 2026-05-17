import { useState } from 'react'
import toast from 'react-hot-toast'
import { roomsApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useInventory } from '../../hooks/useInventory'
import { pushCheer } from './ReactionsOverlay'

// Base reactions, available to every user. Pretzel last in the array
// → renders at the BOTTOM of the vertical column (closest to the FAB
// above which the picker pops).
const BASE_EMOJIS = ['💀', '🙌', '😱', '🤣', '🔥', '⚽', '🥨']

// Premium 6-emoji pack unlocked by the 'reaction-pack' perk
// (catalog item 300 brezn). Stacks ABOVE the base column so the
// extras are visible at the top of the open picker — a clear visual
// "you have the pack" signal.
const PREMIUM_EMOJIS = ['🎉', '👑', '🤡', '🥵', '🥶', '💯']

/**
 * Floating reactions button (bottom-right of the match view).
 *
 * Tap → opens a small popover with the 6-emoji palette. Tap an emoji →
 * fires the cheer endpoint to broadcast to every party member AND
 * pushes the floater into the local overlay immediately so the sender
 * sees their own reaction without waiting for the WS roundtrip.
 */
export default function ReactionsButton({ roomCode }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const { owns } = useInventory()

  // Owners of the reaction-pack perk see PREMIUM_EMOJIS prepended to
  // the base set. Same single-column layout — the picker just grows.
  const EMOJIS = owns('reaction-pack')
    ? [...PREMIUM_EMOJIS, ...BASE_EMOJIS]
    : BASE_EMOJIS

  if (!roomCode) return null

  const send = async (emoji) => {
    // Keep the picker open so users can rapid-fire reactions. The picker
    // closes only when the trigger button itself is tapped again (the ×
    // state on the FAB).
    // Optimistic local push — the WS broadcast will fire a duplicate that
    // we de-dup by trusting "we know we just sent one"; with FLOAT_MS=3s
    // and the network roundtrip well under that, the duplicate is
    // imperceptible. Cost of getting it perfect (sender-id skip on WS
    // receipt) is higher than the benefit for v1.
    pushCheer({
      emoji,
      displayName: user?.displayName || 'You',
      avatarUrl:   user?.avatarUrl || '',
    })
    try {
      await roomsApi.cheer(roomCode, emoji)
    } catch (err) {
      // Silent failure — the local floater already played. Log for
      // debugging but don't toast: a noisy failure on a cosmetic
      // reaction is worse than the missed broadcast.
      console.warn('[cheer] broadcast failed:', err)
    }
  }

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {open && (
        <div
          className="absolute bottom-14 right-0 flex flex-col gap-1 mb-2"
          onClick={e => e.stopPropagation()}
        >
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => send(e)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-xl transition-all active:scale-90 hover:scale-110"
              style={{
                background: 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px -4px rgba(0,0,0,0.5)',
              }}
              aria-label={`React with ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{
          background: open
            ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
            : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
          border: `1px solid ${open ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
          boxShadow: open
            ? '0 8px 24px -8px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.20)'
            : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px -4px rgba(0,0,0,0.5)',
        }}
        aria-label="Open reactions"
      >
        <span className="text-xl leading-none">{open ? '×' : '🥨'}</span>
      </button>
    </div>
  )
}
