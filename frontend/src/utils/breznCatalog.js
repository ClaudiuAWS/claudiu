/**
 * Brezn economy — earning rules + spending catalog, kept in one place
 * so the design intent stays legible and the UI hints stay accurate.
 *
 * EARNING rules must mirror backend/shared/credits.py constants. If the
 * backend numbers change, update both sides in the same commit.
 *
 * SPENDING items are the strategic sinks that keep the economy healthy.
 * `status: 'live'` items are wired end-to-end; `status: 'soon'` items
 * are listed in the UI as roadmap but not purchasable yet. Adding a new
 * item is two-step: ship the backend debit + grant path, then flip its
 * status here.
 */

// ─── Earning hints (display-only — backend is source of truth) ─────────

export const EARNING_HINTS = [
  {
    id:    'per-event',
    title: 'Score in-match',
    detail: 'Every positive fantasy point = +2 brezn. A striker goal (+4 pts) earns +8 brezn.',
    icon:  '⚽',
  },
  {
    id:    'win-bonus',
    title: 'Win the match',
    detail: 'Winner bonus scales with your fantasy-pts lead over the runner-up. Base +50, +5 per point ahead, capped at +300.',
    icon:  '🏆',
  },
  {
    id:    'participation',
    title: 'Just play',
    detail: '+50 brezn for finishing a match, win or lose. Every match counts.',
    icon:  '🎮',
  },
  {
    id:    'clean-sheet',
    title: 'Clean sheet',
    detail: '+100 brezn when your drafted keeper finishes with zero goals conceded.',
    icon:  '🧤',
  },
  {
    id:    'captain-delivered',
    title: 'Captain delivers',
    detail: '+75 brezn when your captain pick contributes positive fantasy points.',
    icon:  '🅒',
  },
  {
    id:    'daily',
    title: 'Daily kick-off',
    detail: '+50 brezn for your first finished match each day. Habit loop.',
    icon:  '📅',
  },
  {
    id:    'badge-earn',
    title: 'Unlock badges',
    detail: 'Earning a badge in-match pays bronze +100 / silver +300 / gold +750. Buying the badge from the shop costs more than earning it.',
    icon:  '🏅',
  },
  {
    id:    'invite-friend',
    title: 'Bring a friend',
    detail: 'Both you and your friend get +100 brezn the first time a friend invite is accepted.',
    icon:  '🤝',
  },
  {
    id:    'minigame',
    title: 'Win mini-games',
    detail: 'Halftime quiz, offside reflex, shot-call, penalty shootout — every positive minigame point pays at the same rate as match scoring.',
    icon:  '🎯',
  },
]

// ─── Spending catalog ──────────────────────────────────────────────────

// Tier prices for buying badges retail — kept in sync with the existing
// TIER_PRICES in utils/badges.js. Listed here so the shop can group it
// alongside cosmetics + perks in one place.
export const SPEND_CATALOG = {
  // Pay to claim a badge you didn't earn through play. The legacy
  // TIER_PRICES path on BadgesPage is informational only; the actual
  // purchase flow that funnels through useInventory.purchase() is
  // wired item-by-item in subsequent commits.
  badges: {
    title:   'Badges',
    summary: "Skip the grind — buy a badge you didn't earn.",
    items:   [
      { id: 'badge-bronze', label: 'Any bronze badge', cost: 200,  status: 'soon' },
      { id: 'badge-silver', label: 'Any silver badge', cost: 500,  status: 'soon' },
      { id: 'badge-gold',   label: 'Any gold badge',   cost: 1500, status: 'soon' },
    ],
  },

  // Match-specific consumable perks. One-time use per match. Strategic
  // sinks for power users who want an edge on a specific matchday.
  perks: {
    title:   'Match perks',
    summary: 'One-use boosts you can spend before a match starts.',
    items:   [
      {
        id:     'captain-triple',
        label:  'Triple captain',
        cost:   500,
        detail: 'Your captain scores at 3× for this match instead of 2×.',
        status: 'soon',
      },
      {
        id:     'pick-reroll',
        label:  'Pick re-roll',
        cost:   400,
        detail: 'Re-roll one pair in the draft — get a fresh pair of players to choose from.',
        status: 'soon',
      },
      {
        id:     'free-hit',
        label:  'Free hit',
        cost:   800,
        detail: 'Swap one drafted player for any other in their position bucket, just for this match.',
        status: 'soon',
      },
      {
        id:     'reaction-pack',
        label:  'Premium reactions pack',
        cost:   300,
        detail: 'Unlock 6 extra reaction emojis (🎉, 🔥, 👑, 🤡, 🥵, 🥶) for the next match.',
        status: 'soon',
      },
    ],
  },

  // Permanent cosmetic upgrades. Profile/identity sinks — once you buy
  // them they stick. Higher prices than consumables.
  cosmetics: {
    title:   'Cosmetics',
    summary: 'Permanent looks for your profile.',
    items:   [
      {
        id:     'frame-gold',
        label:  'Gold avatar frame',
        cost:   1500,
        detail: 'A glowing gold ring around your profile avatar everywhere in the app.',
        status: 'soon',
      },
      {
        id:     'frame-pretzel',
        label:  'Pretzel avatar frame',
        cost:   2000,
        detail: 'The signature brezn ring — same shape that wraps the captain badge.',
        status: 'soon',
      },
      {
        id:     'name-red',
        label:  'Bundesliga red name',
        cost:   1000,
        detail: 'Your display name shows in Bundesliga red wherever you appear.',
        status: 'live',
      },
      {
        id:     'name-rainbow',
        label:  'Rainbow display name',
        cost:   3000,
        detail: 'Animated gradient name. Loud, but unmistakable.',
        status: 'soon',
      },
    ],
  },

  // Disc unlocks — alternative path to badge-locked tracks for users
  // who don't want to grind the badge.
  discs: {
    title:   'Premium discs',
    summary: 'Unlock badge-locked tracks without earning the badge.',
    items:   [
      {
        id:     'disc-waka-waka',
        label:  'Waka Waka (Shakira)',
        cost:   1500,
        detail: "FIFA 2010 anthem. Normally rewards your first win — this is the shortcut.",
        status: 'soon',
      },
      {
        id:     'disc-we-are-one',
        label:  'We Are One (Pitbull)',
        cost:   2000,
        detail: 'FIFA 2014 anthem. Normally rewards a hat trick.',
        status: 'soon',
      },
      {
        id:     'disc-walk',
        label:  'Walk (Kwabs)',
        cost:   1500,
        detail: 'Normally rewards perfect quiz score.',
        status: 'soon',
      },
    ],
  },
}

// Convenience: flat list of every spendable item with its section, used
// by a future Brezn Shop page to render everything in one scroll.
export function getAllSpendItems() {
  const out = []
  for (const [sectionKey, section] of Object.entries(SPEND_CATALOG)) {
    for (const item of section.items) {
      out.push({ ...item, section: sectionKey, sectionTitle: section.title })
    }
  }
  return out
}
