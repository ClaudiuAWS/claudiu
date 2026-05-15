import { useState } from 'react'
import toast from 'react-hot-toast'

/**
 * InviteShareSheet — bottom-sheet for sharing an invite link.
 *
 * Strategy:
 *   - Primary: `navigator.share()` (Web Share API). On modern mobile,
 *     this opens the OS share sheet so the user can pick Messenger,
 *     WhatsApp, Instagram, SMS, Telegram, email — anything they have
 *     installed — in one tap.
 *   - Fallback row: explicit deep-link buttons for WhatsApp, Messenger
 *     (Facebook share dialog), and SMS. Instagram does NOT support
 *     prefilled text via deep-link, so we surface "Copy link" as the
 *     Insta-friendly path: copy then paste into a DM.
 *
 * Recipient flow: tapping the shared link opens `/invite/<inviterUserId>`,
 * which auto-friends both users if the recipient is signed in, or stashes
 * the inviter id in localStorage to consume right after signup.
 *
 * Props:
 *   open       - controlled visibility flag
 *   onClose    - close handler
 *   inviterUserId - the current user's Cognito sub (the invite payload)
 *   inviterName - display name for the share message
 */
export default function InviteShareSheet({ open, onClose, inviterUserId, inviterName }) {
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const inviteUrl = `${window.location.origin}/invite/${inviterUserId}`
  const name = inviterName || 'A friend'
  const shareText = `${name} invited you to play Bundesliga Fantasy. Tap the link to auto-connect and start scoring with their squad: ${inviteUrl}`

  const handleNativeShare = async () => {
    if (!navigator.share) {
      toast.error('Native share not supported on this device — use the buttons below.')
      return
    }
    try {
      await navigator.share({
        title: 'Bundesliga Fantasy',
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

  const handleMessenger = () => {
    // No reliable web-share-with-text endpoint without a registered FB app.
    // The Facebook share dialog is the closest free fallback — opens with
    // the link prefilled; the user adds context themselves.
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  const handleSMS = () => {
    window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`
    onClose()
  }

  const handleInstagramHint = async () => {
    // Instagram deep links don't allow prefilled text/links. The realistic
    // path is: copy the link → open Instagram → paste in DM. Do the copy
    // for them so the next step is one tap.
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success('Link copied — now paste it in an Instagram DM.')
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
      className="fixed inset-0 z-50 flex items-end justify-center"
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
        {/* Top sheen */}
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
          <div className="grid grid-cols-4 gap-2 mt-5">
            <ChannelButton label="WhatsApp"  onClick={handleWhatsApp}      icon="💬" />
            <ChannelButton label="Messenger" onClick={handleMessenger}     icon="📨" />
            <ChannelButton label="SMS"       onClick={handleSMS}           icon="📱" />
            <ChannelButton label="Instagram" onClick={handleInstagramHint} icon="📷" />
          </div>

          {/* Link preview + copy */}
          <div
            className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="text-gray-400 text-xs truncate flex-1 font-mono">{inviteUrl}</span>
            <button
              onClick={handleCopy}
              className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{
                background: copied ? 'rgba(34,197,94,0.20)' : 'rgba(255,255,255,0.08)',
                color: copied ? '#86efac' : '#e5e7eb',
                border: `1px solid ${copied ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.15)'}`,
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

function ChannelButton({ label, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-all active:scale-[0.96]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-gray-300 text-[10px] font-semibold tracking-wider uppercase">{label}</span>
    </button>
  )
}
