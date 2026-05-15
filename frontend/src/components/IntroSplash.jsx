import { useEffect, useRef, useState } from 'react'
import { getIntroAudioPrefs } from '../hooks/useAppAudio'

const STORAGE_KEY = 'claudiu_intro_seen'
const TRIM_START = 6.5
const BUMPER_AT  = 29.5
const FADE_DURATION_MS    = 1500   // splash fade-out on tap-to-advance
const CROSSFADE_DURATION  = 1.0    // intro-loop cross-fade between buffers (seconds)
const CROSSFADE_LEAD      = 1.1    // seconds before duration to start the fade

function pickSrc() {
  if (typeof window === 'undefined') return '/intro-mobile.mp4'
  const isHighDpr = (window.devicePixelRatio || 1) >= 2
  return isHighDpr ? '/intro-mobile-4k.mp4' : '/intro-mobile.mp4'
}

/**
 * Intro splash with double-buffered loop + cinematic pre-roll.
 *
 * Pre-roll: black bg + brand panel with idle float/tilt motion +
 * TAP TO BEGIN prompt. Both videos are paused, opacity 0.
 *
 * On tap: press animation, both videos seeked to TRIM_START, A
 * starts playing with audio (gesture grants permission), B is
 * play()ed then paused to engage the browser's per-element
 * playback state (so the cross-fade's `play()` later resolves
 * without a fresh gesture).
 *
 * Playback: video plays from TRIM_START. At BUMPER_AT the brand
 * panel fades back in (now with TAP ANYWHERE) and the cinematic
 * push-in 1.0 → 3.0 runs over 2.5 s.
 *
 * Loop: at `currentTime >= duration - CROSSFADE_LEAD`, the standby
 * video starts from TRIM_START and we cross-fade opacity + volume
 * over 1 s. After the fade, the previously-active video pauses and
 * rewinds — becomes the standby for the next cycle. Matches the
 * AuthLayout pattern so the intro loop reads as smoothly as the
 * login bg loop.
 *
 * Fade-out: on the bumper tap, splash fades over FADE_DURATION_MS
 * with an equal-power cosine on the active video's audio. The
 * `claudiu:intro-ending` event carries the splash's currentTime so
 * AuthLayout can seek its own video to match before its
 * sine-curve fade-in.
 */
export default function IntroSplash({ onFinish }) {
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const activeRef = useRef('a')
  const crossfadingRef = useRef(false)
  const doubleBufferEnabledRef = useRef(true)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)

  const [src] = useState(pickSrc)
  const [activeKey, setActiveKey] = useState('a')
  const [started, setStarted] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [showBumper, setShowBumper] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => { activeRef.current = activeKey }, [activeKey])

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}

    const activeV = activeRef.current === 'a' ? videoARef.current : videoBRef.current
    const handoffTime = activeV ? activeV.currentTime : null

    try {
      window.dispatchEvent(new CustomEvent('claudiu:intro-ending', {
        detail: { durationMs: FADE_DURATION_MS, currentTime: handoffTime },
      }))
    } catch {}

    if (activeV) {
      const startVol = activeV.volume || 1
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / FADE_DURATION_MS)
        // Equal-power fade-out — pairs with AuthLayout's sin fade-in.
        try { activeV.volume = startVol * Math.cos((Math.PI / 2) * t) } catch {}
        if (t < 1) requestAnimationFrame(tick)
        else { try { activeV.pause() } catch {} }
      }
      requestAnimationFrame(tick)
    }

    setTimeout(() => onFinish?.(), FADE_DURATION_MS)
  }

  const handleStart = () => {
    if (started || finishedRef.current) return
    setPressing(true)
    setStarted(true)
    setTimeout(() => setPressing(false), 250)

    const a = videoARef.current
    const b = videoBRef.current
    if (!a || !b) return

    const prefs = getIntroAudioPrefs()

    // First play: A plays from 0 so the user sees the full intro
    // (silver-trophy / Ribéry beat) on first load.
    // Standby: B is the cross-fade target — seek to TRIM_START so the
    // loop re-enters past the trimmed-out intro on every subsequent
    // wrap. Subsequent cross-fades go A↔B with both at TRIM_START.
    try { b.currentTime = TRIM_START } catch {}

    // Play A unmuted (the tap is the user gesture granting audio).
    try {
      a.muted = !prefs.enabled
      a.volume = 1
    } catch {}
    const pa = a.play()
    if (pa && typeof pa.catch === 'function') {
      pa.catch(() => {
        try { a.muted = true } catch {}
        a.play().catch(() => {})
      })
    }

    // Engage B: brief play+pause within the gesture so later
    // cross-fade play() works without needing another gesture.
    try {
      b.muted = true
      b.volume = 0
    } catch {}
    const pb = b.play()
    if (pb && typeof pb.then === 'function') {
      pb.then(() => {
        try {
          b.pause()
          b.currentTime = TRIM_START
        } catch {}
      }).catch(() => {
        // Couldn't engage B even muted — disable double-buffer,
        // fall back to single-element seek-loop on A.
        doubleBufferEnabledRef.current = false
      })
    }
  }

  const handleTap = () => {
    if (!started) {
      handleStart()
      return
    }
    finish()
  }

  useEffect(() => {
    const a = videoARef.current
    const b = videoBRef.current
    if (!a || !b) return

    let disposed = false

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

    const performCrossfade = async () => {
      const fromKey = activeRef.current
      const toKey = fromKey === 'a' ? 'b' : 'a'
      const fromV = fromKey === 'a' ? a : b
      const toV   = toKey   === 'a' ? a : b

      const prefs = getIntroAudioPrefs()
      const targetVol = prefs.enabled ? 1.0 : 0.0

      try {
        toV.currentTime = TRIM_START
        toV.muted = !prefs.enabled
        toV.volume = 0
      } catch {}

      try { await toV.play() } catch { /* engagement should have prevented this */ }

      setActiveKey(toKey)

      const durationMs = CROSSFADE_DURATION * 1000
      const fromStartVol = (() => { try { return fromV.volume } catch { return targetVol } })()
      await Promise.all([
        rampVolume(fromV, fromStartVol, 0, durationMs),
        rampVolume(toV,   0, targetVol, durationMs),
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
      if (!isActive) return

      if (v.currentTime >= BUMPER_AT && !bumperShownRef.current) {
        bumperShownRef.current = true
        setShowBumper(true)
      }
      if (crossfadingRef.current) return
      const d = v.duration
      if (!isFinite(d) || d <= 0) return
      if (v.currentTime >= d - CROSSFADE_LEAD) {
        crossfadingRef.current = true
        if (doubleBufferEnabledRef.current) {
          performCrossfade()
        } else {
          // Single-buffer fallback: hard seek-loop on the active video.
          try {
            v.currentTime = TRIM_START
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          } catch {}
          crossfadingRef.current = false
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
      a.removeEventListener('timeupdate', onTimeUpdate)
      b.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('ended', onEnded)
      b.removeEventListener('ended', onEnded)
    }
  }, [])

  // Panel visible in two phases: pre-roll (before started) and bumper.
  const showPanel = !started || showBumper
  const inPreRoll = !started

  const panelAnim = pressing
    ? 'preRollPress 0.22s ease-out'
    : inPreRoll
      ? 'preRollFloat 2.4s ease-in-out infinite'
      : 'none'

  const logoAnim = inPreRoll && !pressing
    ? 'preRollLogoTilt 3.6s ease-in-out infinite'
    : 'none'

  // Shared inline style for both video elements. Opacity comes from
  // `activeKey` (which one is currently visible during cross-fade)
  // AND `started` (both invisible during pre-roll).
  const videoStyle = (key) => ({
    opacity: !started ? 0 : (activeKey === key ? 1 : 0),
    transform: showBumper ? 'scale(3.0)' : 'scale(1.0)',
    transformOrigin: 'center center',
    transitionProperty: 'opacity, transform',
    transitionDuration: '500ms, 2500ms',
    transitionTimingFunction: 'ease-out, cubic-bezier(0.45, 0, 0.55, 1)',
  })

  return (
    <div
      className="fixed inset-0 z-[100] bg-black cursor-pointer select-none"
      onClick={handleTap}
      role="button"
      aria-label={started ? 'Skip intro' : 'Start intro'}
      style={{
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? 'scale(1.06)' : 'scale(1)',
        transition: `opacity ${FADE_DURATION_MS}ms ease-out, transform ${FADE_DURATION_MS}ms ease-out`,
        transformOrigin: 'center center',
      }}
    >
      <video
        ref={videoARef}
        src={src}
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={videoStyle('a')}
      />
      <video
        ref={videoBRef}
        src={src}
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={videoStyle('b')}
      />

      {/* Shared brand panel — pre-roll AND bumper. */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none px-6"
        style={{
          opacity: showPanel ? 1 : 0,
          transition: 'opacity 700ms ease-out',
        }}
      >
        <div
          className="relative text-center"
          style={{
            clipPath: 'polygon(22px 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%, 0 22px)',
            background: 'linear-gradient(180deg, rgba(15,15,20,0.78) 0%, rgba(8,8,12,0.82) 100%)',
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
            padding: '2.25rem 2.75rem',
            animation: panelAnim,
            transformOrigin: 'center center',
            perspective: '800px',
          }}
        >
          <div
            className="absolute top-0"
            style={{
              left: 22,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, #dc2626 0%, transparent 100%)',
            }}
          />

          <div
            className="mx-auto overflow-hidden mb-3"
            style={{ width: 132, height: 106 }}
          >
            <img
              src="/logo-bf.png"
              alt=""
              style={{
                width: 132,
                height: 132,
                display: 'block',
                animation: logoAnim,
                transformStyle: 'preserve-3d',
              }}
            />
          </div>
          <p
            className="font-stadium text-white leading-[0.92]"
            style={{ fontSize: '2.2rem', letterSpacing: '0.14em' }}
          >
            BUNDESLIGA
          </p>
          <p
            className="font-stadium text-white leading-[0.92]"
            style={{ fontSize: '2.2rem', letterSpacing: '0.14em' }}
          >
            FANTASY
          </p>

          <div
            className="mx-auto mt-5 mb-4"
            style={{
              width: '70%',
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
            }}
          />

          <p
            className="font-stadium text-white/80"
            style={{
              fontSize: '0.92rem',
              letterSpacing: '0.32em',
              animation: showPanel ? 'introTapPulse 1.6s ease-in-out 0.6s infinite' : 'none',
            }}
          >
            {inPreRoll ? 'TAP TO BEGIN' : 'TAP ANYWHERE'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes introTapPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        @keyframes preRollFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes preRollLogoTilt {
          0%, 100% { transform: rotateY(-6deg); }
          50%      { transform: rotateY(6deg); }
        }
        @keyframes preRollPress {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
