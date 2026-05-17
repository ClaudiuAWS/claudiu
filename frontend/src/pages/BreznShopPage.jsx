import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { SPEND_CATALOG } from '../utils/breznCatalog'
import { useCredits } from '../hooks/useCredits'
import { useInventory } from '../hooks/useInventory'
import PretzelCoin from '../components/ui/PretzelCoin'

/**
 * BreznShop — single page listing every spend item across all four
 * sections (badges, perks, cosmetics, discs). Each item is owned-aware
 * via useInventory so the same SKU shows "Owned" or "Buy" or "Soon"
 * (status from the catalog).
 *
 * Item purchase flow:
 *   tap Buy → purchase(itemId) via useInventory →
 *   ok 200       → success toast, inventory + balance auto-refresh
 *   402 insuf    → "Not enough brezn — earn more in your next match"
 *   409 owned    → "You already own this"
 *
 * Items with `status: 'soon'` show the "Coming soon" disabled state.
 */

const SECTION_ORDER = ['perks', 'cosmetics', 'discs', 'badges']

export default function BreznShopPage() {
  const navigate = useNavigate()
  const { balance, refresh: refreshBalance } = useCredits()
  const { owns, purchase, loading } = useInventory()
  const [pending, setPending] = useState(null) // itemId in flight

  const handleBuy = async (item) => {
    if (item.status !== 'live') return
    if (owns(item.id)) { toast('Already owned'); return }
    if (balance < item.cost) {
      toast.error(`Need ${item.cost - balance} more brezn`)
      return
    }
    setPending(item.id)
    try {
      await purchase(item.id)
      toast.success(`Purchased ${item.label}`)
      refreshBalance()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPending(null)
    }
  }

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
        Spend your brezn on match perks, cosmetics, premium discs, and badge buyouts.
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
                const isOwned   = owns(item.id)
                const isLive    = item.status === 'live'
                const isPending = pending === item.id
                const canAfford = balance >= item.cost
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{
                      background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
                      border:    `1px solid ${isOwned ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{item.label}</p>
                      {item.detail && (
                        <p className="text-gray-500 text-[11px] mt-0.5 leading-snug">{item.detail}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <PretzelCoin size={12} color="#fcd34d" />
                      <span className="text-amber-200 font-bold tabular-nums text-sm">{item.cost}</span>
                    </div>

                    <button
                      onClick={() => handleBuy(item)}
                      disabled={!isLive || isOwned || isPending || loading}
                      className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full flex-shrink-0 transition-all active:scale-95"
                      style={{
                        background: isOwned
                          ? 'rgba(34,197,94,0.20)'
                          : !isLive
                            ? 'rgba(255,255,255,0.05)'
                            : canAfford
                              ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                              : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isOwned
                          ? 'rgba(34,197,94,0.40)'
                          : !isLive
                            ? 'rgba(255,255,255,0.10)'
                            : canAfford
                              ? 'rgba(248,113,113,0.55)'
                              : 'rgba(255,255,255,0.10)'}`,
                        color: isOwned
                          ? '#86efac'
                          : !isLive
                            ? '#6b7280'
                            : canAfford
                              ? '#ffffff'
                              : '#6b7280',
                        cursor: (!isLive || isOwned || isPending) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isPending ? '…' : isOwned ? 'Owned' : !isLive ? 'Soon' : canAfford ? 'Buy' : 'Need more'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
