import { useEffect, useRef, useState } from 'react'
import { getIntroAudioPrefs } from '../hooks/useAppAudio'

const STORAGE_KEY = 'claudiu_intro_seen'
const BUMPER_AT = 29.5            // seconds — brand bumper fades in, video pauses, waits for tap
const FADE_DURATION_MS = 1000     // splash opacity + scale + audio ramp on tap

function pickSrc() {
  if (typeof window === 'undefined') return '/intro-mobile.mp4'
  const isHighDpr = (window.devicePixelRatio || 1) >= 2
  return isHighDpr ? '/intro-mobile-4k.mp4' : '/intro-mobile.mp4'
}

function pickFit() {
  if (typeof window === 'undefined') return 'contain'
  return window.matchMedia('(min-width: 769px)').matches ? 'cover' : 'contain'
}

/**
 * Intro splash.
 *
 * - Plays the intro video full-bleed with its bundled audio
 *   (subject to introEnabled — user can mute future runs from
 *   Profile post-auth).
 * - At t≈BUMPER_AT, the brand bumper (cropped Bundesliga emblem +
 *   white BUNDESLIGA / FANTASY wordmark, lightly 3D-tilted) fades
 *   in AND the video pauses. A pulsing "TAP ANYWHERE" hint sits
 *   below it.
 * - The splash stays frozen on that frame until the user taps
 *   anywhere; there's no auto-finish anymore. On tap, fade out
 *   and signal the bg-video cross-fade for the auth pages.
 * - No more "Tap for sound" or "Skip" buttons. The entire splash
 *   is one tap target. Autoplay-block falls back to muted.
 */
export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)
  const [src] = useState(pickSrc)
  const [fit] = useState(pickFit)
  const [showBumper, setShowBumper] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}

    // Signal AuthLayout's bg video to cross-fade its audio in.
    try { window.dispatchEvent(new CustomEvent('claudiu:intro-ending', { detail: { durationMs: FADE_DURATION_MS } })) } catch {}

    // Volume ramp on whatever is still playing (the video could be
    // paused at BUMPER_AT already, in which case the ramp is a no-op).
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
        // Autoplay block → fall back to muted (no recovery button).
        v.muted = true
        v.play().catch(() => {})
      })
    }

    const onTimeUpdate = () => {
      if (v.currentTime >= BUMPER_AT && !bumperShownRef.current) {
        bumperShownRef.current = true
        setShowBumper(true)
        // Hold the splash on this frame. The user has to tap to
        // advance — no auto-fade. If autoplay let audio through,
        // pausing here mutes naturally because the element is paused.
        try { v.pause() } catch {}
      }
    }
    v.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
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
        className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Brand bumper: cropped Bundesliga emblem + white BUNDESLIGA /
          FANTASY wordmark, lightly 3D-tilted, with a "TAP ANYWHERE"
          hint below. Visible from BUMPER_AT until tap. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6"
        style={{
          opacity: showBumper ? 1 : 0,
          transform: showBumper ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 700ms ease-out, transform 700ms ease-out',
        }}
      >
        <div
          className="text-center"
          style={{
            transform: 'perspective(1100px) rotateX(7deg)',
            transformStyle: 'preserve-3d',
            animation: showBumper ? 'introBrandFloat 4s ease-in-out 0.6s infinite' : 'none',
          }}
        >
          <div
            className="mx-auto overflow-hidden mb-2"
            style={{
              width: 132,
              height: 106,
              filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.65)) drop-shadow(0 0 40px rgba(220,38,38,0.45))',
            }}
          >
            <img
              src="/logo.png"
              alt=""
              style={{ width: 132, height: 132, display: 'block' }}
            />
          </div>
          <p
            className="font-stadium text-white leading-[0.92]"
            style={{
              fontSize: '2.2rem',
              letterSpacing: '0.14em',
              textShadow: '0 4px 16px rgba(0,0,0,0.8), 0 0 32px rgba(220,38,38,0.35)',
            }}
          >
            BUNDESLIGA
          </p>
          <p
            className="font-stadium text-white leading-[0.92]"
            style={{
              fontSize: '2.2rem',
              letterSpacing: '0.14em',
              textShadow: '0 4px 16px rgba(0,0,0,0.8), 0 0 32px rgba(220,38,38,0.35)',
            }}
          >
            FANTASY
          </p>
        </div>

        <p
          className="font-stadium text-white/80 mt-10"
          style={{
            fontSize: '0.92rem',
            letterSpacing: '0.32em',
            textShadow: '0 2px 10px rgba(0,0,0,0.7)',
            animation: showBumper ? 'introTapPulse 1.6s ease-in-out 0.6s infinite' : 'none',
          }}
        >
          TAP ANYWHERE
        </p>
      </div>

      <style>{`
        @keyframes introBrandFloat {
          0%, 100% { transform: perspective(1100px) rotateX(7deg) translateY(0); }
          50%      { transform: perspective(1100px) rotateX(7deg) translateY(-6px); }
        }
        @keyframes introTapPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
