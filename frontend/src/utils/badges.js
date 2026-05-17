/**
 * Badge catalog — display metadata for the frontend.
 * IDs must match backend/shared/badges.py BADGE_CATALOG keys.
 *
 * `tier` drives the visual treatment on BadgesPage (color of the
 * shooting-star accent, plinth highlight).
 * `discReward` is the track id this badge unlocks in `tracks.js`
 * (when set, BadgesPage adds a "disc" marker to the card).
 *
 * Badges without a generated PNG fall through to BadgePlaceholder
 * (tier-coloured glossy circle with the title's first letter).
 */

export const BADGE_CATALOG = [
  // ---- Scoring badges -----------------------------------------------------
  {
    id: 'striker_1',
    title: 'First Strike',
    description: 'A player from your squad scored their first goal.',
    image: '/badge-striker-1.png?v=2',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'hattrick',
    title: 'Hat Trick Hero',
    description: 'Three goals from your squad in a single match.',
    image: '/badge-hattrick.png?v=2',
    tier: 'gold',
    discReward: 'pitbull-we-are-one',
  },
  {
    id: 'golden_boot',
    title: 'Golden Boot',
    description: 'Top scorer across five consecutive matches.',
    image: '/badge-golden-boot.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'goal_machine',
    title: 'Goal Machine',
    description: 'Your squad has scored twenty total goals.',
    image: '/badge-goal-machine.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'playmaker',
    title: 'Playmaker',
    description: 'Goals from five different squad players.',
    image: '/badge-playmaker.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'comeback_goal',
    title: 'Comeback Strike',
    description: 'Squad scored after trailing by two goals.',
    image: '/badge-comeback-goal.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'late_winner',
    title: 'Last-Gasp Hero',
    description: 'Squad scored in the 89th minute or later.',
    image: '/badge-late-winner.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'penalty_king',
    title: 'Spot-Kick King',
    description: 'Score from five penalties total.',
    image: '/badge-penalty-king.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'defender_goal',
    title: "Defender's Dream",
    description: 'A defender from your squad found the net.',
    image: '/badge-defender-goal.png?v=2',
    tier: 'bronze',
    discReward: null,
  },

  // ---- Defensive badges ---------------------------------------------------
  {
    id: 'clean_sheet',
    title: 'Iron Defense',
    description: 'Match ended with zero goals conceded.',
    image: '/badge-clean-sheet.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'clean_sheet_streak',
    title: 'Fortress',
    description: 'Three consecutive clean sheets.',
    image: '/badge-clean-sheet-streak.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'keeper_hero',
    title: 'Keeper Hero',
    description: 'Multiple decisive saves in a single match.',
    image: '/badge-keeper-hero.png?v=2',
    tier: 'silver',
    discReward: null,
  },

  // ---- Win badges ---------------------------------------------------------
  {
    id: 'first_win',
    title: 'Maiden Victory',
    description: 'Won your first match.',
    image: '/badge-first-win.png?v=2',
    tier: 'bronze',
    discReward: 'shakira-waka-waka',
  },
  {
    id: 'comeback_win',
    title: 'Phoenix',
    description: 'Won after trailing at halftime.',
    image: '/badge-comeback-win.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'win_streak_3',
    title: 'Triple Crown',
    description: 'Three consecutive match wins.',
    image: '/badge-win-streak-3.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'win_streak_5',
    title: 'Dynasty',
    description: 'Five consecutive match wins.',
    image: '/badge-win-streak-5.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'derby_winner',
    title: 'Derby Day',
    description: 'Won a derby match.',
    image: '/badge-derby-winner.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'dominant_win',
    title: 'Demolition',
    description: 'Won by a three-goal margin or more.',
    image: '/badge-dominant-win.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'underdog_win',
    title: 'Underdog',
    description: 'Won against a stronger opponent rating.',
    image: '/badge-underdog-win.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'perfect_match',
    title: 'Flawless',
    description: 'Won a match without conceding a single goal.',
    image: '/badge-perfect-match.png?v=2',
    tier: 'gold',
    discReward: null,
  },

  // ---- Mini-game badges ---------------------------------------------------
  {
    id: 'quiz_master',
    title: 'Quiz Master',
    description: 'Perfect score on a Halftime Quiz mini-game.',
    image: '/badge-quiz-master.png?v=2',
    tier: 'silver',
    discReward: 'kwabs-walk',
  },
  {
    id: 'quiz_perfect_5',
    title: 'Mind Champion',
    description: 'Perfect score on five quiz mini-games.',
    image: '/badge-quiz-perfect-5.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'reflex_master',
    title: 'Lightning Reflex',
    description: 'Top tier on a Reflex mini-game.',
    image: '/badge-reflex-master.png?v=2',
    tier: 'gold',
    discReward: null,
  },

  // ---- Progression badges -------------------------------------------------
  {
    id: 'first_match',
    title: 'First Kick-Off',
    description: 'Played your very first match.',
    image: '/badge-first-match.png?v=2',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'team_builder',
    title: 'Team Builder',
    description: 'Drafted your first full squad.',
    image: '/badge-team-builder.png?v=2',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'weekend_warrior',
    title: 'Weekend Warrior',
    description: 'Played a Saturday or Sunday match.',
    image: '/badge-weekend-warrior.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'veteran_10',
    title: 'Veteran X',
    description: 'Played ten matches.',
    image: '/badge-veteran-10.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'veteran_50',
    title: 'Living Legend',
    description: 'Played fifty matches.',
    image: '/badge-veteran-50.png?v=2',
    tier: 'gold',
    discReward: null,
  },
  {
    id: 'centurion',
    title: 'Centurion',
    description: 'Played one hundred matches.',
    image: '/badge-centurion.png?v=2',
    tier: 'gold',
    discReward: null,
  },

  // ---- Social badges ------------------------------------------------------
  {
    id: 'social_butterfly',
    title: 'Connected',
    description: 'Added three friends to your network.',
    image: '/badge-social-butterfly.png?v=2',
    tier: 'bronze',
    discReward: null,
  },

  // ---- Cumulative counter badges ----
  {
    id: 'striker_5',
    title: 'Sharp Shooter',
    description: 'Your squad scored 5 goals total.',
    image: '/badge-striker-5.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'goalkeeper_1',
    title: 'Safe Hands',
    description: 'Your goalkeeper made their first save.',
    image: '/badge-goalkeeper-1.png?v=2',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'goalkeeper_5',
    title: 'The Wall',
    description: 'Your goalkeeper made 5 saves.',
    image: '/badge-goalkeeper-5.png?v=2',
    tier: 'silver',
    discReward: null,
  },
  {
    id: 'penalty_1',
    title: 'From the Spot',
    description: 'Your squad scored their first penalty.',
    image: '/badge-penalty-1.png?v=2',
    tier: 'bronze',
    discReward: null,
  },
  {
    id: 'penalty_5',
    title: 'Penalty Expert',
    description: 'Your squad scored 5 penalties.',
    image: '/badge-penalty-5.png?v=2',
    tier: 'silver',
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

// In-game currency price to purchase a badge of the given tier. Tied
// to the credit earn-rate in `backend/event-processor/service.py`
// (positive fantasy delta × 2). A bronze badge ≈ 10 goals of scoring;
// gold ≈ 75 goals. Earning the badge in-match is always free; this is
// the alternative path for users who want to grind credits instead.
// Retail prices for buying a badge of the given tier. Kept in sync
// with the BreznShop catalog (utils/breznCatalog.js → SPEND_CATALOG.badges)
// AND the backend earn payouts in shared/credits.py (BADGE_EARN_PAYOUT):
// earn payouts are ~50% of retail so earning is always cheaper than
// buying. Bumped in the thirtieth pass economy rebalance.
export const TIER_PRICES = {
  bronze: 300,
  silver: 800,
  gold:   2000,
}

export function getBadgePrice(badge) {
  if (!badge) return 0
  return TIER_PRICES[badge.tier] ?? 0
}
