import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  resendSignUpCode,
} from 'aws-amplify/auth'
import { logger } from './logger'

export const register = async (email, password, displayName) => {
  logger.info('Auth', 'Registering user', { email, displayName })
  return signUp({
    username: email,
    password,
    options: {
      userAttributes: { email, name: displayName }
    }
  })
}

export const confirmRegistration = async (email, code) => {
  logger.info('Auth', 'Confirming registration', { email })
  return confirmSignUp({ username: email, confirmationCode: code })
}

export const resendCode = async (email) => {
  logger.info('Auth', 'Resending confirmation code', { email })
  return resendSignUpCode({ username: email })
}

export const login = async (email, password) => {
  logger.info('Auth', 'Signing in', { email })
  return signIn({ username: email, password })
}

export const logout = async () => {
  logger.info('Auth', 'Signing out')
  return signOut()
}

export const getUser = async () => {
  try {
    const user = await getCurrentUser()
    const session = await fetchAuthSession()
    const claims = session.tokens?.idToken?.payload
    const profile = {
      userId: user.userId,
      email: claims?.email,
      displayName: claims?.name,
      avatarUrl: claims?.['custom:avatar_url'] || null,
    }
    logger.info('Auth', 'Got current user', profile)
    return profile
  } catch {
    logger.warn('Auth', 'No authenticated user')
    return null
  }
}

export const getAccessToken = async () => {
  try {
    const session = await fetchAuthSession()
    return session.tokens?.idToken?.toString()  // ID token, not access token
  } catch {
    logger.error('Auth', 'Failed to get access token')
    return null
  }
}

export const isAuthenticated = async () => {
  const user = await getUser()
  return user !== null
}