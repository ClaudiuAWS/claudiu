import { logger } from './logger'
import { getAccessToken } from './auth'

const API_URL = import.meta.env.VITE_API_URL

const request = async (path, method = 'GET', body = null) => {
  logger.info('API', `${method} ${path}`, body ?? undefined)

  const token = await getAccessToken()

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) })
  })

  let data
  try {
    data = await res.json()
  } catch {
    data = { error: 'Invalid response from server' }
  }

  if (!res.ok) {
    logger.error('API', `${method} ${path} failed ${res.status}`, data)
    throw new Error(data.error || data.message || 'Request failed')
  }

  logger.success('API', `${method} ${path} ${res.status}`, data)
  return data
}

export const roomsApi = {
  create: (matchId) => request('/rooms', 'POST', { matchId }),
  get: (roomCode) => request(`/rooms/${roomCode}`),
  join: (roomCode) => request(`/rooms/${roomCode}/join`, 'POST'),
  leave: (roomCode) => request(`/rooms/${roomCode}/leave`, 'DELETE'),
}