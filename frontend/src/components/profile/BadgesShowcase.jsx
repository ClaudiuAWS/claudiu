import { useNavigate } from 'react-router-dom'
import { useBadges } from '../../hooks/useBadges'
import { BADGE_CATALOG, TIER_COLORS } from '../../utils/badges'

const MAX_VISIBLE = 6

/**
 * Profile "Crests" strip — earned badges as identity, not as a checklist.
 *
 * Shows up to 6 of the user's earned crests in a horizontal scroller.
 * If they have more than 6, a "+N more →" tile bounces to the full
 * BadgesPage. Empty state nudges them toward playing matches.
 *
 * Renders inline on ProfilePage between the identity card and the wallet
 * — trophies right after "who you are", before "what you own".
 *
 * Visual treatment mirrors BadgesPage:
 *   - mix-blend-mode: screen drops the dark frame baked into the AI
 *     artwork so only the crest icon floats on the dark profile bg
 *   - tier-coloured outer ring + drop-shadow glow gives each crest
 *     the trophy-case feel
 */
export default function BadgesShowcase() {
  const navigate = useNavigate()
  const { badges, loading } = useBadges()

  if (loading) return null

  const earnedIds = new Set((badges || []).map(b => b.badgeId))
  // Preserve catalog order — the catalog is grouped (scoring, defense,
  // win, mini-game, progression, social) so the user's collection reads
  // as a coherent thematic arc rather than chronological earn-order.
  const earned = BADGE_CATALOG.filter(b => earnedIds.has(b.id))

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">
          Crests
        </p>
        <button
          type="button"
          onClick={() => navigate('/badges')}
          className="text-[10px] font-bold tracking-widest uppercase text-gray-500 hover:text-gray-300 transition-colors"
        >
          View all →
        </button>
      </div>

      {earned.length === 0 ? (
        <div
          className="rounded-2xl px-5 py-6 text-center"
          style={{
            background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p className="text-gray-500 text-xs leading-snug">
            Play matches to earn your first crest.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl px-3 py-3"
          style={{
            background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex gap-2.5 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            {earned.slice(0, MAX_VISIBLE).map(badge => (
              <CrestTile key={badge.id} badge={badge} />
            ))}
            {earned.length > MAX_VISIBLE && (
              <button
                type="button"
                onClick={() => navigate('/badges')}
                className="flex-shrink-0 w-16 flex flex-col items-center justify-center rounded-xl gap-1"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px dashed rgba(255,255,255,0.15)',
                  height: 76,
                }}
              >
                <span className="text-gray-300 text-base font-bold leading-none tabular-nums">
                  +{earned.length - MAX_VISIBLE}
                </span>
                <span className="text-gray-500 text-[9px] font-bold tracking-widest uppercase">
                  More
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CrestTile({ badge }) {
  const tierColor = TIER_COLORS[badge.tier] || TIER_COLORS.bronze
  return (
    <div
      className="flex-shrink-0 w-16 flex flex-col items-center"
      title={badge.title}
    >
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center"
        style={{
          background: 'radial-gradient(circle at 50% 30%, #1a1216 0%, #0a0606 100%)',
          border: `1px solid ${tierColor}55`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 12px -4px ${tierColor}66`,
        }}
      >
        <img
          src={badge.image}
          alt={badge.title}
          className="w-12 h-12 object-contain"
          style={{
            mixBlendMode: 'screen',
            filter: `brightness(1.15) contrast(1.05) drop-shadow(0 0 6px ${tierColor}88)`,
          }}
        />
      </div>
      <p
        className="text-white text-[9px] font-semibold leading-tight mt-1 text-center truncate w-full"
        style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
      >
        {badge.title}
      </p>
    </div>
  )
}
