import { useState, useEffect, useCallback } from 'react'
import { badgesApi } from '../services/api'

/**
 * Fetches the user's earned badges from the backend on mount.
 * Also exposes an `addBadge` callback for the WS listener to
 * append a newly-earned badge without refetching, and a `refresh`
 * for callers (e.g. the buy-badge flow) that want to re-pull from the
 * server after a known state change.
 */
export function useBadges() {
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await badgesApi.list()
      setBadges(data?.badges || [])
    } catch {
      // 401 / network — keep prior list, surface elsewhere if needed.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addBadge = useCallback((badge) => {
    setBadges(prev => {
      if (prev.some(b => b.badgeId === badge.badgeId)) return prev
      return [badge, ...prev]
    })
  }, [])

  const hasBadge = useCallback((badgeId) => {
    return badges.some(b => b.badgeId === badgeId)
  }, [badges])

  return { badges, loading, addBadge, hasBadge, refresh }
}
