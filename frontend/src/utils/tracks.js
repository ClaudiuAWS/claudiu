/**
 * Track registry — single source of truth for app background music.
 *
 * Each track has a corresponding `<id>.mp3` in `frontend/public/songs/`.
 * Spotify-sourced entries also have a downloaded album cover at
 * `<file_stem>.jpg` which DiscArtwork renders as the disc label.
 *
 * Three tracks (Pitbull "We Are One", Kwabs "Walk", Shakira "Waka Waka")
 * are gated by badges — they're rewards for hat-trick / quiz-master /
 * first-win achievements. Until the user earns the corresponding badge,
 * they show locked on TracksPage and don't appear in the FIFA-style
 * auto-advance playlist (which filters by `!requiredBadge`).
 *
 * Audio licensing note: every Spotify-sourced track is copyrighted
 * music sourced via yt-dlp for development purposes only. See
 * README.md "Music & copyright" for the production-swap path.
 */

export const TRACKS = [
  // ---- Default unlocked: intro + 25 of the 28 user-provided tracks
  // (the other 3 are below as badge-rewards). ----
  {
    id:            'intro',
    title:         'A Fresh Energy',
    artist:        'Gaskin',
    file:          '/songs/intro.mp3',
    artwork:       '/songs/intro.jpg',
    requiredBadge: null,
  },
  { id: 'avicii-the-nights', title: 'The Nights', artist: 'Avicii', file: '/songs/avicii-the-nights.mp3', artwork: '/songs/avicii-the-nights.jpg', requiredBadge: null },
  { id: 'john-newman-love-me-again', title: 'Love Me Again', artist: 'John Newman', file: '/songs/john-newman-love-me-again.mp3', artwork: '/songs/john-newman-love-me-again.jpg', requiredBadge: null },
  { id: 'inna-hot', title: 'Hot', artist: 'INNA', file: '/songs/inna-hot.mp3', artwork: '/songs/inna-hot.jpg', requiredBadge: null },
  { id: 'inna-sun-is-up', title: 'Sun Is Up', artist: 'INNA', file: '/songs/inna-sun-is-up.mp3', artwork: '/songs/inna-sun-is-up.jpg', requiredBadge: null },
  { id: 'inna-amazing', title: 'Amazing', artist: 'INNA', file: '/songs/inna-amazing.mp3', artwork: '/songs/inna-amazing.jpg', requiredBadge: null },
  { id: 'inna-deja-vu', title: 'Deja Vu', artist: 'INNA', file: '/songs/inna-deja-vu.mp3', artwork: '/songs/inna-deja-vu.jpg', requiredBadge: null },
  { id: 'saint-motel-my-type', title: 'My Type', artist: 'Saint Motel', file: '/songs/saint-motel-my-type.mp3', artwork: '/songs/saint-motel-my-type.jpg', requiredBadge: null },
  { id: 'empire-of-the-sun-alive', title: 'Alive', artist: 'Empire Of The Sun', file: '/songs/empire-of-the-sun-alive.mp3', artwork: '/songs/empire-of-the-sun-alive.jpg', requiredBadge: null },
  { id: 'milky-chance-down-by-the-river', title: 'Down By The River', artist: 'Milky Chance', file: '/songs/milky-chance-down-by-the-river.mp3', artwork: '/songs/milky-chance-down-by-the-river.jpg', requiredBadge: null },
  { id: 'jungle-busy-earnin', title: "Busy Earnin'", artist: 'Jungle', file: '/songs/jungle-busy-earnin.mp3', artwork: '/songs/jungle-busy-earnin.jpg', requiredBadge: null },
  { id: 'major-lazer-que-calor', title: 'Que Calor', artist: 'Major Lazer', file: '/songs/major-lazer-que-calor.mp3', artwork: '/songs/major-lazer-que-calor.jpg', requiredBadge: null },
  { id: 'john-newman-tiring-game', title: 'Tiring Game', artist: 'John Newman', file: '/songs/john-newman-tiring-game.mp3', artwork: '/songs/john-newman-tiring-game.jpg', requiredBadge: null },
  { id: 'shakira-loca', title: 'Loca', artist: 'Shakira', file: '/songs/shakira-loca.mp3', artwork: '/songs/shakira-loca.jpg', requiredBadge: null },
  { id: 'pitbull-fireball', title: 'Fireball', artist: 'Pitbull', file: '/songs/pitbull-fireball.mp3', artwork: '/songs/pitbull-fireball.jpg', requiredBadge: null },
  { id: 'joao-lucas-marcelo-eu-quero-tchu', title: 'Eu Quero Tchu Eu Quero Tcha', artist: 'Joao Lucas & Marcelo', file: '/songs/joao-lucas-and-marcelo-eu-quero-tchu-eu-quero-tcha.mp3', artwork: '/songs/joao-lucas-and-marcelo-eu-quero-tchu-eu-quero-tcha.jpg', requiredBadge: null },
  { id: 'gusttavo-lima-balada', title: 'Balada', artist: 'Gusttavo Lima', file: '/songs/gusttavo-lima-balada.mp3', artwork: '/songs/gusttavo-lima-balada.jpg', requiredBadge: null },
  { id: 'los-latinos-bara-bara-bere-bere', title: 'Bara Bara Bere Bere', artist: 'Los Latinos', file: '/songs/los-latinos-bara-bara-bere-bere.mp3', artwork: '/songs/los-latinos-bara-bara-bere-bere.jpg', requiredBadge: null },
  { id: 'shakira-la-la-la', title: 'La La La (Brazil 2014)', artist: 'Shakira', file: '/songs/shakira-la-la-la.mp3', artwork: '/songs/shakira-la-la-la.jpg', requiredBadge: null },
  { id: 'magic-system-magic-in-the-air', title: 'Magic in the Air', artist: 'Magic System', file: '/songs/magic-system-magic-in-the-air.mp3', artwork: '/songs/magic-system-magic-in-the-air.jpg', requiredBadge: null },
  { id: 'khaled-cest-la-vie', title: "C'est La Vie", artist: 'Khaled', file: '/songs/khaled-cest-la-vie.mp3', artwork: '/songs/khaled-cest-la-vie.jpg', requiredBadge: null },
  { id: 'perreo-dance-radio-tacata', title: 'Tacata', artist: 'Perreo Dance Radio', file: '/songs/perreo-dance-radio-tacata.mp3', artwork: '/songs/perreo-dance-radio-tacata.jpg', requiredBadge: null },
  { id: 'avicii-wake-me-up', title: 'Wake Me Up', artist: 'Avicii', file: '/songs/avicii-wake-me-up.mp3', artwork: '/songs/avicii-wake-me-up.jpg', requiredBadge: null },
  { id: 'avicii-waiting-for-love', title: 'Waiting For Love', artist: 'Avicii', file: '/songs/avicii-waiting-for-love.mp3', artwork: '/songs/avicii-waiting-for-love.jpg', requiredBadge: null },
  { id: 'avicii-levels', title: 'Levels', artist: 'Avicii', file: '/songs/avicii-levels-radio-edit.mp3', artwork: '/songs/avicii-levels-radio-edit.jpg', requiredBadge: null },
  { id: 'avicii-hey-brother', title: 'Hey Brother', artist: 'Avicii', file: '/songs/avicii-hey-brother.mp3', artwork: '/songs/avicii-hey-brother.jpg', requiredBadge: null },

  // ---- Badge-locked rewards: real songs gated by achievements. ----
  // Pitbull's FIFA 2014 anthem — earned by scoring a hat trick.
  { id: 'pitbull-we-are-one', title: 'We Are One (Ole Ola)', artist: 'Pitbull', file: '/songs/pitbull-we-are-one.mp3', artwork: '/songs/pitbull-we-are-one.jpg', requiredBadge: 'hattrick' },
  // Kwabs's smooth/contemplative cut — earned by acing a Halftime Quiz.
  { id: 'kwabs-walk', title: 'Walk', artist: 'Kwabs', file: '/songs/kwabs-walk.mp3', artwork: '/songs/kwabs-walk.jpg', requiredBadge: 'quiz_master' },
  // Shakira's FIFA 2010 anthem — THE football victory song, earned by winning your first match.
  { id: 'shakira-waka-waka', title: 'Waka Waka', artist: 'Shakira', file: '/songs/shakira-waka-waka-song.mp3', artwork: '/songs/shakira-waka-waka-song.jpg', requiredBadge: 'first_win' },
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
