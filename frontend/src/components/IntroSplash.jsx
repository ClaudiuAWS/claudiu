import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'claudiu_intro_seen'

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
  const [src] = useState(pickSrc)
  const [fit] = useState(pickFit)
  const [showSkip, setShowSkip] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    v.muted = false
    const playPromise = v.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        v.muted = true
        setNeedsUnmute(true)
        v.play().catch(() => {})
      })
    }

    const skipTimer = setTimeout(() => setShowSkip(true), 1000)
    return () => clearTimeout(skipTimer)
  }, [])

  const finish = () => {
    if (fadingOut) return
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}
    setTimeout(() => onFinish?.(), 400)
  }

  const unmute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setNeedsUnmute(false)
  }

  return (
    <div
      className={`fixed top-0 left-0 z-[100] bg-black transition-opacity ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
      style={{
        width: '100dvw',
        height: '100dvh',
        minWidth: '100vw',
        minHeight: '100vh',
        transitionDuration: '400ms',
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
