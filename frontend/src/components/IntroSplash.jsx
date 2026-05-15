import { useEffect, useRef, useState } from 'react'
import { getIntroAudioPrefs } from '../hooks/useAppAudio'

const STORAGE_KEY = 'claudiu_intro_seen'
const TRIM_START = 6.5
const END_PAD    = 0.5
const BUMPER_AT  = 29.5
const FADE_DURATION_MS = 1500   // longer + equal-power curve = smoother intro→login handoff

function pickSrc() {
  if (typeof window === 'undefined') return '/intro-mobile.mp4'
  const isHighDpr = (window.devicePixelRatio || 1) >= 2
  return isHighDpr ? '/intro-mobile-4k.mp4' : '/intro-mobile.mp4'
}

/**
 * Intro splash.
 *
 * Pre-roll: black background + the geometric brand panel idling
 * with float + logo-tilt animations + a TAP TO BEGIN prompt. Video
 * stays paused (opacity 0). First tap triggers a brief press
 * animation, starts the video unmuted (using that gesture for
 * browser audio permission), and fades the panel out.
 *
 * Playback: video plays at scale 1.0 until BUMPER_AT, then the
 * cinematic zoom (1.0 → 3.0) runs while the brand panel fades back
 * in with the same design but a TAP ANYWHERE prompt. Loop is
 * pre-emptive at duration - END_PAD.
 *
 * Fade-out: on the bumper tap, the splash fades over FADE_DURATION_MS
 * with an equal-power cosine curve on the audio. `claudiu:intro-ending`
 * event carries the splash's currentTime so AuthLayout can seek its
 * own video to the same position before its sine-curve fade-in —
 * making the crossfade between two identical musical positions
 * inaudible.
 */
export default function IntroSplash({ onFinish }) {
  const videoRef = useRef(null)
  const finishedRef = useRef(false)
  const bumperShownRef = useRef(false)
  const [src] = useState(pickSrc)
  const [started, setStarted] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [showBumper, setShowBumper] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFadingOut(true)
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}

    const v = videoRef.current
    const handoffTime = v ? v.currentTime : null

    try {
      window.dispatchEvent(new CustomEvent('claudiu:intro-ending', {
        detail: { durationMs: FADE_DURATION_MS, currentTime: handoffTime },
      }))
    } catch {}

    if (v) {
      const startVol = v.volume || 1
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / FADE_DURATION_MS)
        // Equal-power fade-out: cos(π/2·t) goes 1 → 0 with a curve
        // that pairs cleanly against AuthLayout's sin(π/2·t) fade-in.
        try { v.volume = startVol * Math.cos((Math.PI / 2) * t) } catch {}
        if (t < 1) requestAnimationFrame(tick)
        else { try { v.pause() } catch {} }
      }
      requestAnimationFrame(tick)
    }

    setTimeout(() => onFinish?.(), FADE_DURATION_MS)
  }

  const handleStart = () => {
    if (started || finishedRef.current) return
    setPressing(true)
    setStarted(true)
    // Press animation runs ~200ms; reset the flag after CSS completes.
    setTimeout(() => setPressing(false), 250)

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

  // Panel visible in two phases: pre-roll (before started) and bumper.
  const showPanel = !started || showBumper
  const inPreRoll = !started

  // Animation string for the panel container.
  // - Pre-roll idle: gentle vertical float
  // - On tap: one-shot press
  // - During playback: no animation (panel is hidden anyway via opacity)
  const panelAnim = pressing
    ? 'preRollPress 0.22s ease-out'
    : inPreRoll
      ? 'preRollFloat 2.4s ease-in-out infinite'
      : 'none'

  // Logo tilt — only during pre-roll idle.
  const logoAnim = inPreRoll && !pressing
    ? 'preRollLogoTilt 3.6s ease-in-out infinite'
    : 'none'

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
          // Hidden during pre-roll so only the panel + black bg are
          // visible. Fades in over 500ms once the user taps.
          opacity: started ? 1 : 0,
          transition: 'opacity 500ms ease-out',
          // Cinematic push-in at the bumper.
          transform: showBumper ? 'scale(3.0)' : 'scale(1.0)',
          transformOrigin: 'center center',
          // The transform transition only applies after `started`
          // so we don't get a phantom zoom from the initial render.
          // (We use `style` so React commits this every render; the
          // long duration is only for the scale transform.)
          transitionProperty: 'opacity, transform',
          transitionDuration: '500ms, 2500ms',
          transitionTimingFunction: 'ease-out, cubic-bezier(0.45, 0, 0.55, 1)',
        }}
      />

      {/* Shared brand panel — pre-roll AND bumper.
          Only prompt text + idle animations differ between phases. */}
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
            perspective: '800px',  // gives the logo's rotateY some depth
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
