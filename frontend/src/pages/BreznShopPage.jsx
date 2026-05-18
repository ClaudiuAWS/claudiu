import { useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SPEND_CATALOG } from '../utils/breznCatalog'
import { getBadgeForShopItem } from '../utils/badges'
import { useCredits } from '../hooks/useCredits'
import { useInventory } from '../hooks/useInventory'
import { useBadges } from '../hooks/useBadges'
import PretzelCoin from '../components/ui/PretzelCoin'
import ItemPreviewModal from '../components/ItemPreviewModal'

const SECTION_ORDER = ['perks', 'cosmetics', 'discs', 'badges']

const SECTION_ICONS = {
  perks:     '⚡',
  cosmetics: '✨',
  discs:     '💿',
  badges:    '🏅',
}

export default function BreznShopPage() {
  const navigate = useNavigate()
  const { balance } = useCredits()
  const { owns } = useInventory()
  const { badges } = useBadges()
  const [previewItem, setPreviewItem] = useState(null)
  const [activeSection, setActiveSection] = useState(null)
  const sectionRefs = useRef({})

  const earnedBadgeIds = useMemo(() => new Set((badges || []).map(b => b.badgeId)), [badges])
  const isBadgeUnlocked = (itemId) => {
    const bid = getBadgeForShopItem(itemId)
    return !!bid && earnedBadgeIds.has(bid)
  }

  const scrollToSection = (key) => {
    setActiveSection(key)
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="px-4 pt-6 pb-12 max-w-md mx-auto">
      <button
        onClick={() => navigate('/profile')}
        className="text-gray-400 hover:text-white text-xs font-semibold tracking-wider uppercase mb-3 flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Glossy header */}
      <div className="relative overflow-hidden rounded-2xl mb-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
        <div
          className="relative px-5 py-4 flex items-center justify-between"
          style={{
            background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
            border: '1px solid rgba(220,38,38,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -12px rgba(220,38,38,0.50)',
          }}
        >
          <div>
            <h1
              className="text-white font-stadium text-2xl leading-none"
              style={{ letterSpacing: '0.10em', textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)' }}
            >
              BREZN SHOP
            </h1>
            <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
              Spend your brezn on perks, cosmetics & more
            </p>
          </div>
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
      </div>

      {/* Category pills */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {SECTION_ORDER.map(key => {
          const section = SPEND_CATALOG[key]
          if (!section) return null
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => scrollToSection(key)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-wider uppercase whitespace-nowrap transition-all active:scale-95 flex-shrink-0"
              style={{
                background: isActive
                  ? 'rgba(220,38,38,0.20)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? '#fca5a5' : '#9ca3af',
              }}
            >
              <span>{SECTION_ICONS[key]}</span>
              <span>{section.title}</span>
            </button>
          )
        })}
      </div>

      {/* Sections */}
      {SECTION_ORDER.map(key => {
        const section = SPEND_CATALOG[key]
        if (!section) return null
        return (
          <section
            key={key}
            ref={el => { sectionRefs.current[key] = el }}
            className="mb-7"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{SECTION_ICONS[key]}</span>
              <h2 className="text-white text-sm font-bold tracking-widest uppercase">{section.title}</h2>
            </div>
            <p className="text-gray-600 text-[11px] mb-3 pl-7">{section.summary}</p>
            <div className="space-y-2">
              {section.items.map(item => (
                <ShopCard
                  key={item.id}
                  item={item}
                  owns={owns}
                  isBadgeUnlocked={isBadgeUnlocked}
                  balance={balance}
                  onTap={() => setPreviewItem(item)}
                />
              ))}
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

// ---------- Shop Card -------------------------------------------------

function ShopCard({ item, owns, isBadgeUnlocked, balance, onTap }) {
  const isOwned = owns(item.id)
  const viaBadge = !isOwned && isBadgeUnlocked(item.id)
  const effectiveOwned = isOwned || viaBadge
  const isLive = item.status === 'live'
  const canAfford = balance >= item.cost

  const stateLabel = isOwned   ? 'Owned'
                   : viaBadge  ? 'Via badge'
                   : !isLive   ? 'Soon'
                   : canAfford ? 'Preview'
                   : 'Need more'

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all active:scale-[0.99] hover:bg-white/[0.02] text-left group"
      style={{
        background: 'linear-gradient(145deg, #111827 0%, #0d1117 100%)',
        border: `1px solid ${effectiveOwned ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: canAfford && isLive && !effectiveOwned
          ? '0 0 20px -8px rgba(220,38,38,0.25)'
          : 'none',
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate group-hover:text-red-100 transition-colors">
          {item.label}
        </p>
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
          background: effectiveOwned
            ? 'rgba(34,197,94,0.20)'
            : !isLive
              ? 'rgba(255,255,255,0.05)'
              : canAfford
                ? 'rgba(220,38,38,0.15)'
                : 'rgba(255,255,255,0.05)',
          border: `1px solid ${effectiveOwned
            ? 'rgba(34,197,94,0.40)'
            : !isLive
              ? 'rgba(255,255,255,0.10)'
              : canAfford
                ? 'rgba(248,113,113,0.40)'
                : 'rgba(255,255,255,0.10)'}`,
          color: effectiveOwned
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
}
