import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

/**
 * Shared layout for the auth pages (Login + Register + Confirm).
 *
 * Owns a double-buffered background video so the loop seam is hidden
 * behind a ~1s cross-fade of two stacked <video> elements. Each
 * element plays naturally from TRIM_START to its own duration; just
 * before the active one ends, the standby starts at TRIM_START and
 * both videos cross-fade (opacity + volume). After the fade, the
 * old-active pauses, rewinds silently, and becomes the new standby.
 *
 * Defensive positioning: each <video> is `position: fixed; inset: 0;
 * width: 100vw; height: 100vh` via inline style — bypassing any
 * Tailwind / parent layout quirk that was leaving top/bottom black
 * bars on mobile viewport ratios.
 *
 * On mount we explicitly play+pause BOTH videos to engage them with
 * the browser's per-element playback state. Without this, the standby
 * video B's first cross-fade `play()` was being silently rejected
 * (Chrome's per-element gesture requirement), leaving B frozen on a
 * static frame after the opacity fade.
 *
 * The `claudiu:intro-ending` event from `IntroSplash` ramps the active
 * video's audio in. If `claudiu_intro_seen` is already in
 * sessionStorage, we ramp on mount instead.
 */

const TRIM_START         = 6.5
const CROSSFADE_DURATION = 1.0
const CROSSFADE_LEAD     = 1.1
const TARGET_VOLUME      = 0.2
const STORAGE_KEY        = 'claudiu_intro_seen'

export default function AuthLayout() {
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const [activeKey, setActiveKey] = useState('a')
  const activeRef = useRef('a')
  const crossfadingRef = useRef(false)
  const doubleBufferEnabledRef = useRef(true)

  useEffect(() => { activeRef.current = activeKey }, [activeKey])

  useEffect(() => {
    const a = videoARef.current
    const b = videoBRef.current
    if (!a || !b) return

    let disposed = false

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
          if (t < 1 && !disposed) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
    }

    // Engage both videos with the browser's playback state. The first
    // play() on each element while muted is allowed; once it succeeds,
    // future play() calls on that element resolve immediately even
    // outside a user gesture.
    const engage = async () => {
      try { a.muted = true } catch {}
      try { b.muted = true } catch {}
      try { await a.play() } catch {}
      let bEngaged = false
      try {
        await b.play()
        bEngaged = true
      } catch {}
      if (bEngaged) {
        try {
          b.pause()
          b.currentTime = TRIM_START
        } catch {}
      } else {
        // Couldn't engage B — fall back to single-buffer seek-loop on A.
        doubleBufferEnabledRef.current = false
      }
    }
    engage()

    // Equal-power fade-in: sin(π/2·t) rises 0 → 1 with a curve
    // that pairs cleanly against the splash's cos(π/2·t) fade-out,
    // so the perceived loudness stays roughly constant through the
    // handoff (cos² + sin² = 1) instead of dipping mid-crossfade.
    const rampActiveInSine = (durationMs = 1500) => {
      const active = activeRef.current === 'a' ? a : b
      try { active.muted = false; active.volume = 0 } catch {}
      const start = performance.now()
      return new Promise((resolve) => {
        const tick = (now) => {
          const t = Math.min(1, (now - start) / durationMs)
          try { active.volume = TARGET_VOLUME * Math.sin((Math.PI / 2) * t) } catch {}
          if (t < 1 && !disposed) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
    }

    const introSeen = (() => {
      try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
    })()

    let onIntroEnding
    let initialRampTimer
    if (introSeen) {
      initialRampTimer = setTimeout(() => rampActiveInSine(800), 100)
    } else {
      onIntroEnding = (e) => {
        const duration = e?.detail?.durationMs || 1500
        const handoffTime = e?.detail?.currentTime
        // Sync the active video to the splash's exact currentTime so
        // the crossfade is between two identical musical positions —
        // only the volume changes, not the audio content. Kills the
        // "broken record" wash at the intro→login handoff.
        const active = activeRef.current === 'a' ? a : b
        if (typeof handoffTime === 'number' && isFinite(handoffTime) && handoffTime > 0) {
          try { active.currentTime = handoffTime } catch {}
        }
        rampActiveInSine(duration)
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

      try { await toV.play() } catch { /* engagement should have prevented this */ }

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

    // Single-buffer fallback if B engagement failed.
    const performSeekLoop = (v) => {
      try {
        v.currentTime = TRIM_START
        v.play().catch(() => {})
      } catch {}
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
        if (doubleBufferEnabledRef.current) {
          performCrossfade()
        } else {
          performSeekLoop(v)
        }
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)
    b.addEventListener('timeupdate', onTimeUpdate)

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
      disposed = true
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

  // Inline styles for the videos — bypass Tailwind to make sure the
  // viewport pinning isn't lost to a class-generation or cascade
  // quirk. The fix that finally killed the mobile black bars.
  const videoStyle = {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    objectFit: 'cover',
    pointerEvents: 'none',
    transform: 'scale(3.0)',
    transformOrigin: 'center center',
    transition: `opacity ${CROSSFADE_DURATION}s ease-in-out`,
    zIndex: 0,
  }

  return (
    <>
      <video
        ref={videoARef}
        src="/intro-mobile.mp4"
        autoPlay
        muted
        playsInline
        poster="/intro-poster.jpg"
        style={{ ...videoStyle, opacity: activeKey === 'a' ? 1 : 0 }}
      />
      <video
        ref={videoBRef}
        src="/intro-mobile.mp4"
        muted
        playsInline
        poster="/intro-poster.jpg"
        style={{ ...videoStyle, opacity: activeKey === 'b' ? 1 : 0 }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 1.5rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: '24rem' }}>
          <Outlet />
        </div>
      </div>
    </>
  )
}
