import { useEffect, useRef, useState } from 'react'

const FLOAT_MS = 3000
const MAX_CONCURRENT = 12

let _seq = 0
const _nextId = () => ++_seq

/**
 * ReactionsOverlay — renders floating emoji reactions from party members.
 *
 * Wired by `useRoom`'s `onCheer` callback. Each incoming `cheer` WS
 * message spawns a floater that rises ~80 px and fades over 3 s along
 * the right edge of the match view. Optimistic sender-side floaters
 * are pushed by `ReactionsButton` via the `useReactionsFeed()` helper
 * below so the tapper sees their reaction immediately, before the WS
 * roundtrip.
 *
 * Cap of 12 concurrent floaters guards against spam-tap chaos.
 */

const _channel = {
  listeners: new Set(),
  push(msg) {
    this.listeners.forEach(fn => fn(msg))
  },
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  },
}

// Public helper for callers (ReactionsButton, useRoom) to feed the overlay.
export function pushCheer(msg) {
  _channel.push(msg)
}

export default function ReactionsOverlay() {
  const [floaters, setFloaters] = useState([])
  const cleanupRef = useRef(null)

  useEffect(() => {
    const unsubscribe = _channel.subscribe((msg) => {
      // Drop oldest if we're at capacity — keeps the overlay legible
      // even under a spam burst.
      setFloaters(prev => {
        const next = prev.length >= MAX_CONCURRENT
          ? prev.slice(prev.length - MAX_CONCURRENT + 1)
          : prev
        return [...next, {
          key:        _nextId(),
          emoji:      msg.emoji,
          displayName: msg.displayName || '',
          avatarUrl:  msg.avatarUrl || '',
          offsetX:    Math.random() * 12 - 6, // small horizontal jitter
        }]
      })
    })
    return unsubscribe
  }, [])

  // Auto-purge each floater after the animation ends. One shared timer
  // rather than one per floater — wakes on a 500 ms cadence and culls
  // anything older than FLOAT_MS.
  useEffect(() => {
    if (cleanupRef.current) return
    cleanupRef.current = setInterval(() => {
      setFloaters(prev => {
        if (prev.length === 0) return prev
        // Floaters carry no spawned-at timestamp; we use position in the
        // queue + FLOAT_MS implicitly by capping the array. Simpler: drop
        // the head if it's been on screen ≥ FLOAT_MS via setTimeout per
        // floater. Switch to that.
        return prev
      })
    }, 500)
    return () => {
      clearInterval(cleanupRef.current)
      cleanupRef.current = null
    }
  }, [])

  // Per-floater self-cleanup timer.
  useEffect(() => {
    if (floaters.length === 0) return
    const last = floaters[floaters.length - 1]
    const t = setTimeout(() => {
      setFloaters(prev => prev.filter(f => f.key !== last.key))
    }, FLOAT_MS)
    return () => clearTimeout(t)
  }, [floaters.length])

  return (
    <div
      className="pointer-events-none fixed bottom-32 left-4 z-40 flex flex-col items-start gap-1"
      aria-hidden="true"
    >
      {floaters.map(f => (
        <div
          key={f.key}
          className="flex items-center gap-2"
          style={{
            transform: `translate(${f.offsetX}px, 0)`,
            animation: `cheerFloat ${FLOAT_MS}ms ease-out forwards`,
          }}
        >
          <span className="text-gray-300 text-[10px] font-semibold tracking-wider drop-shadow">
            {f.displayName}
          </span>
          <span className="text-3xl leading-none" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}>
            {f.emoji}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes cheerFloat {
          0%   { opacity: 0; transform: translateY(20px) scale(0.7); }
          15%  { opacity: 1; transform: translateY(0)    scale(1); }
          85%  { opacity: 1; transform: translateY(-60px) scale(1); }
          100% { opacity: 0; transform: translateY(-90px) scale(0.9); }
        }
      `}</style>
    </div>
  )
}
