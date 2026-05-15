import PretzelCoin from './ui/PretzelCoin'

// Brezn wordmark — pretzel icon + stadium-letterform "BREZN". The
// official Bundesliga crest was dropped intentionally: trademark risk +
// we're a separate product. The crest can still appear in match views
// where it identifies the league context, but not in the global nav.
export default function TopNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800 z-50">
      <div className="flex items-center justify-center gap-2.5 h-16">
        <PretzelCoin size={26} color="#fcd34d" />
        <span
          className="font-stadium text-white leading-none"
          style={{
            fontSize: '1.4rem',
            letterSpacing: '0.15em',
            textShadow: '0 2px 0 rgba(0,0,0,0.6)',
          }}
        >
          BREZN
        </span>
      </div>
    </nav>
  )
}
