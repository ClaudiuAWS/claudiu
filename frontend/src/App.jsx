import { Routes, Route, Navigate } from 'react-router-dom'
import { Component, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import TopNav from './components/TopNav'
import ToastProvider from './components/ToastProvider'
import IntroSplash from './components/IntroSplash'
import AuthLayout from './components/AuthLayout'
import { AppAudioProvider } from './hooks/useAppAudio'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ConfirmPage from './pages/ConfirmPage'
import HomePage from './pages/HomePage'
import LobbyPage from './pages/LobbyPage'
import MatchPage from './pages/MatchPage'
import FriendsPage from './pages/FriendsPage'
import ProfilePage from './pages/ProfilePage'
import BadgesPage from './pages/BadgesPage'
import HistoryPage from './pages/HistoryPage'
import LeaderboardPage from './pages/LeaderboardPage'
import TracksPage from './pages/TracksPage'
import BreznShopPage from './pages/BreznShopPage'
import InvitePage from './pages/InvitePage'
import InviteListener from './components/InviteListener'
import BadgeListener from './components/BadgeListener'
import PendingInviteConsumer from './components/PendingInviteConsumer'
import { InventoryProvider } from './hooks/useInventory'

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
  // AppAudioProvider mounts a single <audio> element scoped to the
  // post-auth area. The login/register screens have their own ambient
  // audio via `useBgAmbientAudio` and are outside Layout, so the two
  // sources never play simultaneously.
  //
  // InventoryProvider sits inside Layout (post-auth only) so the shop +
  // cosmetic consumers (frame around avatars, name colour, premium
  // disc gating) all share one fetch.
  <AppAudioProvider>
    <InventoryProvider>
      <PendingInviteConsumer />
      <TopNav />
      <div className="pt-16 pb-24">
        {children}
      </div>
      <BottomNav />
    </InventoryProvider>
  </AppAudioProvider>
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
      <BadgeListener />
      {showIntro && <IntroSplash onFinish={() => setShowIntro(false)} />}
      <ErrorBoundary>
        <Routes>
          {/* Auth pages share a single <AuthLayout/> so the bg video
              survives navigation between /login, /register, and
              /confirm — only the form swaps via the nested <Outlet/>. */}
          <Route element={user ? <Navigate to="/" replace /> : <AuthLayout />}>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/confirm"  element={<ConfirmPage />} />
          </Route>

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
            <ProtectedRoute><Layout><BadgesPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/history" element={
            <ProtectedRoute><Layout><HistoryPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/leaderboard" element={
            <ProtectedRoute><Layout><LeaderboardPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/profile" element={
            <ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>
          }/>
          <Route path="/tracks" element={
            <ProtectedRoute><Layout><TracksPage /></Layout></ProtectedRoute>
          }/>
          <Route path="/shop" element={
            <ProtectedRoute><Layout><BreznShopPage /></Layout></ProtectedRoute>
          }/>

          {/* Invite link — public route. Decides whether to auto-friend
              (logged in) or stash the inviter for after signup. */}
          <Route path="/invite/:inviterUserId" element={<InvitePage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}
