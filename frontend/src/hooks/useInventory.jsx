import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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
      // codes to user-facing messages.
      const status = err?.status || err?.code
      const message = err?.message || (status === 402 ? 'Not enough brezn'
                                     : status === 409 ? 'Already owned'
                                     : 'Purchase failed')
      const e = new Error(message)
      e.code = status === 402 ? 'insufficient'
            : status === 409 ? 'owned'
            : 'failed'
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
