// BREZN wordmark — 5 cartoonish pretzel-rope letter images side-by-side.
// Replaces the previous <p>FANTASY</p> text in the auth/splash brand stack.
// Source PNGs live in /public/brezn-letter-{b,r,e,z,n}.png (Pollinations FLUX).
//
// Three sizes match the three contexts:
//   sm  — auth pages (1.5rem cap height equivalent)
//   lg  — IntroSplash hero (2.2rem cap height equivalent)
//   nav — TopNav compact horizontal nav
const LETTERS = ['b', 'r', 'e', 'z', 'n']
const SIZE_PX  = { sm: 30, lg: 44, nav: 18, 'nav-lg': 28 }
const SIZE_GAP = { sm: 1,  lg: 2,  nav: 0,  'nav-lg': 1  }

export default function BreznWordmark({ size = 'sm' }) {
  const px  = SIZE_PX[size]  ?? SIZE_PX.sm
  const gap = SIZE_GAP[size] ?? SIZE_GAP.sm
  return (
    <div
      className="flex items-center justify-center"
      style={{
        gap,
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))',
      }}
      aria-label="BREZN"
      role="img"
    >
      {LETTERS.map((l) => (
        <img
          key={l}
          src={`/brezn-letter-${l}.png`}
          alt=""
          className="block"
          style={{
            height: px,
            width: 'auto',
          }}
        />
      ))}
    </div>
  )
}
