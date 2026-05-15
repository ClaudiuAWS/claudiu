/**
 * Badge catalog — display metadata for the frontend.
 * IDs must match backend/shared/badges.py BADGE_CATALOG keys.
 *
 * `tier` drives the visual treatment on BadgesPage (color of the
 * shooting-star accent, plinth highlight).
 * `discReward` is the track id this badge unlocks in `tracks.js`
 * (when set, BadgesPage adds a "disc" marker to the card).
 */

export const BADGE_CATALOG = [
  {
    id: 'striker_1',
    title: 'First Strike',
    description: 'A player from your squad scored their first goal.',
    image: '/badge-striker-1.png',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'hattrick',
    title: 'Hat Trick Hero',
    description: 'Three goals from your squad in a single match.',
    image: '/badge-hattrick.png',
    tier: 'gold',
    discReward: 'pitbull-we-are-one',
  },
  {
    id: 'clean_sheet',
    title: 'Iron Defense',
    description: 'Match ended with zero goals conceded.',
    image: '/badge-clean-sheet.png',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'quiz_master',
    title: 'Quiz Master',
    description: 'Perfect score on a Halftime Quiz mini-game.',
    image: '/badge-quiz-master.png',
    tier: 'silver',
    discReward: 'kwabs-walk',
  },
  {
    id: 'first_win',
    title: 'Maiden Victory',
    description: 'Won your first match.',
    image: '/badge-first-win.png',
    tier: 'bronze',
    discReward: 'shakira-waka-waka',
  },
  {
    id: 'veteran_10',
    title: 'Veteran X',
    description: 'Played ten matches.',
    image: '/badge-veteran-10.png',
    tier: 'gold',
    discReward: null,
  },
]

export function getBadgeById(id) {
  return BADGE_CATALOG.find(b => b.id === id)
}

export const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold:   '#ffd700',
}
