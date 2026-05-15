/**
 * PretzelCoin — the in-game currency icon.
 *
 * Drawn from scratch as a Bavarian "Brezn" (pretzel) — fits the
 * Bundesliga / Serie-A footballing aesthetic better than a generic
 * coin glyph and gives the currency a name worth saying out loud.
 *
 * Three primitives composed into the classic pretzel silhouette:
 *   - left loop  (circle stroke)
 *   - right loop (circle stroke, slightly overlapping the left to
 *                 visually create the "twist" knot at the top)
 *   - bottom bow (cubic bezier closing the U-shape under the loops)
 *
 * The optional small "tick" at the very top doubles as the knot
 * crossover and gives the icon character at large sizes; it's hidden
 * under 14 px where it would muddy the silhouette.
 *
 * Themable via `color` (defaults to currentColor so callers control
 * via Tailwind text-* classes). Sizes referenced today: 12 (FriendRow),
 * 14 (Matchday pill), 16 (Wallet card subline), 24 (Wallet card hero).
 */
export default function PretzelCoin({ size = 14, color = 'currentColor', className = '', style = {} }) {
  const stroke = size <= 12 ? 2.6 : size <= 16 ? 2.4 : 2.1
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {/* Left loop */}
      <circle cx="8.5" cy="10" r="4.5" />
      {/* Right loop — overlaps the left at top, the visual "knot" */}
      <circle cx="15.5" cy="10" r="4.5" />
      {/* Bottom bow — the closing strand */}
      <path d="M5 13.5 C 7 19.5, 17 19.5, 19 13.5" />
      {/* Top knot tick — only shows clearly at >=14 px */}
      {size >= 14 && <path d="M10.5 5.5 L12 6.8 L13.5 5.5" />}
    </svg>
  )
}
