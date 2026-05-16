import BreznWordmark from './BreznWordmark'
import MusicWidget from './MusicWidget'

// Global in-app nav: official Bundesliga red square crest on the left
// (cropped from /logo-bf.png to drop the baked-in BUNDESLIGA text below the
// emblem) + the BREZN pretzel-letter wordmark on the right. No BUNDESLIGA
// text in the nav — kept compact for h-16. The polished composite logo
// lives on the auth/splash pages; this nav is a stripped-down brand bar.
//
// The MusicWidget lives in the top-right corner — collapsed it's just a
// speaker icon; tap drops a Spotify-style mini-player (disc art, track
// title, prev/play-pause/next).
export default function TopNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800 z-50">
      <div className="relative flex items-center justify-center gap-3 h-16 px-4">
        <div className="overflow-hidden" style={{ width: 46, height: 38 }}>
          <img
            src="/logo-bf.png"
            alt="Bundesliga"
            style={{ width: 46, height: 46, display: 'block' }}
          />
        </div>
        <BreznWordmark size="nav-lg" />

        {/* Music control — absolute so it doesn't shift the centered brand. */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <MusicWidget />
        </div>
      </div>
    </nav>
  )
}
