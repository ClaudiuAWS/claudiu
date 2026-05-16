// Branded crest — the Bundesliga emblem from /logo-bf.png with BREZN
// pretzel-letters laid across the bottom-right corner, deliberately
// overhanging the right edge of the red square so the last letter (or two)
// hangs out for a hand-applied / stickered-on look. No background or border
// behind the letters — just transparent letter PNGs over the red crest, with
// a faint drop shadow for depth.
//
// Three sizes, all keeping the same 88:70 crest aspect ratio (= the
// "top 80% of a square emblem" crop the auth pages established):
//   sm  — auth pages
//   lg  — IntroSplash hero
//   nav — TopNav compact
const LETTERS = ['b', 'r', 'e', 'z', 'n']

// `overlap` is the negative margin-left applied to every letter after the
// first — pulls them closer together so the BREZN row reads as one word
// instead of 5 isolated stickers. Each letter PNG has its own transparent
// margin baked in, so a positive value here just shaves that margin.
const SIZE_MAP = {
  sm:  { crestW: 88,  crestH: 70,  letterH: 24, overlap: 7,  right: -30, bottom: -2 },
  lg:  { crestW: 132, crestH: 106, letterH: 34, overlap: 10, right: -46, bottom: -4 },
  nav: { crestW: 40,  crestH: 32,  letterH: 13, overlap: 4,  right: -16, bottom: -1 },
}

export default function BrandedCrest({ size = 'sm' }) {
  const s = SIZE_MAP[size] || SIZE_MAP.sm
  return (
    <div
      className="relative"
      style={{ width: s.crestW, height: s.crestH }}
      aria-label="BUNDESLIGA BREZN"
      role="img"
    >
      {/* Cropped Bundesliga crest — overflow:hidden drops the baked-in
          BUNDESLIGA text from the bottom of the source PNG. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: s.crestW, height: s.crestH }}
      >
        <img
          src="/logo-bf.png"
          alt=""
          className="block drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
          style={{ width: s.crestW, height: s.crestW, display: 'block' }}
        />
      </div>

      {/* BREZN letters — bottom-right of the red square, tilted ~-25°
          (counter-clockwise) for a stylised diagonal vibe. Anchored at the
          row's bottom-left so the B end stays planted near the bottom-right
          of the crest while the N end swings up-and-right past the edge.
          No background, no border — transparent letter PNGs over the crest
          with a faint drop shadow for depth. Sibling of (not inside) the
          overflow:hidden clip above, so the overhang isn't truncated. */}
      <div
        style={{
          position:        'absolute',
          bottom:          s.bottom,
          right:           s.right,
          display:         'flex',
          alignItems:      'flex-end',
          filter:          'drop-shadow(0 2px 3px rgba(0,0,0,0.55))',
          pointerEvents:   'none',
          transform:       'rotate(-25deg)',
          transformOrigin: 'left bottom',
        }}
      >
        {LETTERS.map((l, i) => (
          <img
            key={l}
            src={`/brezn-letter-${l}.png`}
            alt=""
            style={{
              height:     s.letterH,
              width:      'auto',
              display:    'block',
              marginLeft: i === 0 ? 0 : -s.overlap,
            }}
          />
        ))}
      </div>
    </div>
  )
}
