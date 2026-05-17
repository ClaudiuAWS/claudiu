import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SPEND_CATALOG } from '../utils/breznCatalog'
import { useCredits } from '../hooks/useCredits'
import { useInventory } from '../hooks/useInventory'
import PretzelCoin from '../components/ui/PretzelCoin'
import ItemPreviewModal from '../components/ItemPreviewModal'

/**
 * BreznShop — single page listing every spend item across all four
 * sections (badges, perks, cosmetics, discs). Tapping a card opens
 * the <ItemPreviewModal> which renders the item-specific preview AND
 * the Buy CTA. This way every purchase is preceded by an explicit
 * "here's exactly what you'll get" moment.
 *
 * Items with `status: 'soon'` still show as cards but the modal's
 * Buy button is disabled with "Coming soon".
 */

const SECTION_ORDER = ['perks', 'cosmetics', 'discs', 'badges']

export default function BreznShopPage() {
  const navigate = useNavigate()
  const { balance } = useCredits()
  const { owns } = useInventory()
  const [previewItem, setPreviewItem] = useState(null)

  return (
    <div className="px-4 pt-6 pb-12 max-w-md mx-auto">
      <button
        onClick={() => navigate('/profile')}
        className="text-gray-400 hover:text-white text-xs font-semibold tracking-wider uppercase mb-3 flex items-center gap-1"
      >
        ← Back
      </button>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-2xl font-bold tracking-tight">Brezn Shop</h1>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: 'linear-gradient(135deg, rgba(252,211,77,0.18) 0%, rgba(217,119,6,0.10) 100%)',
            border: '1px solid rgba(252,211,77,0.40)',
          }}
        >
          <PretzelCoin size={14} color="#fcd34d" />
          <span className="text-amber-200 font-black tabular-nums text-base">{balance}</span>
        </div>
      </div>

      <p className="text-gray-500 text-xs mb-6">
        Tap any item to preview exactly what you'll get before buying.
      </p>

      {SECTION_ORDER.map(key => {
        const section = SPEND_CATALOG[key]
        if (!section) return null
        return (
          <section key={key} className="mb-6">
            <h2 className="text-white text-sm font-bold tracking-widest uppercase mb-1">{section.title}</h2>
            <p className="text-gray-600 text-[11px] mb-3">{section.summary}</p>
            <div className="space-y-2">
              {section.items.map(item => {
                const isOwned = owns(item.id)
                const isLive  = item.status === 'live'
                const canAfford = balance >= item.cost
                const stateLabel = isOwned ? 'Owned'
                                 : !isLive ? 'Soon'
                                 : canAfford ? 'Preview'
                                 : 'Need more'
                return (
                  <button
                    key={item.id}
                    onClick={() => setPreviewItem(item)}
                    className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 transition-all active:scale-[0.99] hover:bg-white/[0.02] text-left"
                    style={{
                      background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
                      border:    `1px solid ${isOwned ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{item.label}</p>
                      {item.detail && (
                        <p className="text-gray-500 text-[11px] mt-0.5 leading-snug line-clamp-2">{item.detail}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <PretzelCoin size={12} color="#fcd34d" />
                      <span className="text-amber-200 font-bold tabular-nums text-sm">{item.cost}</span>
                    </div>

                    <span
                      className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: isOwned
                          ? 'rgba(34,197,94,0.20)'
                          : !isLive
                            ? 'rgba(255,255,255,0.05)'
                            : canAfford
                              ? 'rgba(248,113,113,0.18)'
                              : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isOwned
                          ? 'rgba(34,197,94,0.40)'
                          : !isLive
                            ? 'rgba(255,255,255,0.10)'
                            : canAfford
                              ? 'rgba(248,113,113,0.40)'
                              : 'rgba(255,255,255,0.10)'}`,
                        color: isOwned
                          ? '#86efac'
                          : !isLive
                            ? '#6b7280'
                            : canAfford
                              ? '#fca5a5'
                              : '#6b7280',
                      }}
                    >
                      {stateLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <ItemPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  )
}
