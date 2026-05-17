import { useState } from 'react'
import { getTeamLogoUrl } from '../../utils/clubLogos'

/**
 * ClubBadge — real Bundesliga club crest with a stylized SVG fallback.
 *
 * Primary path: render an <img> of the real club crest from the
 * shared `clubLogos` map (SofaScore CDN URLs). Falls back to a
 * stylized inline-SVG crest (per-club color + abbreviation) when the
 * team isn't in the logo map OR the CDN request fails.
 *
 * Lookup is by case-insensitive substring on `teamName`, so loader-side
 * variations like "FC Bayern München", "Bayern Munich", or
 * "Bayern München" all resolve to the same crest. Unknown teams fall
 * back to a neutral grey ring with the first 3 letters of the team
 * name — no broken visuals.
 */

const CLUB_REGISTRY = {
  // Top Bundesliga clubs by name keyword. Order doesn't matter — first
  // match wins, but the registry is small enough that collisions are
  // hand-managed.
  'bayern':       { abbr: 'FCB', primary: '#dc052d', secondary: '#0066b2' },
  'hamburger':    { abbr: 'HSV', primary: '#0a3d8f', secondary: '#000000' },
  'hamburg':      { abbr: 'HSV', primary: '#0a3d8f', secondary: '#000000' },
  'dortmund':     { abbr: 'BVB', primary: '#fde100', secondary: '#000000' },
  'leipzig':      { abbr: 'RBL', primary: '#dd0741', secondary: '#001f5b' },
  'leverkusen':   { abbr: 'B04', primary: '#e32219', secondary: '#000000' },
  'frankfurt':    { abbr: 'SGE', primary: '#e1000f', secondary: '#000000' },
  'wolfsburg':    { abbr: 'WOB', primary: '#65b32e', secondary: '#000000' },
  'borussia möne': { abbr: 'BMG', primary: '#000000', secondary: '#00a651' },
  'gladbach':     { abbr: 'BMG', primary: '#000000', secondary: '#00a651' },
  'mönchenglad':  { abbr: 'BMG', primary: '#000000', secondary: '#00a651' },
  'union':        { abbr: 'FCU', primary: '#e30613', secondary: '#fcd431' },
  'freiburg':     { abbr: 'SCF', primary: '#5d0119', secondary: '#ffffff' },
  'stuttgart':    { abbr: 'VFB', primary: '#e32219', secondary: '#ffffff' },
  'mainz':        { abbr: 'M05', primary: '#ed1c24', secondary: '#ffffff' },
  'köln':         { abbr: 'KOE', primary: '#ed1c24', secondary: '#ffffff' },
  'koln':         { abbr: 'KOE', primary: '#ed1c24', secondary: '#ffffff' },
  'augsburg':     { abbr: 'FCA', primary: '#ba3733', secondary: '#3b8a3e' },
  'hoffenheim':   { abbr: 'TSG', primary: '#1961ac', secondary: '#ffffff' },
  'bremen':       { abbr: 'SVW', primary: '#1d9053', secondary: '#ffffff' },
  'werder':       { abbr: 'SVW', primary: '#1d9053', secondary: '#ffffff' },
  'bochum':       { abbr: 'VFL', primary: '#005ca9', secondary: '#ffffff' },
  'darmstadt':    { abbr: 'SVD', primary: '#1a3265', secondary: '#ffffff' },
  'heidenheim':   { abbr: 'FCH', primary: '#e21d33', secondary: '#0d398f' },
  'kiel':         { abbr: 'KSV', primary: '#0067b1', secondary: '#ffffff' },
  'st pauli':     { abbr: 'STP', primary: '#69462b', secondary: '#ffffff' },
  'pauli':        { abbr: 'STP', primary: '#69462b', secondary: '#ffffff' },
  'paderborn':    { abbr: 'SCP', primary: '#0066b2', secondary: '#000000' },
  'düsseldorf':   { abbr: 'F95', primary: '#e2001a', secondary: '#ffffff' },
  'dusseldorf':   { abbr: 'F95', primary: '#e2001a', secondary: '#ffffff' },
  'schalke':      { abbr: 'S04', primary: '#004d9d', secondary: '#ffffff' },
  'hannover':     { abbr: 'H96', primary: '#009530', secondary: '#000000' },
  'hertha':       { abbr: 'BSC', primary: '#005ca9', secondary: '#ffffff' },
  'nürnberg':     { abbr: 'FCN', primary: '#9a0a14', secondary: '#ffffff' },
  'kaiserslautern':{ abbr: 'FCK', primary: '#e2001a', secondary: '#ffffff' },
}

function lookup(teamName) {
  if (!teamName) return null
  const lc = String(teamName).toLowerCase()
  for (const [key, val] of Object.entries(CLUB_REGISTRY)) {
    if (lc.includes(key)) return val
  }
  return null
}

export default function ClubBadge({ teamName, size = 48, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const club      = lookup(teamName)
  const abbr      = club?.abbr ?? (teamName || '?').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
  const primary   = club?.primary   ?? '#6b7280'  // neutral grey-500 fallback
  const secondary = club?.secondary ?? '#1f2937'  // gray-800 fallback
  const safeName  = teamName || 'Unknown club'
  const logoUrl   = getTeamLogoUrl(teamName)

  // Primary path: real club crest from SofaScore CDN. On CDN failure
  // (network error, blocked region, deprecated team ID) the <img>'s
  // onError flips imgFailed and we drop down to the stylized SVG.
  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={`${safeName} crest`}
        referrerPolicy="no-referrer"
        className={className}
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        style={{
          flexShrink: 0,
          objectFit: 'contain',
          // Subtle drop shadow so the crest doesn't blend into the
          // dark card background. Matches the live-match Scoreboard's
          // <TeamLogo> visual weight.
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
        }}
      />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      className={className}
      role="img"
      aria-label={`${safeName} crest`}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <radialGradient id={`crestSheen-${abbr}`} cx="50%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.30)" />
          <stop offset="60%"  stopColor="rgba(255,255,255,0.00)" />
        </radialGradient>
      </defs>
      {/* Outer ring — primary color with secondary stroke */}
      <circle cx="28" cy="28" r="26" fill={primary} stroke={secondary} strokeWidth="2" />
      {/* Inner white field */}
      <circle cx="28" cy="28" r="20" fill="#ffffff" />
      {/* Stadium-font abbreviation in primary color */}
      <text
        x="28" y="36"
        textAnchor="middle"
        fontFamily="Bebas Neue, Inter, system-ui, sans-serif"
        fontSize="18"
        fontWeight="900"
        fill={primary}
        letterSpacing="1.5"
      >
        {abbr}
      </text>
      {/* Subtle metallic upper highlight */}
      <path
        d="M6,18 Q28,2 50,18"
        fill="none"
        stroke="rgba(255,255,255,0.30)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Radial sheen overlay */}
      <circle cx="28" cy="28" r="26" fill={`url(#crestSheen-${abbr})`} pointerEvents="none" />
    </svg>
  )
}
