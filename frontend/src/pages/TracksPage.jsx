import { useNavigate } from 'react-router-dom'
import { useAppAudio } from '../hooks/useAppAudio'
import { useBadges } from '../hooks/useBadges'
import { TRACKS } from '../utils/tracks'
import { getBadgeById } from '../utils/badges'
import DiscArtwork from '../components/ui/DiscArtwork'

/**
 * Tracks library — full list of every disc in the catalog. Unlocked
 * ones are tappable to set as the App-music track; locked ones show
 * the badge required to earn them.
 */
export default function TracksPage() {
  const navigate = useNavigate()
  const { appTrackId, setAppTrack } = useAppAudio()
  const { badges } = useBadges()

  const earnedIds = new Set((badges || []).map(b => b.badgeId))
  const unlocked = (t) => !t.requiredBadge || earnedIds.has(t.requiredBadge)

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-gray-300 text-xs font-semibold tracking-widest uppercase mb-3 flex items-center gap-1"
      >
        ‹ Back
      </button>

      {/* Glossy header bar */}
      <div className="relative overflow-hidden rounded-2xl mb-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
        <div
          className="relative px-5 py-4"
          style={{
            background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
            border: '1px solid rgba(220,38,38,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -12px rgba(220,38,38,0.50)',
          }}
        >
          <h1
            className="text-white font-stadium text-2xl leading-none"
            style={{
              letterSpacing: '0.10em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
            }}
          >
            DISC LIBRARY
          </h1>
          <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
            {TRACKS.filter(unlocked).length} / {TRACKS.length} unlocked
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {TRACKS.map(track => {
          const isUnlocked = unlocked(track)
          const isActive = appTrackId === track.id
          const reqBadge = track.requiredBadge ? getBadgeById(track.requiredBadge) : null

          return (
            <div
              key={track.id}
              className="relative overflow-hidden rounded-2xl"
            >
              {/* Top sheen — only on unlocked rows */}
              {isUnlocked && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              )}
              <div
                className="relative flex items-center gap-3 px-3.5 py-3"
                style={{
                  background: isUnlocked
                    ? (isActive
                      ? 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)'
                      : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)')
                    : 'rgba(255,255,255,0.015)',
                  border: isActive
                    ? '1px solid rgba(220,38,38,0.55)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isActive
                    ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -8px rgba(220,38,38,0.45)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  opacity: isUnlocked ? 1 : 0.55,
                }}
              >
                <DiscArtwork track={track} size={48} locked={!isUnlocked} />

                <div className="flex-1 min-w-0">
                  <p
                    className="text-white text-sm font-semibold truncate"
                    style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
                  >
                    {track.title}
                  </p>
                  <p className="text-gray-500 text-[11px] truncate">
                    {isUnlocked
                      ? track.artist
                      : reqBadge
                        ? `Locked — earn "${reqBadge.title}"`
                        : 'Locked'}
                  </p>
                </div>

                {isUnlocked && (
                  <button
                    type="button"
                    onClick={() => setAppTrack(track.id)}
                    className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                        : 'rgba(255,255,255,0.06)',
                      color: isActive ? '#fff' : '#9ca3af',
                      border: `1px solid ${isActive ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
                      boxShadow: isActive ? '0 4px 12px -4px rgba(220,38,38,0.45)' : 'none',
                      minWidth: 70,
                    }}
                  >
                    {isActive ? 'Playing ✓' : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-gray-600 text-[11px] mt-6 leading-snug text-center">
        Earn the badges that unlock new discs to grow your library.
      </p>
    </div>
  )
}
