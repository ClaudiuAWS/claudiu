import { useEffect, useRef, useState } from 'react'
import { getIntroAudioPrefs } from '../hooks/useAppAudio'
import { getTrackById } from '../utils/tracks'

const STORAGE_KEY = 'claudiu_intro_seen'
const BUMPER_AT = 29.5            // seconds — brand bumper fades in
const FADE_AT = 31.0              // seconds — splash fade-out begins
const FADE_DURATION_MS = 1000     // splash opacity + scale + audio ramp

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
 * - Plays the intro video (full-bleed).
 * - At t≈29.5s, the brand bumper (cropped Bundesliga emblem + white
 *   BUNDESLIGA / FANTASY wordmark, lightly 3D-tilted) fades in,
 *   together with a pulsing "TAP ANYWHERE" hint below it.
 * - At t≈31s, or on any tap anywhere on the splash, fade out and
 *   call `onFinish`.
 * - Audio: defaults to sound-ON. Persists via localStorage
 *   `introAudioEnabled` (toggle lives in Profile post-auth). If the
 *   user picked a custom intro track, the video plays muted and we
 *   play their chosen mp3 as a separate `<audio>` element. If
 *   nothing's set / track has no file, the video's bundled audio
 *   plays at full volume.
 * - Browser autoplay block: try unmuted first, fall back to muted
 *   if rejected. No more "Tap for sound" button — the user explicitly
 *   asked us to remove it; first-load silence is the trade-off.
 */
export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
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

    // Signal LoginPage / RegisterPage to start ramping bg audio in (cross-fade).
    try { window.dispatchEvent(new CustomEvent('claudiu:intro-ending', { detail: { durationMs: FADE_DURATION_MS } })) } catch {}

    // Audio volume ramp 1.0 → 0.0 over FADE_DURATION_MS.
    const sources = [videoRef.current, audioRef.current].filter(Boolean)
    sources.forEach(el => {
      const startVol = el.volume || 1
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / FADE_DURATION_MS)
        try { el.volume = startVol * (1 - t) } catch {}
        if (t < 1) requestAnimationFrame(tick)
        else { try { el.pause() } catch {} }
      }
      requestAnimationFrame(tick)
    })

    setTimeout(() => onFinish?.(), FADE_DURATION_MS)
  }

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const prefs = getIntroAudioPrefs()
    const introTrack = getTrackById(prefs.trackId)
    const useCustomAudio = !!(prefs.enabled && introTrack?.file)

    // Video starts unmuted unless the user has opted out of intro
    // sound or they've picked a custom track (in which case the
    // custom audio carries the sound).
    if (!prefs.enabled) {
      v.muted = true
    } else if (useCustomAudio) {
      v.muted = true   // visuals only; mp3 plays the audio
    } else {
      v.muted = false
      v.volume = 1
    }

    const playPromise = v.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        // Autoplay block — fall back to muted. The user's choice to
        // remove the "Tap for sound" button means we accept silent
        // playback on browsers that block unmuted autoplay.
        v.muted = true
        v.play().catch(() => {})
      })
    }

    // Custom intro audio (separate from the video's bundled track).
    if (useCustomAudio) {
      const a = audioRef.current
      if (a) {
        a.src = introTrack.file
        a.volume = 1
        a.loop = false
        const p = a.play()
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Audio autoplay can also be blocked. Retry on first
            // user gesture — usually the tap-anywhere to skip.
            const retry = () => {
              window.removeEventListener('pointerdown', retry)
              window.removeEventListener('keydown',     retry)
              try { a.play() } catch {}
            }
            window.addEventListener('pointerdown', retry, { once: true })
            window.addEventListener('keydown',     retry, { once: true })
          })
        }
      }
    }

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
        onEnded={finish}
        className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Optional custom audio element — only used when the user has
          set a per-intro track in Profile and intro sound is enabled. */}
      <audio ref={audioRef} preload="auto" playsInline style={{ display: 'none' }} />

      {/* Brand bumper: cropped Bundesliga emblem + white BUNDESLIGA /
          FANTASY wordmark, lightly 3D-tilted. Stacks vertically with
          a "TAP ANYWHERE" hint below. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6"
        style={{
          opacity: showBumper ? 1 : 0,
          transform: showBumper ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 700ms ease-out, transform 700ms ease-out',
        }}
      >
        {/* Logo + wordmark stack (matches the auth-page composition
            so the splash → login handover feels seamless). */}
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

        {/* TAP ANYWHERE hint — slightly below centre, like FIFA's
            "PRESS START or SPACE". Pulses gently to draw the eye. */}
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
