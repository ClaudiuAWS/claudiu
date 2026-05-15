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
  introEnabled: 'introAudioEnabled',
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
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.loop = true
  }, [])

  // Live-update the audio element's volume when the slider moves.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    try { a.volume = appVolume } catch {}
  }, [appVolume])

  // (Re)load + play whenever appEnabled flips on or the chosen
  // app track changes.
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
    }

    const attemptPlay = () => {
      const p = a.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
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
    attemptPlay()
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
