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
 * Intro splash.
 *
 * - Plays the intro video full-bleed (`object-cover`) with its bundled
 *   audio. At t≈BUMPER_AT a geometric brand panel fades in *over* the
 *   still-playing video; the video never pauses. On `ended` it seeks
 *   back to TRIM_START and keeps looping — same trick AuthLayout uses
 *   so the trimmed silver-trophy frames never reappear.
 * - The entire splash is one tap target. Tap → fade out and dispatch
 *   `claudiu:intro-ending` so AuthLayout's bg audio cross-fades in.
 * - Autoplay-with-sound is best-effort: if the browser blocks it, we
 *   start muted and retry the unmute on the first user pointerdown/
 *   keydown — which is also the tap that advances the splash, so the
 *   audio is audible for the fade-out and any subsequent loops.
 */
export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)
  const [src] = useState(pickSrc)
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

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const prefs = getIntroAudioPrefs()
    if (!prefs.enabled) {
      v.muted = true
    } else {
      v.muted = false
      v.volume = 1
    }

    const playPromise = v.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        // Autoplay-with-sound blocked → start muted so the video at
        // least animates, then attempt the unmute on the first user
        // gesture (which is also the tap that advances).
        v.muted = true
        v.play().catch(() => {})

        if (!prefs.enabled) return
        const unmuteOnGesture = () => {
          window.removeEventListener('pointerdown', unmuteOnGesture)
          window.removeEventListener('keydown', unmuteOnGesture)
          if (finishedRef.current) return
          try { v.muted = false; v.volume = 1 } catch {}
        }
        window.addEventListener('pointerdown', unmuteOnGesture, { once: true })
        window.addEventListener('keydown', unmuteOnGesture, { once: true })
      })
    }

    // Pre-emptive loop on top of the bumper trigger — both run inside
    // the same `timeupdate` handler. The refractory flag stops multiple
    // `timeupdate` events from re-triggering the seek mid-flight.
    let isLooping = false
    const onTimeUpdate = () => {
      if (v.currentTime >= BUMPER_AT && !bumperShownRef.current) {
        bumperShownRef.current = true
        setShowBumper(true)
        // Do NOT pause — the video keeps playing under the panel.
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

    // Fallback if `timeupdate` resolution misses the END_PAD window.
    const onEnded = () => {
      try {
        v.currentTime = TRIM_START
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
    v.addEventListener('ended', onEnded)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('ended', onEnded)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black cursor-pointer select-none"
      onClick={finish}
      role="button"
      aria-label="Skip intro"
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
        autoPlay
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

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
            // Diagonal cuts on top-left + bottom-right — gives the
            // panel a "stadium tournament card" silhouette.
            clipPath: 'polygon(22px 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%, 0 22px)',
            background: 'linear-gradient(180deg, rgba(15,15,20,0.78) 0%, rgba(8,8,12,0.82) 100%)',
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
            padding: '2.25rem 2.75rem',
          }}
        >
          {/* Red top accent stripe — tucked inside the clipped corner. */}
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
              src="/logo.png"
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
