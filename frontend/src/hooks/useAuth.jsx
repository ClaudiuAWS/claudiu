import { useState, useEffect, createContext, useContext } from 'react'
import { getUser, logout } from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUser()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  const refreshUser = async () => {
    const u = await getUser(true)
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout: handleLogout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)