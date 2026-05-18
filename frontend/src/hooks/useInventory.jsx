import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { creditsApi } from '../services/api'

/**
 * useInventory — single source of truth for "what does this user own?".
 *
 * Mounted via <InventoryProvider> inside the post-auth Layout so every
 * consumer (BreznShop, frame renderer, name renderer, ReactionsButton,
 * TracksPage, etc.) reads the same map and one purchase auto-refreshes
 * every consumer.
 *
 * API:
 *   const { inventory, owns, loading, refresh, purchase } = useInventory()
 *
 *   owns(itemId)          → boolean
 *   purchase(itemId)      → Promise<{ ok, balance }>; on 402 the throw
 *                           carries `code: 'insufficient'` for UI hints
 */

const InventoryContext = createContext(null)

export function InventoryProvider({ children }) {
  const [inventory, setInventory] = useState({})
  const [loading, setLoading]     = useState(true)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const data = await creditsApi.inventory()
      if (!mountedRef.current) return
      setInventory(data?.inventory || {})
    } catch {
      // 404 from API Gateway = endpoint not deployed yet (pre-merge).
      // Treat as empty inventory so the rest of the UI doesn't crash.
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  const owns = useCallback((itemId) => {
    return !!(inventory && inventory[itemId])
  }, [inventory])

  const purchase = useCallback(async (itemId) => {
    try {
      const result = await creditsApi.purchase(itemId)
      // Optimistic-update the inventory map so cosmetic consumers
      // re-render immediately (don't wait for the next refresh tick).
      setInventory(prev => ({
        ...prev,
        [itemId]: { acquiredAt: new Date().toISOString() },
      }))
      // Also refresh in the background to pick up any server-side fields
      // (acquiredAt timestamp, etc.).
      refresh()
      return result
    } catch (err) {
      // Re-throw with a normalized shape so the shop UI can map status
      // codes to user-facing messages. Also toast so the user gets
      // immediate feedback — the modal's catch is intentionally empty
      // (keeps the modal open for retry) and this is the only signal.
      const status = err?.status || err?.code
      const rawMessage = err?.message || ''
      // Disambiguate the most common API responses by message content
      // since the fetch wrapper doesn't expose status codes directly.
      const m = String(rawMessage).toLowerCase()
      const isInsufficient = m.includes('insufficient') || status === 402
      const isOwned        = m.includes('already owned') || status === 409
      const friendly = isInsufficient ? 'Not enough brezn'
                     : isOwned        ? 'Already owned'
                     : rawMessage     || 'Purchase failed'
      toast.error(friendly)
      const e = new Error(friendly)
      e.code = isInsufficient ? 'insufficient'
            :  isOwned        ? 'owned'
            :  'failed'
      throw e
    }
  }, [refresh])

  return (
    <InventoryContext.Provider value={{ inventory, owns, loading, refresh, purchase }}>
      {children}
    </InventoryContext.Provider>
  )
}

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) {
    // Fallback for components rendered outside the provider (auth pages
    // for example). Always returns "owns nothing".
    return {
      inventory: {},
      owns:      () => false,
      loading:   false,
      refresh:   () => Promise.resolve(),
      purchase:  () => Promise.reject(new Error('Not in provider')),
    }
  }
  return ctx
}
