import { useEffect, useRef } from 'react'

const TARGET_VOLUME = 0.2  // ambient bg volume on login/register
const STORAGE_KEY = 'claudiu_intro_seen'

/**
 * Cross-fades the bg video's audio in to TARGET_VOLUME when the intro splash ends.
 *
 * Bg video must start `muted` (browser autoplay policy). The intro splash dispatches
 * a `claudiu:intro-ending` window event when its visual fade-out begins; on receipt,
 * we unmute and ramp `volume` from 0 → TARGET_VOLUME over the same duration.
 *
 * If the intro was already seen this session (sessionStorage gate), unmute + jump to
 * target volume on mount — no fade needed since the intro never plays.
 *
 * Returns a ref to be passed to the bg <video>.
 */
export function useBgAmbientAudio() {
  const videoRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const ramp = (durationMs) => {
      try { v.muted = false } catch {}
      try { v.volume = 0 } catch {}
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / durationMs)
        try { v.volume = TARGET_VOLUME * t } catch {}
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    const introAlreadySeen = (() => {
      try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
    })()

    if (introAlreadySeen) {
      // No intro this load — unmute immediately at target volume.
      // Wait one tick so the <video> element is mounted and `play()` has been kicked off.
      const t = setTimeout(() => {
        try { v.muted = false; v.volume = TARGET_VOLUME } catch {}
      }, 0)
      return () => clearTimeout(t)
    }

    // Intro is playing — wait for its fade-out signal, then cross-fade audio in.
    const onIntroEnding = (e) => {
      const durationMs = e?.detail?.durationMs || 1000
      ramp(durationMs)
    }
    window.addEventListener('claudiu:intro-ending', onIntroEnding)
    return () => window.removeEventListener('claudiu:intro-ending', onIntroEnding)
  }, [])

  return videoRef
}
