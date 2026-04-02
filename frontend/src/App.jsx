import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ConfirmPage from './pages/ConfirmPage'
import LobbyPage from './pages/LobbyPage'
import { useAuth } from './hooks/useAuth'

const Placeholder = ({ title }) => (
  <div className="px-6 pt-12">
    <h1 className="text-white text-2xl font-bold">{title}</h1>
    <p className="text-gray-500 mt-2">Coming soon</p>
  </div>
)

const Layout = ({ children }) => (
  <div className="pb-24">
    {children}
    <BottomNav />
  </div>
)

export default function App() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950">
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/confirm"
          element={<ConfirmPage />}
        />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout><LobbyPage /></Layout>
          </ProtectedRoute>
        }/>
        <Route path="/leaderboard" element={
          <ProtectedRoute>
            <Layout><Placeholder title="Leaderboard" /></Layout>
          </ProtectedRoute>
        }/>
        <Route path="/badges" element={
          <ProtectedRoute>
            <Layout><Placeholder title="Badges" /></Layout>
          </ProtectedRoute>
        }/>
        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout><Placeholder title="Profile" /></Layout>
          </ProtectedRoute>
        }/>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}