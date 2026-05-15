import { useState } from 'react'

/**
 * DiscArtwork — vinyl-style disc with album cover or letter label.
 *
 * When `track.artwork` is a valid image URL, the cover sits inside the
 * vinyl's inner-circle label area. Outer black rim + sheen + concentric
 * red ring stay the same so the aesthetic is consistent across the
 * library.
 *
 * Without artwork (or if the image fails to load), falls back to the
 * red-and-black radial gradient + the track's first initial in Bebas
 * Neue — the original CSS-only treatment.
 *
 * `locked` dims the whole disc via grayscale + brightness; used for
 * badge-gated tracks the user hasn't earned yet.
 */
export default function DiscArtwork({ track, size = 40, locked = false }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasArt = !!(track && track.artwork) && !imgFailed
  const initial = (track?.title || '·').trim().charAt(0).toUpperCase()
  const half = size / 2

  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: size,
        height: size,
        filter: locked ? 'grayscale(0.85) brightness(0.6)' : 'none',
        transition: 'filter 200ms ease',
      }}
    >
      {/* Outer vinyl rim — black with red highlight */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 30% 25%, #4a0808 0%, #1a0303 35%, #0a0000 60%, #000 100%)',
          boxShadow:
            '0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 1px rgba(0,0,0,0.5)',
        }}
      />

      {/* Concentric red detail ring */}
      <div
        className="absolute rounded-full"
        style={{
          top: 3, left: 3, right: 3, bottom: 3,
          border: '1px solid rgba(220,38,38,0.30)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)',
        }}
      />

      {/* Inner label — either album cover or CSS letter */}
      {hasArt ? (
        <div
          className="absolute rounded-full overflow-hidden"
          style={{
            top: half * 0.45, left: half * 0.45, right: half * 0.45, bottom: half * 0.45,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src={track.artwork}
            alt=""
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute rounded-full flex items-center justify-center font-stadium"
          style={{
            top: half * 0.55, left: half * 0.55, right: half * 0.55, bottom: half * 0.55,
            background:
              'radial-gradient(circle at 35% 30%, #ef4444 0%, #dc2626 50%, #7f1d1d 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: Math.max(8, size * 0.28),
            letterSpacing: '0.05em',
            textShadow: '0 1px 0 rgba(0,0,0,0.6)',
          }}
        >
          {initial}
        </div>
      )}

      {/* Top sheen over the whole disc */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          top: 1, left: 1, right: 1, bottom: '60%',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
        }}
      />
    </div>
  )
}
