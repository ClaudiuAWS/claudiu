// BREZN wordmark — 5 cartoonish pretzel-rope letter images side-by-side.
// Each letter after the first uses a negative marginLeft to pull adjacent
// letters into a tight overlap, matching the favicon composite
// (LETTER_OVERLAP=16 on LETTER_H=56 ≈ 28% overlap ratio).
//
// Source PNGs live in /public/brezn-letter-{b,r,e,z,n}.png (Pollinations FLUX).
//
// Four sizes:
//   sm     — auth pages (legacy; auth/intro now use the composite PNG instead)
//   lg     — IntroSplash hero (legacy)
//   nav    — compact nav
//   nav-lg — TopNav (the only remaining live consumer of this component)
const LETTERS = ['b', 'r', 'e', 'z', 'n']
const SIZE_PX      = { sm: 30, lg: 44, nav: 18, 'nav-lg': 28 }
const SIZE_OVERLAP = { sm: 8,  lg: 12, nav: 4,  'nav-lg': 8  }   // ≈ 28% of letterH

export default function BreznWordmark({ size = 'sm' }) {
  const px      = SIZE_PX[size]      ?? SIZE_PX.sm
  const overlap = SIZE_OVERLAP[size] ?? SIZE_OVERLAP.sm
  return (
    <div
      className="flex items-center justify-center"
      style={{
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))',
      }}
      aria-label="BREZN"
      role="img"
    >
      {LETTERS.map((l, i) => (
        <img
          key={l}
          src={`/brezn-letter-${l}.png`}
          alt=""
          className="block"
          style={{
            height: px,
            width: 'auto',
            marginLeft: i === 0 ? 0 : -overlap,
          }}
        />
      ))}
    </div>
  )
}
