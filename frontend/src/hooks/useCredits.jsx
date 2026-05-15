import { useCallback, useEffect, useRef, useState } from 'react'
import { creditsApi } from '../services/api'

/**
 * useCredits — fetches the current user's wallet balance.
 *
 * Polled lightly (refetch on window focus + on a 30s interval) since the
 * event-processor writes new credits whenever a scoring event lands during
 * a live match. There's no WS channel for credit deltas yet — keep it
 * polling-only until volume warrants the channel.
 *
 * Returns `{ balance, totalEarned, totalSpent, loading, refresh }`.
 */
export function useCredits() {
  const [state, setState] = useState({ balance: 0, totalEarned: 0, totalSpent: 0, loading: true })
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const data = await creditsApi.balance()
      if (!mounted.current) return
      setState({
        balance:     Number(data.balance     ?? 0),
        totalEarned: Number(data.totalEarned ?? 0),
        totalSpent:  Number(data.totalSpent  ?? 0),
        loading:     false,
      })
    } catch {
      if (!mounted.current) return
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const onFocus = () => refresh()
    const interval = setInterval(refresh, 30_000)
    window.addEventListener('focus', onFocus)
    return () => {
      mounted.current = false
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return { ...state, refresh }
}

/**
 * useFriendCredits — friend leaderboard sorted by balance desc. Lighter
 * polling (every minute) since this is a passive widget on the friends page.
 */
export function useFriendCredits() {
  const [state, setState] = useState({ me: null, friends: [], loading: true })
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const data = await creditsApi.friends()
      if (!mounted.current) return
      setState({
        me:      data.me || null,
        friends: Array.isArray(data.friends) ? data.friends : [],
        loading: false,
      })
    } catch {
      if (!mounted.current) return
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const onFocus = () => refresh()
    const interval = setInterval(refresh, 60_000)
    window.addEventListener('focus', onFocus)
    return () => {
      mounted.current = false
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return { ...state, refresh }
}
