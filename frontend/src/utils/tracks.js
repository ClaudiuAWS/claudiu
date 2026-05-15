/**
 * Track registry — single source of truth for app background music.
 *
 * Each track lives in `frontend/public/songs/<id>.mp3`. The default
 * (`intro`) ships unlocked for every user; future entries can gate on
 * a `requiredBadge` to wire up the song-disc / badge unlock flow.
 *
 * Tracks are auto-played at `volume: 0.2` (the same ambient level the
 * login screen uses via `useBgAmbientAudio`) so the transition into
 * the app from the login splash feels continuous.
 */

export const TRACKS = [
  {
    id:            'intro',
    title:         'A Fresh Energy',
    artist:        'Gaskin',
    file:          '/songs/intro.mp3',
    requiredBadge: null,   // null = default, always unlocked
  },
  // Disc-rewards — locked until the corresponding badge fires. Audio
  // files dropped into /songs/<id>.mp3 by the user; until then they
  // 404 silently and the player no-ops via the existing autoplay
  // fallback in AppAudioProvider.
  {
    id:            'disc-hattrick',
    title:         'Hat Trick Anthem',
    artist:        'TBD',
    file:          '/songs/disc-hattrick.mp3',
    requiredBadge: 'hattrick',
  },
  {
    id:            'disc-mind-games',
    title:         'Mind Games',
    artist:        'TBD',
    file:          '/songs/disc-mind-games.mp3',
    requiredBadge: 'quiz_master',
  },
  {
    id:            'disc-victory-lap',
    title:         'Victory Lap',
    artist:        'TBD',
    file:          '/songs/disc-victory-lap.mp3',
    requiredBadge: 'first_win',
  },
]

export const DEFAULT_TRACK_ID = 'intro'

export function getTrackById(id) {
  return TRACKS.find(t => t.id === id) || TRACKS.find(t => t.id === DEFAULT_TRACK_ID)
}

/**
 * Filter the catalogue to what a given user can actually play.
 * `unlockedBadgeIds` is a Set or array of badge ids the user owns.
 * Tracks without `requiredBadge` are always returned.
 */
export function getUnlockedTracks(unlockedBadgeIds = []) {
  const owned = new Set(unlockedBadgeIds)
  return TRACKS.filter(t => !t.requiredBadge || owned.has(t.requiredBadge))
}
