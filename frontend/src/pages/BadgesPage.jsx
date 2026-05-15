import { useBadges } from '../hooks/useBadges'
import { BADGE_CATALOG } from '../utils/badges'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function BadgesPage() {
  const { badges, loading } = useBadges()

  if (loading) return <LoadingSpinner />

  const earnedIds = new Set(badges.map(b => b.badgeId))

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <h1 className="text-white text-2xl font-bold tracking-tight mb-1">Badges</h1>
      <p className="text-gray-500 text-sm mb-6">
        {earnedIds.size} / {BADGE_CATALOG.length} earned
      </p>

      <div className="grid grid-cols-2 gap-3">
        {BADGE_CATALOG.map(badge => {
          const earned = earnedIds.has(badge.id)
          const earnedData = badges.find(b => b.badgeId === badge.id)
          return (
            <div
              key={badge.id}
              className="rounded-2xl p-4 flex flex-col items-center text-center transition-all"
              style={{
                background: earned
                  ? 'linear-gradient(145deg, #1a2438 0%, #0d1117 100%)'
                  : 'rgba(255,255,255,0.02)',
                border: earned
                  ? '1px solid rgba(234,179,8,0.30)'
                  : '1px solid rgba(255,255,255,0.06)',
                opacity: earned ? 1 : 0.4,
              }}
            >
              <img
                src={badge.image}
                alt={badge.title}
                className="w-16 h-16 rounded-xl object-contain mb-3"
                style={{
                  filter: earned ? 'none' : 'grayscale(1)',
                  border: earned ? '2px solid rgba(234,179,8,0.4)' : '2px solid rgba(255,255,255,0.1)',
                }}
              />
              <p className={`text-sm font-semibold leading-tight ${earned ? 'text-white' : 'text-gray-500'}`}>
                {badge.title}
              </p>
              <p className="text-gray-500 text-[11px] mt-1 leading-snug">
                {badge.description}
              </p>
              {earned && earnedData?.earnedAt && (
                <p className="text-yellow-500/70 text-[10px] mt-2 font-medium">
                  ✓ Earned {new Date(earnedData.earnedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {earnedIds.size === 0 && (
        <p className="text-center text-gray-600 text-sm mt-8">
          Play matches to earn badges!
        </p>
      )}
    </div>
  )
}
