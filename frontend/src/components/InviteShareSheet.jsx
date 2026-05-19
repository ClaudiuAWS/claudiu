import { useState } from 'react'
import toast from 'react-hot-toast'

/**
 * InviteShareSheet — bottom-sheet for sharing an invite link.
 *
 * Strategy:
 *   - Primary: `navigator.share()` (Web Share API). On modern mobile,
 *     this opens the OS share sheet so the user can pick WhatsApp,
 *     Instagram, SMS, Telegram, email — anything they have installed —
 *     in one tap.
 *   - Fallback row: explicit deep-link buttons for WhatsApp and SMS.
 *     Instagram has no public DM-prefill deep link, so its tile routes
 *     through `navigator.share()` (same path as the primary button)
 *     and falls back to copy-link on desktop browsers without
 *     `navigator.share`.
 *
 * Recipient flow: tapping the shared link opens `/invite/<inviterUserId>`,
 * which auto-friends both users if the recipient is signed in, or stashes
 * the inviter id in localStorage to consume right after signup.
 *
 * Brand icons below are Simple Icons SVG paths (CC0). Inlined to avoid an
 * icon-library dependency for just three marks.
 */
export default function InviteShareSheet({ open, onClose, inviterUserId, inviterName }) {
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const inviteUrl = `${window.location.origin}/invite/${inviterUserId}`
  const name = inviterName || 'A friend'
  const shareText = `${name} invited you to play Brezn — the live Bundesliga matchday party. Tap the link to auto-connect and start scoring with their squad: ${inviteUrl}`

  const handleNativeShare = async () => {
    if (!navigator.share) {
      toast.error('Native share not supported on this device — use the buttons below.')
      return
    }
    try {
      await navigator.share({
        title: 'Brezn',
        text:  shareText,
        url:   inviteUrl,
      })
      onClose()
    } catch {
      // User cancelled — silent.
    }
  }

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  const handleSMS = () => {
    window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`
    onClose()
  }

  const handleInstagram = async () => {
    // No reliable Instagram DM-prefill deep link exists (no public
    // `https://instagram.com/direct/new?text=…` and the
    // `instagram://sharesheet` URL scheme isn't documented or stable
    // across iOS / Android versions). So we route through the OS share
    // sheet — same path the big SHARE VIA… button uses. On mobile the
    // user picks Instagram from the OS sheet and lands in DMs with the
    // invite text prefilled. Desktops without `navigator.share` fall
    // back to the historical copy-link behaviour.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Brezn', text: shareText, url: inviteUrl })
        onClose()
      } catch {
        // User cancelled — leave the sheet open so they can pick another channel.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success('Link copied — paste it in an Instagram DM.')
    } catch {
      toast.error('Copy failed — long-press the link below to copy manually.')
    }
    onClose()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
          border: '1px solid rgba(220,38,38,0.30)',
          boxShadow: '0 -16px 48px -8px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />

        <div className="px-6 pt-6 pb-8">
          <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-6" />

          <h2
            className="text-white font-stadium text-2xl text-center leading-none"
            style={{ letterSpacing: '0.08em', textShadow: '0 2px 0 rgba(0,0,0,0.6)' }}
          >
            INVITE YOUR SQUAD
          </h2>
          <p className="text-gray-400 text-xs text-center mt-2 tracking-wide">
            Tap a channel. They auto-connect when they sign up.
          </p>

          {/* Primary share button (native share sheet) */}
          <button
            onClick={handleNativeShare}
            className="w-full mt-6 py-3.5 rounded-2xl text-sm font-bold tracking-widest uppercase text-white transition-all active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              border: '1px solid rgba(248,113,113,0.55)',
              boxShadow: '0 8px 24px -8px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            Share via…
          </button>

          {/* Per-platform deep-link grid */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <ChannelButton label="WhatsApp"  onClick={handleWhatsApp}  icon={<WhatsAppIcon />}  brand="#25D366" />
            <ChannelButton label="SMS"       onClick={handleSMS}       icon={<SMSIcon />}       brand="#34C759" />
            <ChannelButton label="Instagram" onClick={handleInstagram} icon={<InstagramIcon />} brand="#E4405F" />
          </div>

          {/* Link preview + copy — matches the gradient card style used
              elsewhere in the app. */}
          <div
            className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-3"
            style={{
              background: 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span className="text-gray-400 text-xs truncate flex-1 font-mono">{inviteUrl}</span>
            <button
              onClick={handleCopy}
              className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{
                background: copied
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.30) 0%, rgba(20,83,45,0.20) 100%)'
                  : 'linear-gradient(135deg, rgba(220,38,38,0.25) 0%, rgba(127,29,29,0.15) 100%)',
                color: copied ? '#86efac' : '#fca5a5',
                border: `1px solid ${copied ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.40)'}`,
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-4 py-3 text-gray-500 text-xs font-semibold tracking-widest uppercase hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Channel tile: dark gradient card + thin border to match the rest of
 * the app's UI vocabulary. Brand icon is rendered in its native colour
 * so the WhatsApp green / Messenger blue / SMS green / Instagram pink
 * read instantly without us re-skinning them red.
 */
function ChannelButton({ label, onClick, icon, brand }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-all active:scale-[0.96]"
      style={{
        background: 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span style={{ color: brand, filter: `drop-shadow(0 0 6px ${brand}55)` }}>
        {icon}
      </span>
      <span className="text-gray-300 text-[10px] font-semibold tracking-wider uppercase">{label}</span>
    </button>
  )
}

/* ----- Brand SVG icons (Simple Icons, CC0) ---------------------------- */

function WhatsAppIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.695.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

function SMSIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  )
}

function InstagramIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.897 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.897-.422-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  )
}
