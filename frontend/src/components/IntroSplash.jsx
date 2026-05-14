import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'claudiu_intro_seen'
const BUMPER_AT = 29.5            // seconds — Claudiu logo fades in
const FADE_AT = 31.0              // seconds — splash fade-out begins
const FADE_DURATION_MS = 1000     // splash opacity + scale + audio ramp

function pickSrc() {
  if (typeof window === 'undefined') return '/intro-mobile.mp4'
  const isHighDpr = (window.devicePixelRatio || 1) >= 2
  return isHighDpr ? '/intro-mobile-4k.mp4' : '/intro-mobile.mp4'
}

function pickFit() {
  if (typeof window === 'undefined') return 'contain'
  // Desktop landscape: cover the viewport (the source's baked-in letterbox gets cropped out, content fills width).
  // Mobile portrait: contain (preserves the source's native cinematic 9:16 framing).
  return window.matchMedia('(min-width: 769px)').matches ? 'cover' : 'contain'
}

export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)
  const [src] = useState(pickSrc)
  const [fit] = useState(pickFit)
  const [showSkip, setShowSkip] = useState(false)
  const [showBumper, setShowBumper] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}

    // Audio volume ramp 1.0 → 0.0 over FADE_DURATION_MS via rAF (smooth, no audible click).
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

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    v.muted = false
    v.volume = 1
    const playPromise = v.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        v.muted = true
        setNeedsUnmute(true)
        v.play().catch(() => {})
      })
    }

    const skipTimer = setTimeout(() => setShowSkip(true), 1000)

    const onTimeUpdate = () => {
      if (v.currentTime >= BUMPER_AT && !bumperShownRef.current) {
        bumperShownRef.current = true
        setShowBumper(true)
      }
      if (v.currentTime >= FADE_AT && !finishedRef.current) {
        finish()
      }
    }
    v.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      clearTimeout(skipTimer)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [])

  const unmute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setNeedsUnmute(false)
  }

  return (
    <div
      className="fixed top-0 left-0 z-[100] bg-black"
      style={{
        width: '100dvw',
        height: '100dvh',
        minWidth: '100vw',
        minHeight: '100vh',
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? 'scale(1.06)' : 'scale(1)',
        transition: `opacity ${FADE_DURATION_MS}ms ease-out, transform ${FADE_DURATION_MS}ms ease-out`,
        transformOrigin: 'center center',
      }}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        poster="/intro-poster.jpg"
        onEnded={finish}
        className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />

      {/* Brand bumper: Claudiu logo fades + scales in at t=29.5s, holds through fade-out */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          opacity: showBumper ? 1 : 0,
          transform: showBumper ? 'scale(1)' : 'scale(0.92)',
          transition: 'opacity 600ms ease-out, transform 600ms ease-out',
        }}
      >
        <img
          src="/logo-dark-bg.png"
          alt="Claudiu"
          className="w-28 h-28 md:w-36 md:h-36 rounded-3xl"
          style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.9))' }}
        />
      </div>

      {needsUnmute && (
        <button
          onClick={unmute}
          className="absolute top-6 left-6 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-semibold border border-white/20 transition-opacity hover:bg-white/20"
        >
          🔊 Tap for sound
        </button>
      )}

      <button
        onClick={finish}
        className={`absolute top-6 right-6 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md text-white/80 text-xs font-semibold border border-white/20 transition-opacity hover:bg-white/20 ${showSkip ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ transitionDuration: '400ms' }}
      >
        Skip ›
      </button>
    </div>
  )
}
