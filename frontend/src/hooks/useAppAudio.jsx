import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { TRACKS, DEFAULT_TRACK_ID, getTrackById } from '../utils/tracks'

/**
 * App-wide background music.
 *
 * Mounts a single `<audio>` element via the provider and exposes the
 * playback controls through a React context so any component (the
 * Profile toggle, future badge-unlocked song picker, etc.) can read
 * the current state and flip enabled / track without each tab needing
 * its own audio element.
 *
 * Design choices:
 * - Volume locked to 0.2 — the exact ambient level `useBgAmbientAudio`
 *   sets on the login screen, so the audio handover when the user
 *   signs in feels continuous (login video unmounts, this picks up at
 *   the same loudness).
 * - localStorage key `appAudioEnabled` persists the on/off pref across
 *   sessions; `appAudioTrackId` remembers which song the user chose.
 * - Autoplay-safe: if `audio.play()` rejects (Safari first-load /
 *   no-prior-gesture blocks), a one-shot `pointerdown` listener
 *   retries on the next user interaction.
 * - Provider should be mounted *inside* the post-auth `Layout` only —
 *   the login/register screens have their own ambient audio
 *   (`useBgAmbientAudio`); we don't want both playing at once.
 *
 * The actual mp3 files live under `frontend/public/songs/` (registry
 * in `utils/tracks.js`). If a file is missing, the audio element
 * silently 404s — UI stays usable, no errors thrown.
 */

const TARGET_VOLUME = 0.2

const STORAGE_ENABLED = 'appAudioEnabled'
const STORAGE_TRACK   = 'appAudioTrackId'

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

const AppAudioContext = createContext(null)

export function AppAudioProvider({ children }) {
  const audioRef = useRef(null)
  const [enabled,   setEnabledState]   = useState(() => _readBool(STORAGE_ENABLED, true))
  const [trackId,   setTrackIdState]   = useState(() => _readString(STORAGE_TRACK,  DEFAULT_TRACK_ID))

  const track = getTrackById(trackId)

  // Wire the audio element once on mount. Volume + loop are fixed;
  // src is reactive to the trackId state.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = TARGET_VOLUME
    a.loop   = true
  }, [])

  // (Re)load + play whenever enabled flips on or the chosen track
  // changes. Handles autoplay-policy rejection by deferring to the
  // next user gesture.
  useEffect(() => {
    const a = audioRef.current
    if (!a || !track) return

    if (!enabled) {
      try { a.pause() } catch {}
      return
    }

    // Only swap the src if it actually changed — avoids re-triggering
    // playback on every render and clears `currentTime` only when
    // moving to a different file.
    const targetSrc = track.file
    if (!a.src.endsWith(targetSrc)) {
      a.src = targetSrc
    }

    const attemptPlay = () => {
      const p = a.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay blocked — retry on first user gesture.
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
  }, [enabled, trackId, track])

  const setEnabled = (next) => {
    setEnabledState(next)
    _writeBool(STORAGE_ENABLED, next)
  }
  const toggle = () => setEnabled(!enabled)
  const setTrack = (id) => {
    if (!TRACKS.find(t => t.id === id)) return
    setTrackIdState(id)
    _writeString(STORAGE_TRACK, id)
  }

  return (
    <AppAudioContext.Provider value={{
      enabled,
      setEnabled,
      toggle,
      currentTrack: track,
      trackId,
      setTrack,
    }}>
      {/* The single <audio> element. Hidden — no controls in the UI.
          src is set in the effect above so we can swap tracks
          without re-mounting the element. */}
      <audio ref={audioRef} preload="auto" playsInline />
      {children}
    </AppAudioContext.Provider>
  )
}

export function useAppAudio() {
  const ctx = useContext(AppAudioContext)
  if (!ctx) {
    // Allow consumers (e.g. ProfilePage) to render even when the
    // provider isn't mounted (e.g. on pre-auth screens) — they just
    // get a no-op stub.
    return {
      enabled:      false,
      setEnabled:   () => {},
      toggle:       () => {},
      currentTrack: null,
      trackId:      DEFAULT_TRACK_ID,
      setTrack:     () => {},
    }
  }
  return ctx
}
