import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  resendSignUpCode,
} from 'aws-amplify/auth'

export const register = async (email, password, displayName) => {
  return signUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
        name: displayName,
      }
    }
  })
}

export const confirmRegistration = async (email, code) => {
  return confirmSignUp({
    username: email,
    confirmationCode: code,
  })
}

export const resendCode = async (email) => {
  return resendSignUpCode({ username: email })
}

export const login = async (email, password) => {
  return signIn({ username: email, password })
}

export const logout = async () => {
  return signOut()
}

export const getUser = async () => {
  try {
    const user = await getCurrentUser()
    const session = await fetchAuthSession()
    const claims = session.tokens?.idToken?.payload
    return {
      userId: user.userId,
      email: claims?.email,
      displayName: claims?.name,
    }
  } catch {
    return null
  }
}

export const getAccessToken = async () => {
  try {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString()
  } catch {
    return null
  }
}

export const isAuthenticated = async () => {
  const user = await getUser()
  return user !== null
}