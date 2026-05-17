/**
 * Shared Bundesliga club logo map.
 *
 * Previously this lived inline in `Scoreboard.jsx` (live match view).
 * Extracted here so `ClubBadge.jsx` (Home + Lobby match cards) can use
 * the same source of truth — both surfaces show the real club crests
 * fetched from SofaScore's CDN with the same fallback behavior.
 *
 * URLs are CDN-stable team IDs from SofaScore. Adding a new club is
 * a one-line append: find the team page on sofascore.com, grab the
 * team ID from the URL, plug it into the `/team/{id}/image` template.
 */

export const TEAM_LOGOS = {
  // Demo match — Bundesliga 2022/23 matchday 1: Bayern Munich 5-0 Hamburger SV
  // (NB: HSV played that match in the 2. Bundesliga; the demo dataset uses
  // their canonical crest URL regardless.)
  'Bayern Munich':  'https://img.sofascore.com/api/v1/team/2672/image',
  'Hamburger SV':   'https://img.sofascore.com/api/v1/team/2676/image',

  // Future expansion — drop more clubs in here when adding new matches.
  // 'Borussia Dortmund':       'https://img.sofascore.com/api/v1/team/2829/image',
  // 'RB Leipzig':              'https://img.sofascore.com/api/v1/team/36360/image',
  // 'Bayer Leverkusen':        'https://img.sofascore.com/api/v1/team/2681/image',
  // 'Eintracht Frankfurt':     'https://img.sofascore.com/api/v1/team/2674/image',
}

/**
 * Look up a team logo URL by name, with case-insensitive substring
 * tolerance. So all of these resolve to the same URL:
 *   "Bayern Munich"
 *   "FC Bayern München"
 *   "Bayern"
 *
 * Returns null when no match — callers should render a fallback.
 */
export function getTeamLogoUrl(teamName) {
  if (!teamName) return null
  // Direct match first — cheapest path.
  if (TEAM_LOGOS[teamName]) return TEAM_LOGOS[teamName]
  // Substring fallback (case-insensitive).
  const lc = String(teamName).toLowerCase()
  for (const [key, url] of Object.entries(TEAM_LOGOS)) {
    if (lc.includes(key.toLowerCase()) || key.toLowerCase().includes(lc)) {
      return url
    }
  }
  return null
}
