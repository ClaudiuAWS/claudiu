import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { TRACKS, DEFAULT_TRACK_ID, getTrackById } from '../utils/tracks'

/**
 * App-wide background music + intro audio preferences.
 *
 * Two independent audio "slots" the user can assign tracks to,
 * wallpaper-style:
 *   - **app**: post-auth ambient background. Played by the
 *     `<audio>` element this provider mounts; loops; volume 0.2.
 *   - **intro**: the splash video's audio source. The IntroSplash
 *     component reads `introEnabled` + `introTrackId` from here
 *     and decides whether to play the video's bundled audio, swap
 *     in the chosen track, or stay muted.
 *
 * State persistence (localStorage):
 *   appAudioEnabled   (default: true)
 *   appAudioTrackId   (default: 'intro')
 *   introAudioEnabled (default: true)
 *   introAudioTrackId (default: 'intro')
 *
 * Defaults align with the user's spec: intro is always loud the
 * first time you visit. Only after logging in can you flip it off
 * from Profile.
 *
 * Autoplay-safe: if `audio.play()` rejects (Safari first-load),
 * a one-shot pointerdown/keydown listener retries on first user
 * gesture.
 *
 * Mount inside the post-auth `Layout` only — Login/Register own
 * their own ambient (`useBgAmbientAudio`).
 */

const TARGET_VOLUME = 0.2

const KEYS = {
  appEnabled:   'appAudioEnabled',
  appTrack:     'appAudioTrackId',
  introEnabled: 'introAudioEnabled',
  introTrack:   'introAudioTrackId',
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

// Module-level helpers so IntroSplash can read prefs synchronously
// at mount, before this provider has rendered. The provider still
// owns the React-state version for in-app reactivity.
export function getIntroAudioPrefs() {
  return {
    enabled: _readBool(KEYS.introEnabled, true),
    trackId: _readString(KEYS.introTrack,  DEFAULT_TRACK_ID),
  }
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
  const [introEnabled, setIntroEnabledState] = useState(() => _readBool(KEYS.introEnabled, true))
  const [introTrackId, setIntroTrackIdState] = useState(() => _readString(KEYS.introTrack, DEFAULT_TRACK_ID))

  const appTrack   = getTrackById(appTrackId)
  const introTrack = getTrackById(introTrackId)

  // App-music audio element setup (volume + loop). Run once.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = TARGET_VOLUME
    a.loop   = true
  }, [])

  // (Re)load + play whenever appEnabled flips on or the chosen app
  // track changes.
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

  // Intro setters (no audio side-effects here — IntroSplash reads
  // these synchronously when it mounts).
  const setIntroEnabled = (next) => { setIntroEnabledState(next); _writeBool(KEYS.introEnabled, next) }
  const toggleIntro     = () => setIntroEnabled(!introEnabled)
  const setIntroTrack   = (id) => {
    if (!TRACKS.find(t => t.id === id)) return
    setIntroTrackIdState(id)
    _writeString(KEYS.introTrack, id)
  }

  return (
    <AppAudioContext.Provider value={{
      // App music
      appEnabled, toggleApp, setAppEnabled,
      appTrackId, setAppTrack, appTrack,
      // Intro audio
      introEnabled, toggleIntro, setIntroEnabled,
      introTrackId, setIntroTrack, introTrack,
      // Convenience: list of currently-unlocked tracks for the
      // Profile picker. v1 = TRACKS as-is (only 'intro' exists);
      // future = filtered by user's earned badges.
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
    // Pre-auth screens consume the hook via Profile only via
    // post-auth route, so this stub is just defensive.
    return {
      appEnabled: false, toggleApp: () => {}, setAppEnabled: () => {},
      appTrackId: DEFAULT_TRACK_ID, setAppTrack: () => {}, appTrack: null,
      introEnabled: true, toggleIntro: () => {}, setIntroEnabled: () => {},
      introTrackId: DEFAULT_TRACK_ID, setIntroTrack: () => {}, introTrack: null,
      tracks: TRACKS,
    }
  }
  return ctx
}
