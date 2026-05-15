/**
 * Badge catalog — display metadata for the frontend.
 * IDs must match backend/shared/badges.py BADGE_CATALOG keys.
 */

export const BADGE_CATALOG = [
  {
    id: 'striker_1',
    title: 'First Strike',
    description: 'A player from your squad scored their first goal.',
    image: '/badge-striker-1.png',
    tier: 'bronze',
  },
]

export function getBadgeById(id) {
  return BADGE_CATALOG.find(b => b.id === id)
}
