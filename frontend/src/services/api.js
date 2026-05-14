import { fetchAuthSession } from 'aws-amplify/auth'
import { logger } from './logger'

const API_URL = import.meta.env.VITE_API_URL

const getToken = async () => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  return token
}

const request = async (path, method = 'GET', body = null) => {
  logger.info('API', `${method} ${path}`, body ?? undefined)

  const token = await getToken()

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) })
  })

  const data = await res.json()

  if (!res.ok) {
    logger.error('API', `${method} ${path} failed ${res.status}`, data)
    throw new Error(data.error || data.message || 'Request failed')
  }

  logger.success('API', `${method} ${path} ${res.status}`, data)
  return data
}

export const roomsApi = {
  create:      (matchId)            => request('/rooms', 'POST', { matchId }),
  get:         (roomCode)           => request(`/rooms/${roomCode}`),
  join:        (roomCode)           => request(`/rooms/${roomCode}/join`, 'POST'),
  leave:       (roomCode)           => request(`/rooms/${roomCode}/leave`, 'DELETE'),
  sendMessage: (roomCode, text)     => request(`/rooms/${roomCode}/message`, 'POST', { text }),
  selectTeam:  (roomCode, playerIds) => request(`/rooms/${roomCode}/team`, 'POST', { playerIds }),
  startMatch:  (roomCode, speedMultiplier = 5) => request(`/rooms/${roomCode}/start`, 'POST', { speedMultiplier }),
  postMinigameScore: (roomCode, payload) => request(`/rooms/${roomCode}/minigame-score`, 'POST', payload),
  draftReady:  (roomCode)                   => request(`/rooms/${roomCode}/draft-ready`, 'POST'),
  draftPick:   (roomCode, pairIndex, playerId) => request(`/rooms/${roomCode}/draft-pick`, 'POST', { pairIndex, playerId }),
  directorTick: (roomCode, snapshot)        => request(`/rooms/${roomCode}/director-tick`, 'POST', { snapshot }),
  react:        (roomCode, eventId, reactionType) => request(`/rooms/${roomCode}/react`, 'POST', { eventId, reactionType }),
}

export const matchesApi = {
  list:       ()        => request('/matches'),
  get:        (matchId) => request(`/matches/${matchId}`),
  getEvents:  (matchId) => request(`/matches/${matchId}/events`),
  getPlayers: (matchId) => request(`/matches/${matchId}/players`),
}

export const profileApi = {
  getUploadUrl: (contentType) => request('/profile/avatar-upload-url', 'POST', { contentType }),
  update:       (avatarUrl)   => request('/profile', 'PUT', { avatarUrl }),
}

export const friendsApi = {
  list:   ()         => request('/friends'),
  add:    (email)    => request('/friends', 'POST', { email }),
  accept: (friendId) => request(`/friends/${friendId}/accept`, 'POST'),
  remove: (friendId) => request(`/friends/${friendId}`, 'DELETE'),
}