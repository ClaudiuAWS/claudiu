/**
 * Known-match registry — backfills team-name fields when the backend
 * returns a match record with empty/null homeTeamName / awayTeamName
 * (e.g. the deployed env has stale data because the loader was run
 * with old constants or never re-run).
 *
 * Keyed by matchId. Frontend safety net so the demo is never broken
 * by data-plumbing issues. The values mirror the loader's constants
 * in `data/loader/constants.py` — keep these in sync if the loader's
 * source-of-truth changes.
 */

export const KNOWN_MATCHES = {
  'DFL-MAT-111111': {
    homeTeamName: 'Bayern Munich',
    awayTeamName: 'Hamburger SV',
  },
}

/**
 * Merge any known-match defaults into the backend's match record,
 * preferring backend values when present. Falsy backend values
 * (`''`, `null`, `undefined`) fall through to the registry.
 */
export function withDefaults(match) {
  if (!match || !match.matchId) return match
  const defaults = KNOWN_MATCHES[match.matchId]
  if (!defaults) return match
  return {
    ...match,
    homeTeamName: match.homeTeamName || defaults.homeTeamName,
    awayTeamName: match.awayTeamName || defaults.awayTeamName,
  }
}
