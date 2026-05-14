import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useBgAmbientAudio } from '../hooks/useBgAmbientAudio'

/**
 * Shared layout for the auth pages (Login + Register).
 *
 * Owns the full-bleed background video so it survives navigation
 * between /login and /register — only the form fields swap via
 * the `<Outlet />`, the video keeps playing seamlessly.
 *
 * Video source: the same `/intro-mobile.mp4` used by the splash,
 * but with the opening seconds (the silver-trophy bit) trimmed
 * off and a manual loop back to TRIM_START on each `ended`. That
 * keeps the bg cinematic for the auth screens without ever
 * showing the dark intro frames the trim cuts past, so there's
 * no black flash when the loop wraps.
 *
 * Audio is wired by `useBgAmbientAudio` — starts muted (browser
 * autoplay policy), then either jumps to ambient volume if the
 * intro was already seen this session, or cross-fades in when the
 * intro splash dispatches `claudiu:intro-ending` on tap.
 */

// Where the bg video should start each loop. Cuts past the intro's
// opening frames (silver trophy + early-fade darkness) so the bg
// reads as the "stadium hype" portion the user actually wants.
// Adjust if the silver-trophy moment is at a different timestamp
// in your particular intro cut.
const TRIM_START = 6.5  // seconds — past the Ribéry silver-trophy "wooow" beat so it doesn't replay every loop

export default function AuthLayout() {
  const bgVideoRef = useBgAmbientAudio()

  useEffect(() => {
    const v = bgVideoRef.current
    if (!v) return

    const seekToTrim = () => {
      try {
        if (v.currentTime < TRIM_START) v.currentTime = TRIM_START
      } catch {}
    }

    // First load — seek as soon as metadata is available so the
    // poster covers the brief pre-seek frame and we never paint
    // the trimmed-out intro frames.
    if (v.readyState >= 1) seekToTrim()
    else v.addEventListener('loadedmetadata', seekToTrim, { once: true })

    // Manual loop: jump back to TRIM_START (not 0) on every end so
    // the bg never replays the trimmed opening.
    const onEnded = () => {
      try {
        v.currentTime = TRIM_START
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
    v.addEventListener('ended', onEnded)

    return () => {
      v.removeEventListener('loadedmetadata', seekToTrim)
      v.removeEventListener('ended', onEnded)
    }
  }, [bgVideoRef])

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden">
      <video
        ref={bgVideoRef}
        src="/intro-mobile.mp4"
        autoPlay
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{
          // Tighter cinematic crop on the bg footage. The parent has
          // overflow-hidden so the edges that scale past the viewport
          // get clipped — net effect is a zoomed-in framing of the
          // stadium hype rather than the full wide shot.
          transform: 'scale(2.0)',
          transformOrigin: 'center center',
        }}
      />
      <div className="relative w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  )
}
