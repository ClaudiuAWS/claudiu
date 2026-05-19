import { useEffect, useState } from 'react'

/**
 * NewVersionBanner — polls /version.json and prompts a reload when the
 * server's buildId differs from the one baked into THIS bundle.
 *
 * Why this exists:
 *   Android Chrome (notably on the Samsung S24 used as a test device)
 *   aggressively keeps the running tab's JS in memory across deploys.
 *   index.html has `Cache-Control: no-cache` and CloudFront invalidates
 *   on every deploy, but a tab that was opened BEFORE the deploy and
 *   never navigated away just keeps executing the old bundle. Result:
 *   backend-only fixes appear (the still-cached JS calls the new APIs)
 *   while frontend-only fixes don't. This component closes that gap by
 *   detecting the version mismatch at runtime and offering a one-tap
 *   refresh.
 *
 * Mechanism:
 *   - Vite's `define` injects __BUILD_ID__ (a build-time Date.now()
 *     string) into the bundle.
 *   - The same Vite run emits dist/version.json with the same id.
 *   - Every POLL_MS we fetch /version.json (no-store) and compare.
 *   - On mismatch, render a fixed-position banner with a Refresh button.
 *
 * The banner is non-blocking — it sits above the bottom nav and the
 * user can ignore it and keep playing. Tapping Refresh fires
 * window.location.reload(), which forces Chrome to re-fetch index.html
 * (whose Cache-Control: no-cache then guarantees a fresh JS bundle).
 */

const POLL_MS = 60_000

export default function NewVersionBanner() {
  const [latest, setLatest] = useState(null)

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const r = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const v = await r.json()
        if (!mounted) return
        // eslint-disable-next-line no-undef
        if (v.buildId && v.buildId !== __BUILD_ID__) setLatest(v.buildId)
      } catch {
        // offline / transient — try again next tick
      }
    }
    check()
    const id = setInterval(check, POLL_MS)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  if (!latest) return null

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[70] px-4 pointer-events-none">
      <div
        className="max-w-md mx-auto rounded-2xl p-3 pointer-events-auto shadow-2xl flex items-center gap-3"
        style={{
          background: 'linear-gradient(145deg, #1a2438 0%, #0d1117 100%)',
          border: '1px solid rgba(34,197,94,0.35)',
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">New version available</p>
          <p className="text-gray-400 text-xs leading-tight mt-0.5">
            Tap refresh to load the latest fixes.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors
            bg-green-500 hover:bg-green-400 active:bg-green-600 text-white"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
