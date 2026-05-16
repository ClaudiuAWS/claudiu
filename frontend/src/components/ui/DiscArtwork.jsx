import { useState } from 'react'

/**
 * DiscArtwork — album cover with a thin red ring, or vinyl-style
 * CSS-letter fallback when the track has no artwork.
 *
 * The original vinyl-rim treatment swallowed the album cover (covered
 * ~90% of the tile in rim + sheen). When the user added real Spotify
 * art for 28 of the 29 tracks, the rim hurt more than it helped — the
 * cover was the smallest element. Now: image fills the disc, a thin
 * red rim + top-light highlight wrap it. The vinyl-rim aesthetic
 * survives only as the fallback for the one track with no Spotify art
 * (the Gaskin intro).
 *
 * `locked` dims via grayscale + brightness for badge-gated tracks.
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
      {hasArt ? (
        <>
          {/* Album cover fills the whole tile */}
          <img
            src={track.artwork}
            alt=""
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full rounded-full object-cover"
            style={{ display: 'block' }}
          />
          {/* Thin red rim + glossy top-light, no rim filler */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow:
                'inset 0 0 0 1.5px rgba(220,38,38,0.55), ' +
                'inset 0 1px 0 rgba(255,255,255,0.20), ' +
                '0 1px 3px rgba(0,0,0,0.5)',
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              top: 1, left: 1, right: 1, bottom: '55%',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, transparent 100%)',
            }}
          />
        </>
      ) : (
        <>
          {/* Vinyl rim — only for the no-artwork fallback */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 30% 25%, #4a0808 0%, #1a0303 35%, #0a0000 60%, #000 100%)',
              boxShadow:
                '0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 1px rgba(0,0,0,0.5)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: 3, left: 3, right: 3, bottom: 3,
              border: '1px solid rgba(220,38,38,0.30)',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
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
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              top: 1, left: 1, right: 1, bottom: '60%',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
            }}
          />
        </>
      )}
    </div>
  )
}
