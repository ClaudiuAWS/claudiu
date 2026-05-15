import { useState, useEffect, useCallback } from 'react'
import { badgesApi } from '../services/api'

/**
 * Fetches the user's earned badges from the backend on mount.
 * Also exposes an `addBadge` callback for the WS listener to
 * append a newly-earned badge without refetching.
 */
export function useBadges() {
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    badgesApi.list()
      .then(data => { if (!cancelled) setBadges(data.badges || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const addBadge = useCallback((badge) => {
    setBadges(prev => {
      if (prev.some(b => b.badgeId === badge.badgeId)) return prev
      return [badge, ...prev]
    })
  }, [])

  const hasBadge = useCallback((badgeId) => {
    return badges.some(b => b.badgeId === badgeId)
  }, [badges])

  return { badges, loading, addBadge, hasBadge }
}
