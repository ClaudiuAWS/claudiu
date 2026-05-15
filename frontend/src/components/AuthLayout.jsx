import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

/**
 * Shared layout for the auth pages (Login + Register + Confirm).
 *
 * Owns a *double-buffered* background video so the loop seam is hidden
 * behind a ~1s cross-fade of two stacked <video> elements. Each
 * element plays naturally from TRIM_START to its own duration; just
 * before the active one ends, the standby starts at TRIM_START and
 * both videos cross-fade (opacity + volume). After the fade, the
 * old-active pauses, rewinds to TRIM_START silently, and becomes the
 * new standby for the next cycle.
 *
 * That hides the "broken record" audio jump that a single-element
 * seek-loop produces — the bundled intro music isn't a loop-friendly
 * track, so any restart lands mid-musical-phrase; cross-fading two
 * streams under each other turns the abrupt cut into a wash.
 *
 * The `claudiu:intro-ending` event from `IntroSplash` is consumed
 * here to ramp the initial active video's volume in over the intro's
 * own fade-out. If the intro splash was already seen this session
 * (`sessionStorage.claudiu_intro_seen`), we just ramp on mount.
 */

const TRIM_START         = 6.5  // seconds — past the Ribéry silver-trophy beat
const CROSSFADE_DURATION = 1.0  // seconds — opacity + volume ramp at the seam
const CROSSFADE_LEAD     = 1.1  // seconds before duration to start the fade (slightly > DURATION so the standby has time to begin playing before its opacity peaks)
const TARGET_VOLUME      = 0.2  // ambient bg level
const STORAGE_KEY        = 'claudiu_intro_seen'

export default function AuthLayout() {
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const [activeKey, setActiveKey] = useState('a')
  const activeRef = useRef('a')        // mirror of activeKey so event handlers see the current value
  const crossfadingRef = useRef(false) // refractory guard

  useEffect(() => { activeRef.current = activeKey }, [activeKey])

  useEffect(() => {
    const a = videoARef.current
    const b = videoBRef.current
    if (!a || !b) return

    const seek = (v) => {
      try { if (v.currentTime < TRIM_START) v.currentTime = TRIM_START } catch {}
    }
    const onMetaA = () => seek(a)
    const onMetaB = () => seek(b)
    if (a.readyState >= 1) seek(a); else a.addEventListener('loadedmetadata', onMetaA, { once: true })
    if (b.readyState >= 1) seek(b); else b.addEventListener('loadedmetadata', onMetaB, { once: true })

    const rampVolume = (v, from, to, durationMs) => {
      const start = performance.now()
      return new Promise((resolve) => {
        const tick = (now) => {
          const t = Math.min(1, (now - start) / durationMs)
          try { v.volume = from + (to - from) * t } catch {}
          if (t < 1) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
    }

    const rampActiveIn = (durationMs = 1000) => {
      const active = activeRef.current === 'a' ? a : b
      try { active.muted = false; active.volume = 0 } catch {}
      return rampVolume(active, 0, TARGET_VOLUME, durationMs)
    }

    const introSeen = (() => {
      try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
    })()

    let onIntroEnding
    let initialRampTimer
    if (introSeen) {
      initialRampTimer = setTimeout(() => rampActiveIn(800), 100)
    } else {
      onIntroEnding = (e) => {
        const duration = e?.detail?.durationMs || 1000
        rampActiveIn(duration)
      }
      window.addEventListener('claudiu:intro-ending', onIntroEnding)
    }

    const performCrossfade = async () => {
      const fromKey = activeRef.current
      const toKey = fromKey === 'a' ? 'b' : 'a'
      const fromV = fromKey === 'a' ? a : b
      const toV   = toKey   === 'a' ? a : b

      try {
        toV.currentTime = TRIM_START
        toV.muted = false
        toV.volume = 0
      } catch {}

      try { await toV.play() } catch { /* ignore — keep fading visually */ }

      // Visual fade via CSS transition driven by activeKey state.
      setActiveKey(toKey)

      const durationMs = CROSSFADE_DURATION * 1000
      const fromStartVol = (() => { try { return fromV.volume } catch { return TARGET_VOLUME } })()
      await Promise.all([
        rampVolume(fromV, fromStartVol, 0, durationMs),
        rampVolume(toV,   0, TARGET_VOLUME, durationMs),
      ])

      try {
        fromV.pause()
        fromV.currentTime = TRIM_START
        fromV.volume = 0
        fromV.muted = true
      } catch {}

      activeRef.current = toKey
      crossfadingRef.current = false
    }

    const onTimeUpdate = (e) => {
      const v = e.target
      const key = activeRef.current
      const isActive = (key === 'a' && v === a) || (key === 'b' && v === b)
      if (!isActive || crossfadingRef.current) return
      const d = v.duration
      if (!isFinite(d) || d <= 0) return
      if (v.currentTime >= d - CROSSFADE_LEAD) {
        crossfadingRef.current = true
        performCrossfade()
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)
    b.addEventListener('timeupdate', onTimeUpdate)

    // Fallback if `timeupdate` resolution misses the CROSSFADE_LEAD window —
    // just seek the active one back inline. Visual seam returns, but rare.
    const onEnded = (e) => {
      const v = e.target
      const key = activeRef.current
      const isActive = (key === 'a' && v === a) || (key === 'b' && v === b)
      if (!isActive || crossfadingRef.current) return
      try {
        v.currentTime = TRIM_START
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
    a.addEventListener('ended', onEnded)
    b.addEventListener('ended', onEnded)

    return () => {
      if (initialRampTimer) clearTimeout(initialRampTimer)
      a.removeEventListener('loadedmetadata', onMetaA)
      b.removeEventListener('loadedmetadata', onMetaB)
      a.removeEventListener('timeupdate', onTimeUpdate)
      b.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('ended', onEnded)
      b.removeEventListener('ended', onEnded)
      if (onIntroEnding) window.removeEventListener('claudiu:intro-ending', onIntroEnding)
    }
  }, [])

  const videoStyle = {
    transform: 'scale(2.0)',
    transformOrigin: 'center center',
    transition: `opacity ${CROSSFADE_DURATION}s ease-in-out`,
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden">
      <video
        ref={videoARef}
        src="/intro-mobile.mp4"
        autoPlay
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ ...videoStyle, opacity: activeKey === 'a' ? 1 : 0 }}
      />
      <video
        ref={videoBRef}
        src="/intro-mobile.mp4"
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ ...videoStyle, opacity: activeKey === 'b' ? 1 : 0 }}
      />
      <div className="relative w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  )
}
