import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { TRACKS, DEFAULT_TRACK_ID, getTrackById } from '../utils/tracks'

/**
 * Audio preferences for the app.
 *
 * Two independent surfaces:
 *   - **App music**: post-auth ambient background. Picked from
 *     `TRACKS`, plays at `volume = 0.2`, loops. The user can pick
 *     which track plays here from the Profile picker (wallpaper-
 *     style). Toggle controls on/off.
 *   - **Intro audio**: just an on/off toggle. The intro splash
 *     always uses its own bundled video audio — the user can't
 *     swap in a different track here (they wanted the original
 *     video audio kept).
 *
 * Persistence (localStorage):
 *   appAudioEnabled   (default true)
 *   appAudioTrackId   (default 'intro')
 *   introAudioEnabled (default true)
 *
 * Autoplay-safe: if `audio.play()` rejects (Safari first-load), a
 * one-shot pointerdown/keydown listener retries on first user
 * gesture.
 *
 * Mount inside the post-auth `Layout` only. Login/Register own
 * their own ambient (`useBgAmbientAudio` via `AuthLayout`).
 */

const TARGET_VOLUME = 0.2  // default app-music volume; user override persists in localStorage

const KEYS = {
  appEnabled:   'appAudioEnabled',
  appTrack:     'appAudioTrackId',
  appVolume:    'appAudioVolume',     // user-adjustable 0..1
  appPosition:  'appAudioPosition',   // {trackId, position} — resume across refresh
  introEnabled: 'introAudioEnabled',
}

function _readPosition() {
  try {
    const raw = localStorage.getItem(KEYS.appPosition)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.trackId === 'string' && typeof parsed.position === 'number') {
      return parsed
    }
  } catch {}
  return null
}
function _writePosition(trackId, position) {
  try {
    localStorage.setItem(KEYS.appPosition, JSON.stringify({ trackId, position }))
  } catch {}
}

function _readFloat(key, defaultValue) {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    const n = Number(v)
    return isFinite(n) ? Math.min(1, Math.max(0, n)) : defaultValue
  } catch { return defaultValue }
}
function _writeFloat(key, value) {
  try { localStorage.setItem(key, String(value)) } catch {}
}

function _readBool(key, defaultValue) {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    return v === '1' || v === 'true'
  } catch { return defaultValue }
}
function _writeBool(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch {}
}
function _readString(key, defaultValue) {
  try { return localStorage.getItem(key) ?? defaultValue } catch { return defaultValue }
}
function _writeString(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

// Module-level helper so IntroSplash can read the prefs synchronously
// at mount, before this provider has rendered (the provider only
// lives in the post-auth Layout).
export function getIntroAudioPrefs() {
  return { enabled: _readBool(KEYS.introEnabled, true) }
}
export function getAppAudioPrefs() {
  return {
    enabled: _readBool(KEYS.appEnabled, true),
    trackId: _readString(KEYS.appTrack,  DEFAULT_TRACK_ID),
  }
}

const AppAudioContext = createContext(null)

export function AppAudioProvider({ children }) {
  const audioRef = useRef(null)
  const [appEnabled,   setAppEnabledState]   = useState(() => _readBool(KEYS.appEnabled,   true))
  const [appTrackId,   setAppTrackIdState]   = useState(() => _readString(KEYS.appTrack,   DEFAULT_TRACK_ID))
  const [appVolume,    setAppVolumeState]    = useState(() => _readFloat(KEYS.appVolume,   TARGET_VOLUME))
  const [introEnabled, setIntroEnabledState] = useState(() => _readBool(KEYS.introEnabled, true))

  const appTrack = getTrackById(appTrackId)

  // App-music element setup. Run once.
  // NOTE: no `a.loop = true` — the FIFA-style auto-advance below
  // chains tracks via the `ended` event. If loop were on, ended
  // would never fire and the playlist couldn't progress.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.loop = false
  }, [])

  // Live-update the audio element's volume when the slider moves.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    try { a.volume = appVolume } catch {}
  }, [appVolume])

  // (Re)load + play whenever appEnabled flips on or the chosen
  // app track changes.
  //
  // Resilience: after a hard refresh, the browser blocks autoplay
  // until a user gesture lands. We register a CAPTURE-phase
  // pointerdown/keydown listener that stays armed until `a.play()`
  // actually resolves — so the first gesture (any tap, anywhere)
  // wakes the audio, and subsequent gestures keep retrying if the
  // first play() rejects for any reason. Capture phase ensures the
  // retry fires before any in-tree handler can stopPropagation.
  useEffect(() => {
    const a = audioRef.current
    if (!a || !appTrack) return

    if (!appEnabled) {
      try { a.pause() } catch {}
      return
    }

    const targetSrc = appTrack.file
    if (!a.src.endsWith(targetSrc)) {
      a.src = targetSrc
      // Restore previous playback position if the user is returning
      // to the same track (e.g. hard refresh). Setting currentTime
      // before metadata is loaded would silently no-op, so wait for
      // `loadedmetadata` when the element isn't ready yet.
      const saved = _readPosition()
      if (saved && saved.trackId === appTrackId && saved.position > 1) {
        const restore = () => { try { a.currentTime = saved.position } catch {} }
        if (a.readyState >= 1) restore()
        else a.addEventListener('loadedmetadata', restore, { once: true })
      }
    }

    let cleanupRetry = null

    const tryPlay = () => {
      const p = a.play()
      if (!p || typeof p.then !== 'function') return
      p.then(() => {
        if (cleanupRetry) { cleanupRetry(); cleanupRetry = null }
      }).catch(() => {
        if (cleanupRetry) return // already armed
        const retry = () => tryPlay()
        window.addEventListener('pointerdown', retry, { capture: true })
        window.addEventListener('keydown',     retry, { capture: true })
        cleanupRetry = () => {
          window.removeEventListener('pointerdown', retry, { capture: true })
          window.removeEventListener('keydown',     retry, { capture: true })
        }
      })
    }
    tryPlay()

    // FIFA-style auto-advance: when the current track ends, jump to
    // the next unlocked track in the catalog. Wraps at the end.
    const onEnded = () => {
      const unlocked = TRACKS.filter(t => !t.requiredBadge)
      if (unlocked.length <= 1) return
      const idx = unlocked.findIndex(t => t.id === appTrackId)
      const next = unlocked[(idx + 1) % unlocked.length]
      if (next && next.id !== appTrackId) {
        // Reset saved position for the new track — it should start
        // fresh, not resume from wherever the user last left off.
        _writePosition(next.id, 0)
        setAppTrackIdState(next.id)
        _writeString(KEYS.appTrack, next.id)
      }
    }
    a.addEventListener('ended', onEnded)

    // Throttled position save (~every 3s) so a hard refresh resumes
    // from approximately where the user was. Capped so we never
    // save a position that's basically at the end (would auto-end
    // immediately on resume).
    let lastSave = 0
    const onTimeUpdate = () => {
      const now = performance.now()
      if (now - lastSave < 3000) return
      lastSave = now
      const d = a.duration
      if (isFinite(d) && d > 0 && a.currentTime < d - 2) {
        _writePosition(appTrackId, a.currentTime)
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)

    // Also save on pause — catches the page-unload / tab-hide case
    // where timeupdate's 3s throttle might miss the last sample.
    const onPause = () => {
      const d = a.duration
      if (isFinite(d) && d > 0 && a.currentTime > 1 && a.currentTime < d - 2) {
        _writePosition(appTrackId, a.currentTime)
      }
    }
    a.addEventListener('pause', onPause)

    return () => {
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('pause', onPause)
      if (cleanupRetry) cleanupRetry()
    }
  }, [appEnabled, appTrackId, appTrack])

  // App setters
  const setAppEnabled = (next) => { setAppEnabledState(next); _writeBool(KEYS.appEnabled, next) }
  const toggleApp     = () => setAppEnabled(!appEnabled)
  const setAppTrack   = (id) => {
    if (!TRACKS.find(t => t.id === id)) return
    setAppTrackIdState(id)
    _writeString(KEYS.appTrack, id)
  }
  const setAppVolume = (next) => {
    const clamped = Math.min(1, Math.max(0, Number(next) || 0))
    setAppVolumeState(clamped)
    _writeFloat(KEYS.appVolume, clamped)
  }

  // Intro toggle (sound on/off only — no track override)
  const setIntroEnabled = (next) => { setIntroEnabledState(next); _writeBool(KEYS.introEnabled, next) }
  const toggleIntro     = () => setIntroEnabled(!introEnabled)

  return (
    <AppAudioContext.Provider value={{
      // App music
      appEnabled, toggleApp, setAppEnabled,
      appTrackId, setAppTrack, appTrack,
      appVolume, setAppVolume,
      // Intro audio (toggle only)
      introEnabled, toggleIntro, setIntroEnabled,
      // List of currently-unlocked tracks for the Profile picker.
      tracks: TRACKS,
    }}>
      <audio ref={audioRef} preload="auto" playsInline />
      {children}
    </AppAudioContext.Provider>
  )
}

export function useAppAudio() {
  const ctx = useContext(AppAudioContext)
  if (!ctx) {
    return {
      appEnabled: false, toggleApp: () => {}, setAppEnabled: () => {},
      appTrackId: DEFAULT_TRACK_ID, setAppTrack: () => {}, appTrack: null,
      appVolume: TARGET_VOLUME, setAppVolume: () => {},
      introEnabled: true, toggleIntro: () => {}, setIntroEnabled: () => {},
      tracks: TRACKS,
    }
  }
  return ctx
}
