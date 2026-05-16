import { useEffect, useRef, useState } from 'react'
import { useAppAudio } from '../hooks/useAppAudio'
import DiscArtwork from './ui/DiscArtwork'

/**
 * MusicWidget — small audio-icon button (top-right of the screen) that
 * pops a Spotify-like mini-player on tap.
 *
 * Closed state: just the icon — animated speaker when playing, muted
 * speaker when paused. Tap to open.
 *
 * Open state: rotating disc artwork, current track + artist, prev /
 * play-pause / next controls. Tap outside or tap the icon again to close.
 *
 * State lives entirely in useAppAudio (the single source of truth for
 * what's playing). This widget just renders + dispatches actions; the
 * provider's <audio> element keeps playing whether the widget is open
 * or closed.
 */
export default function MusicWidget() {
  const {
    appEnabled,
    toggleApp,
    appTrack,
    nextTrack,
    prevTrack,
  } = useAppAudio()

  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Tap-outside to close the dropdown.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      {/* Icon button — sits in the top-right corner of the TopNav. The
          animated bars under the speaker glyph telegraph "music playing"
          even before the user opens the panel. */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{
          background: open
            ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
            : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
          border: `1px solid ${open ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
          boxShadow: open
            ? '0 4px 14px -4px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.18)'
            : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px -2px rgba(0,0,0,0.5)',
        }}
        aria-label={open ? 'Close player' : 'Open music player'}
        aria-expanded={open}
      >
        {open ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <MusicIcon playing={appEnabled} />
        )}
      </button>

      {/* Dropdown mini-player — anchored to the icon's bottom-right
          corner, slides down on open. */}
      {open && (
        <div
          className="absolute top-12 right-0 w-72 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #14181f 0%, #0a0d12 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 20px 48px -12px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
            animation: 'musicWidgetIn 220ms cubic-bezier(.22,1.4,.36,1)',
          }}
        >
          {/* Disc + track info row */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div
              style={{
                /* Slow rotation while playing; freeze when paused. The
                   useAppAudio context drives appEnabled. */
                animation: appEnabled ? 'discSpin 8s linear infinite' : 'none',
              }}
            >
              <DiscArtwork track={appTrack} size={48} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">
                {appTrack?.title || 'Not playing'}
              </p>
              <p className="text-gray-500 text-xs truncate">
                {appTrack?.artist || '—'}
              </p>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-center gap-2 px-4 pb-4">
            <ControlButton onClick={prevTrack} title="Previous track">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </ControlButton>
            <ControlButton primary onClick={toggleApp} title={appEnabled ? 'Pause' : 'Play'}>
              {appEnabled ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </ControlButton>
            <ControlButton onClick={nextTrack} title="Next track">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M16 6h2v12h-2V6zM6 6v12l8.5-6L6 6z" />
              </svg>
            </ControlButton>
          </div>
        </div>
      )}

      <style>{`
        @keyframes musicWidgetIn {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes discSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes audioBar {
          0%, 100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1);   }
        }
      `}</style>
    </div>
  )
}

function ControlButton({ children, onClick, primary, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center justify-center transition-all active:scale-90 hover:scale-105"
      style={{
        width: primary ? 40 : 32,
        height: primary ? 40 : 32,
        borderRadius: '50%',
        background: primary
          ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
          : 'rgba(255,255,255,0.06)',
        border: `1px solid ${primary ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: primary
          ? '0 4px 12px -4px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.18)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </button>
  )
}

// Animated speaker glyph — three vertical bars next to a speaker cone.
// When `playing`, the bars pulse; when paused, they freeze at minimal
// height so the icon still reads as "music".
function MusicIcon({ playing }) {
  const Bar = ({ delay, base }) => (
    <span
      style={{
        display: 'inline-block',
        width: 2,
        height: 10,
        borderRadius: 1,
        background: '#fbbf24',
        transformOrigin: 'center bottom',
        transform: `scaleY(${base})`,
        animation: playing ? `audioBar 0.9s ease-in-out ${delay}s infinite` : 'none',
      }}
    />
  )
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      <Bar delay={0}    base={0.5} />
      <Bar delay={0.2}  base={0.9} />
      <Bar delay={0.4}  base={0.6} />
    </span>
  )
}
