import { useEffect, useRef, useState } from 'react'
import { getIntroAudioPrefs } from '../hooks/useAppAudio'

const STORAGE_KEY = 'claudiu_intro_seen'
const TRIM_START = 6.5             // loop-back point, past the Ribéry silver-trophy "wooow" beat
const END_PAD    = 0.5             // seek back this many seconds before duration so the dark tail never paints
const BUMPER_AT = 29.5             // when the geometric brand panel fades in over the still-playing video
const FADE_DURATION_MS = 1000

function pickSrc() {
  if (typeof window === 'undefined') return '/intro-mobile.mp4'
  const isHighDpr = (window.devicePixelRatio || 1) >= 2
  return isHighDpr ? '/intro-mobile-4k.mp4' : '/intro-mobile.mp4'
}

/**
 * Intro splash with TAP TO BEGIN pre-roll.
 *
 * On mount the video is paused on its poster frame and a TAP TO BEGIN
 * hint pulses on screen. The first tap is the user gesture that the
 * browser requires to allow audio playback — handleStart() plays the
 * video unmuted in response. From there the existing flow runs: the
 * cinematic zoom + brand panel fade in at BUMPER_AT, the video loops
 * pre-emptively at duration - END_PAD, and a second tap (anywhere)
 * fades the splash out and signals AuthLayout's bg-audio crossfade.
 *
 * Why pre-roll: browsers hard-block autoplay-with-sound without a
 * gesture or sufficient Media Engagement Index. On a fresh mobile
 * visit (no MEI), there's no way to start audio without a tap. The
 * pre-roll makes that tap deliberate so the user hears the intro
 * from frame 0.
 */
export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)
  const [src] = useState(pickSrc)
  const [started, setStarted] = useState(false)
  const [showBumper, setShowBumper] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}

    try { window.dispatchEvent(new CustomEvent('claudiu:intro-ending', { detail: { durationMs: FADE_DURATION_MS } })) } catch {}

    const v = videoRef.current
    if (v) {
      const startVol = v.volume || 1
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / FADE_DURATION_MS)
        try { v.volume = startVol * (1 - t) } catch {}
        if (t < 1) requestAnimationFrame(tick)
        else { try { v.pause() } catch {} }
      }
      requestAnimationFrame(tick)
    }

    setTimeout(() => onFinish?.(), FADE_DURATION_MS)
  }

  const handleStart = () => {
    if (started || finishedRef.current) return
    setStarted(true)
    const v = videoRef.current
    if (!v) return
    const prefs = getIntroAudioPrefs()
    try {
      v.muted = !prefs.enabled
      v.volume = 1
    } catch {}
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Even a gesture sometimes isn't enough (very rare). Fall
        // back to muted so at least the video animates.
        try { v.muted = true } catch {}
        v.play().catch(() => {})
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
    const v = videoRef.current
    if (!v) return

    const seek = () => {
      try { if (v.currentTime < TRIM_START) v.currentTime = TRIM_START } catch {}
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })

    // Pre-emptive loop on top of the bumper trigger — both run inside
    // the same `timeupdate` handler. The refractory flag stops multiple
    // `timeupdate` events from re-triggering the seek mid-flight.
    let isLooping = false
    const onTimeUpdate = () => {
      if (v.currentTime >= BUMPER_AT && !bumperShownRef.current) {
        bumperShownRef.current = true
        setShowBumper(true)
      }
      if (isLooping) return
      const d = v.duration
      if (!isFinite(d) || d <= 0) return
      if (v.currentTime >= d - END_PAD) {
        isLooping = true
        try {
          v.currentTime = TRIM_START
          const p = v.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {}
        setTimeout(() => { isLooping = false }, 100)
      }
    }
    v.addEventListener('timeupdate', onTimeUpdate)

    const onEnded = () => {
      try {
        v.currentTime = TRIM_START
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
    v.addEventListener('ended', onEnded)

    return () => {
      v.removeEventListener('loadedmetadata', seek)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('ended', onEnded)
    }
  }, [])

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
        ref={videoRef}
        src={src}
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{
          // Cinematic push-in: the video plays at its natural framing
          // through the run-up, then smoothly zooms to fill the mobile
          // viewport the moment the brand panel begins fading in.
          transform: showBumper ? 'scale(3.0)' : 'scale(1.0)',
          transformOrigin: 'center center',
          transition: 'transform 2.5s cubic-bezier(0.45, 0, 0.55, 1)',
        }}
      />

      {/* TAP TO BEGIN — pre-roll prompt, hides once the user taps. */}
      {!started && !fadingOut && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <p
            className="font-stadium text-white"
            style={{
              fontSize: '1.2rem',
              letterSpacing: '0.4em',
              textShadow: '0 2px 12px rgba(0,0,0,0.85)',
              animation: 'introTapPulse 1.6s ease-in-out infinite',
            }}
          >
            TAP TO BEGIN
          </p>
        </div>
      )}

      {/* Geometric brand panel — clipped-corner stadium card sitting
          over the looping video. Fades in at BUMPER_AT and stays. */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none px-6"
        style={{
          opacity: showBumper ? 1 : 0,
          transform: showBumper ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 700ms ease-out, transform 700ms ease-out',
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
              style={{ width: 132, height: 132, display: 'block' }}
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
              animation: showBumper ? 'introTapPulse 1.6s ease-in-out 0.6s infinite' : 'none',
            }}
          >
            TAP ANYWHERE
          </p>
        </div>
      </div>

      <style>{`
        @keyframes introTapPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
