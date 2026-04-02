import { fetchAuthSession } from 'aws-amplify/auth'
import { logger } from './logger'
import { getAccessToken } from './auth'

const API_URL = import.meta.env.VITE_API_URL

const getToken = async () => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  console.log(token)
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
  create: (matchId) => request('/rooms', 'POST', { matchId }),
  get: (roomCode) => request(`/rooms/${roomCode}`),
  join: (roomCode) => request(`/rooms/${roomCode}/join`, 'POST'),
}