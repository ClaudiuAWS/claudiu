// Brezn top nav — Bundesliga crest (kept from the original) + a
// hand-generated pretzel-typography wordmark for "BREZN". The wordmark
// is a raster PNG generated via Pollinations FLUX (same pipeline that
// produced the badge crests); each letter is sculpted from a Bavarian
// pretzel rope. See ROADMAP.md / the plan file for the exact prompt
// if regeneration is needed.
export default function TopNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800 z-50">
      <div className="flex items-center justify-center gap-3 h-16">
        <img src="/logo-bf.png" alt="Bundesliga" className="h-10" />
        <img
          src="/brezn-wordmark.png"
          alt="Brezn"
          className="h-9"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
        />
      </div>
    </nav>
  )
}
