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
const END_PAD    = 0.5  // seconds before the end at which we seek back, so the dark trailing frames never paint

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

    if (v.readyState >= 1) seekToTrim()
    else v.addEventListener('loadedmetadata', seekToTrim, { once: true })

    // Pre-emptive loop: seek back to TRIM_START *before* the dark
    // tail of the video paints. Watching `timeupdate` instead of
    // `ended` keeps the seek inside continuous playback so the
    // browser swaps frames smoothly with no black flash.
    let isLooping = false
    const onTimeUpdate = () => {
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

    // Fallback for browsers where `timeupdate` resolution is too
    // coarse to land inside the END_PAD window.
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
      v.removeEventListener('timeupdate', onTimeUpdate)
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
