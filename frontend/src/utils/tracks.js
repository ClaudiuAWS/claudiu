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

  // ---- 28-track default library, downloaded via yt-dlp from the
  // user's Spotify URL list. All default-unlocked. The FIFA-style
  // auto-advance in useAppAudio loops through these in order, then
  // wraps to `intro`. See README.md "Music & copyright". ----
  { "id": "avicii-the-nights", "title": "The Nights", "artist": "Avicii", "file": "/songs/avicii-the-nights.mp3", "requiredBadge": null },
  { "id": "john-newman-love-me-again", "title": "Love Me Again", "artist": "John Newman", "file": "/songs/john-newman-love-me-again.mp3", "requiredBadge": null },
  { "id": "inna-hot", "title": "Hot", "artist": "INNA", "file": "/songs/inna-hot.mp3", "requiredBadge": null },
  { "id": "inna-sun-is-up", "title": "Sun Is Up", "artist": "INNA", "file": "/songs/inna-sun-is-up.mp3", "requiredBadge": null },
  { "id": "inna-amazing", "title": "Amazing", "artist": "INNA", "file": "/songs/inna-amazing.mp3", "requiredBadge": null },
  { "id": "inna-deja-vu", "title": "Deja Vu", "artist": "INNA", "file": "/songs/inna-deja-vu.mp3", "requiredBadge": null },
  { "id": "kwabs-walk", "title": "Walk", "artist": "Kwabs", "file": "/songs/kwabs-walk.mp3", "requiredBadge": null },
  { "id": "saint-motel-my-type", "title": "My Type", "artist": "Saint Motel", "file": "/songs/saint-motel-my-type.mp3", "requiredBadge": null },
  { "id": "empire-of-the-sun-alive", "title": "Alive", "artist": "Empire Of The Sun", "file": "/songs/empire-of-the-sun-alive.mp3", "requiredBadge": null },
  { "id": "milky-chance-down-by-the-river", "title": "Down By The River", "artist": "Milky Chance", "file": "/songs/milky-chance-down-by-the-river.mp3", "requiredBadge": null },
  { "id": "jungle-busy-earnin", "title": "Busy Earnin'", "artist": "Jungle", "file": "/songs/jungle-busy-earnin.mp3", "requiredBadge": null },
  { "id": "major-lazer-que-calor", "title": "Que Calor", "artist": "Major Lazer", "file": "/songs/major-lazer-que-calor.mp3", "requiredBadge": null },
  { "id": "john-newman-tiring-game", "title": "Tiring Game", "artist": "John Newman", "file": "/songs/john-newman-tiring-game.mp3", "requiredBadge": null },
  { "id": "shakira-waka-waka", "title": "Waka Waka", "artist": "Shakira", "file": "/songs/shakira-waka-waka-song.mp3", "requiredBadge": null },
  { "id": "shakira-loca", "title": "Loca", "artist": "Shakira", "file": "/songs/shakira-loca.mp3", "requiredBadge": null },
  { "id": "pitbull-fireball", "title": "Fireball", "artist": "Pitbull", "file": "/songs/pitbull-fireball.mp3", "requiredBadge": null },
  { "id": "pitbull-we-are-one", "title": "We Are One (Ole Ola)", "artist": "Pitbull", "file": "/songs/pitbull-we-are-one.mp3", "requiredBadge": null },
  { "id": "joao-lucas-marcelo-eu-quero-tchu", "title": "Eu Quero Tchu Eu Quero Tcha", "artist": "Joao Lucas & Marcelo", "file": "/songs/joao-lucas-and-marcelo-eu-quero-tchu-eu-quero-tcha.mp3", "requiredBadge": null },
  { "id": "gusttavo-lima-balada", "title": "Balada", "artist": "Gusttavo Lima", "file": "/songs/gusttavo-lima-balada.mp3", "requiredBadge": null },
  { "id": "los-latinos-bara-bara-bere-bere", "title": "Bara Bara Bere Bere", "artist": "Los Latinos", "file": "/songs/los-latinos-bara-bara-bere-bere.mp3", "requiredBadge": null },
  { "id": "shakira-la-la-la", "title": "La La La (Brazil 2014)", "artist": "Shakira", "file": "/songs/shakira-la-la-la.mp3", "requiredBadge": null },
  { "id": "magic-system-magic-in-the-air", "title": "Magic in the Air", "artist": "Magic System", "file": "/songs/magic-system-magic-in-the-air.mp3", "requiredBadge": null },
  { "id": "khaled-cest-la-vie", "title": "C'est La Vie", "artist": "Khaled", "file": "/songs/khaled-cest-la-vie.mp3", "requiredBadge": null },
  { "id": "perreo-dance-radio-tacata", "title": "Tacata", "artist": "Perreo Dance Radio", "file": "/songs/perreo-dance-radio-tacata.mp3", "requiredBadge": null },
  { "id": "avicii-wake-me-up", "title": "Wake Me Up", "artist": "Avicii", "file": "/songs/avicii-wake-me-up.mp3", "requiredBadge": null },
  { "id": "avicii-waiting-for-love", "title": "Waiting For Love", "artist": "Avicii", "file": "/songs/avicii-waiting-for-love.mp3", "requiredBadge": null },
  { "id": "avicii-levels", "title": "Levels", "artist": "Avicii", "file": "/songs/avicii-levels-radio-edit.mp3", "requiredBadge": null },
  { "id": "avicii-hey-brother", "title": "Hey Brother", "artist": "Avicii", "file": "/songs/avicii-hey-brother.mp3", "requiredBadge": null },

  // ---- Locked disc-reward stubs (require badges + audio files
  // not yet provided). Stay grayed-out on TracksPage. ----
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
