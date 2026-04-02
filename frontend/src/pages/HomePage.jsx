import { useAuth } from '../hooks/useAuth'

export default function HomePage() {
  const { user, logout } = useAuth()

  return (
    <div className="px-6 pt-12">
      <h1 className="text-white text-2xl font-bold">
        Welcome, {user?.displayName}
      </h1>
      <p className="text-gray-400 mt-1">{user?.email}</p>
      <button
        onClick={logout}
        className="mt-4 text-red-400 text-sm"
      >
        Sign out
      </button>
    </div>
  )
}