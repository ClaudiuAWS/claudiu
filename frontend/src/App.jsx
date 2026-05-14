import { Routes, Route, Navigate } from 'react-router-dom'
import { Component, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import TopNav from './components/TopNav'
import ToastProvider from './components/ToastProvider'
import IntroSplash from './components/IntroSplash'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ConfirmPage from './pages/ConfirmPage'
import HomePage from './pages/HomePage'
import LobbyPage from './pages/LobbyPage'
import MatchPage from './pages/MatchPage'
import FriendsPage from './pages/FriendsPage'
import ProfilePage from './pages/ProfilePage'
import InviteListener from './components/InviteListener'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-red-400 font-bold text-sm tracking-widest uppercase">Something went wrong</p>
          <p className="text-gray-500 text-xs text-center max-w-xs">{this.state.error.message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            className="mt-2 px-6 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold"
          >Go Home</button>
        </div>
      )
    }
    return this.props.children
  }
}

const Placeholder = ({ title }) => (
  <div className="px-6 pt-12">
    <h1 className="text-white text-2xl font-bold">{title}</h1>
    <p className="text-gray-500 mt-2">Coming soon</p>
  </div>
)

const Layout = ({ children }) => (
  <>
    <TopNav />
    <div className="pt-16 pb-24">
      {children}
    </div>
    <BottomNav />
  </>
)

export default function App() {
  const { user } = useAuth()
  const [showIntro, setShowIntro] = useState(() => {
    try { return sessionStorage.getItem('claudiu_intro_seen') !== '1' } catch { return false }
  })

  return (
    <div className="min-h-screen bg-gray-950">
      <ToastProvider />
      <InviteListener />
      {showIntro && <IntroSplash onFinish={() => setShowIntro(false)} />}
      <ErrorBoundary>
        <Routes>
          <Route path="/login"   element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
          <Route path="/confirm"  element={<ConfirmPage />} />

          <Route path="/" element={
            <ProtectedRoute><Layout><HomePage /></Layout></ProtectedRoute>
          }/>
          <Route path="/lobby/:matchId" element={
            <ProtectedRoute><Layout><LobbyPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/match/:matchId" element={
            <ProtectedRoute><Layout><MatchPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/friends" element={
            <ProtectedRoute><Layout><FriendsPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/badges" element={
            <ProtectedRoute><Layout><Placeholder title="Badges" /></Layout></ProtectedRoute>
          }/>
          <Route path="/profile" element={
            <ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>
          }/>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}
