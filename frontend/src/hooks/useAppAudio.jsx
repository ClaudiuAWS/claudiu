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
  // Albums + playback modes (Spotify-style):
  // - albums: user-curated playlists, [{id, name, trackIds[], createdAt}]
  // - activeAlbumId: null = "all unlocked tracks"; otherwise album id
  // - shuffle: random next-track pick when auto-advancing
  // - repeatMode: 'off' (default) | 'one' (replay current on ended)
  albums:         'appAudioAlbums',
  activeAlbumId:  'appAudioActiveAlbumId',
  shuffle:        'appAudioShuffle',
  repeatMode:     'appAudioRepeatMode',
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

function _readJSON(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    const parsed = JSON.parse(raw)
    return parsed ?? defaultValue
  } catch { return defaultValue }
}
function _writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function _uuid() {
  try { return crypto.randomUUID() } catch {
    return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

// Pure helper: given the user's albums + activeAlbumId, derive the
// ordered list of tracks the playback engine should rotate through.
// Always intersects with `!requiredBadge` so badge-locked discs never
// auto-play even if a user dragged them into an album. The default
// (activeAlbumId === null) is the full unlocked rotation, matching
// pre-album behaviour.
function _resolvePlaylist(albums, activeAlbumId) {
  const baseUnlocked = TRACKS.filter(t => !t.requiredBadge)
  if (!activeAlbumId) return baseUnlocked
  const album = (albums || []).find(a => a.id === activeAlbumId)
  if (!album || !Array.isArray(album.trackIds) || album.trackIds.length === 0) {
    return baseUnlocked
  }
  const ids = new Set(album.trackIds)
  const ordered = baseUnlocked.filter(t => ids.has(t.id))
  return ordered.length > 0 ? ordered : baseUnlocked
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

  // Spotify-style state
  const [albums,         setAlbumsState]         = useState(() => _readJSON(KEYS.albums, []))
  const [activeAlbumId,  setActiveAlbumIdState]  = useState(() => _readString(KEYS.activeAlbumId, '') || null)
  const [shuffle,        setShuffleState]        = useState(() => _readBool(KEYS.shuffle, false))
  const [repeatMode,     setRepeatModeState]     = useState(() => _readString(KEYS.repeatMode, 'off'))

  // Refs mirror the playback-mode state so the `ended` listener (set up
  // once per appTrackId/appEnabled change) can read the LATEST values
  // when a track finishes — without re-creating the listener (and
  // restarting playback) every time the user toggles shuffle/repeat or
  // edits an album mid-track.
  const albumsRef        = useRef(albums)
  const activeAlbumIdRef = useRef(activeAlbumId)
  const shuffleRef       = useRef(shuffle)
  const repeatModeRef    = useRef(repeatMode)
  useEffect(() => { albumsRef.current        = albums        }, [albums])
  useEffect(() => { activeAlbumIdRef.current = activeAlbumId }, [activeAlbumId])
  useEffect(() => { shuffleRef.current       = shuffle       }, [shuffle])
  useEffect(() => { repeatModeRef.current    = repeatMode    }, [repeatMode])

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

    // FIFA-style auto-advance: when the current track ends, decide what
    // plays next based on:
    //   - repeatMode === 'one' → replay the same track (fastest path)
    //   - shuffle === true     → random pick from active playlist
    //   - default              → sequential within active playlist, wrap
    //
    // Active playlist comes from `_resolvePlaylist` which folds in the
    // user's selected album (or null = all-unlocked). Albums that filter
    // down to nothing safely fall back to the full unlocked rotation.
    const onEnded = () => {
      if (repeatModeRef.current === 'one') {
        try { a.currentTime = 0; a.play() } catch {}
        return
      }
      const playlist = _resolvePlaylist(albumsRef.current, activeAlbumIdRef.current)
      if (playlist.length <= 1) return

      let next
      if (shuffleRef.current) {
        // Pick a random track other than the current one. With only 2
        // tracks this is deterministic (the "other one"), which is fine.
        const candidates = playlist.filter(t => t.id !== appTrackId)
        next = candidates[Math.floor(Math.random() * candidates.length)]
      } else {
        const idx = playlist.findIndex(t => t.id === appTrackId)
        next = playlist[(idx + 1) % playlist.length]
      }
      if (next && next.id !== appTrackId) {
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

  // Temporary volume ramp on the underlying <audio> element WITHOUT
  // persisting to localStorage. Used by ducking flows (e.g. the match-end
  // celebration mutes the app music for the duration of the celebration
  // song, then restores). Ramping the persisted volume via setAppVolume
  // would overwrite the user's saved preference.
  //
  // Resolves once the ramp finishes. When `to === 0` the element is
  // paused at the end; when `to > 0` and the element is paused, play()
  // is called before the ramp starts.
  const fadeAppMusic = ({ to = 0, durationMs = 800 } = {}) => {
    const a = audioRef.current
    if (!a) return Promise.resolve()
    const target = Math.min(1, Math.max(0, Number(to) || 0))
    return new Promise((resolve) => {
      const from = a.volume
      if (target > 0 && a.paused) {
        a.volume = 0
        try { a.play().catch(() => {}) } catch {}
      }
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - start) / Math.max(1, durationMs))
        a.volume = from + (target - from) * t
        if (t < 1) requestAnimationFrame(tick)
        else {
          if (target === 0) {
            try { a.pause() } catch {}
          }
          resolve()
        }
      }
      requestAnimationFrame(tick)
    })
  }

  // Intro toggle (sound on/off only — no track override)
  const setIntroEnabled = (next) => { setIntroEnabledState(next); _writeBool(KEYS.introEnabled, next) }
  const toggleIntro     = () => setIntroEnabled(!introEnabled)

  // -----------------------------------------------------------------
  // Albums + playback modes (Spotify-style)
  // -----------------------------------------------------------------

  const _persistAlbums = (next) => { setAlbumsState(next); _writeJSON(KEYS.albums, next) }

  const createAlbum = (name) => {
    const cleanName = (name || '').trim() || `Album ${albums.length + 1}`
    const album = {
      id:        _uuid(),
      name:      cleanName,
      trackIds:  [],
      createdAt: new Date().toISOString(),
    }
    _persistAlbums([...albums, album])
    return album.id
  }

  const deleteAlbum = (id) => {
    const next = albums.filter(a => a.id !== id)
    _persistAlbums(next)
    if (activeAlbumId === id) setActiveAlbum(null)
  }

  const renameAlbum = (id, newName) => {
    const cleanName = (newName || '').trim()
    if (!cleanName) return
    _persistAlbums(albums.map(a => a.id === id ? { ...a, name: cleanName } : a))
  }

  // Toggle a track in/out of an album. Idempotent — calling twice with
  // the same trackId leaves the album in its original state.
  const toggleAlbumTrack = (albumId, trackId) => {
    _persistAlbums(albums.map(a => {
      if (a.id !== albumId) return a
      const has = a.trackIds.includes(trackId)
      return {
        ...a,
        trackIds: has ? a.trackIds.filter(t => t !== trackId) : [...a.trackIds, trackId],
      }
    }))
  }

  // Setting the active album to `null` reverts to the all-unlocked
  // rotation. Setting to a specific id also jumps playback to the first
  // track of that album so the user gets immediate feedback.
  const setActiveAlbum = (id) => {
    setActiveAlbumIdState(id || null)
    _writeString(KEYS.activeAlbumId, id || '')
    if (id) {
      const album = albums.find(a => a.id === id)
      if (album && album.trackIds.length > 0) {
        const first = TRACKS.find(t => t.id === album.trackIds[0] && !t.requiredBadge)
        if (first && first.id !== appTrackId) {
          _writePosition(first.id, 0)
          setAppTrackIdState(first.id)
          _writeString(KEYS.appTrack, first.id)
        }
      }
    }
  }

  const toggleShuffle = () => {
    const next = !shuffle
    setShuffleState(next)
    _writeBool(KEYS.shuffle, next)
  }

  // Three-way cycle: off → one → off. (Spotify also offers "all" but our
  // sequential mode already wraps, so "all" is implicit.)
  const cycleRepeatMode = () => {
    const next = repeatMode === 'one' ? 'off' : 'one'
    setRepeatModeState(next)
    _writeString(KEYS.repeatMode, next)
  }

  return (
    <AppAudioContext.Provider value={{
      // App music
      appEnabled, toggleApp, setAppEnabled,
      appTrackId, setAppTrack, appTrack,
      appVolume, setAppVolume, fadeAppMusic,
      // Intro audio (toggle only)
      introEnabled, toggleIntro, setIntroEnabled,
      // List of currently-unlocked tracks for the Profile picker.
      tracks: TRACKS,
      // Albums + playback modes
      albums, activeAlbumId,
      createAlbum, deleteAlbum, renameAlbum,
      toggleAlbumTrack, setActiveAlbum,
      shuffle, toggleShuffle,
      repeatMode, cycleRepeatMode,
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
      appVolume: TARGET_VOLUME, setAppVolume: () => {}, fadeAppMusic: () => Promise.resolve(),
      introEnabled: true, toggleIntro: () => {}, setIntroEnabled: () => {},
      tracks: TRACKS,
      albums: [], activeAlbumId: null,
      createAlbum: () => {}, deleteAlbum: () => {}, renameAlbum: () => {},
      toggleAlbumTrack: () => {}, setActiveAlbum: () => {},
      shuffle: false, toggleShuffle: () => {},
      repeatMode: 'off', cycleRepeatMode: () => {},
    }
  }
  return ctx
}
