import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../services/auth'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleRegister = async () => {
    if (!displayName || !email || !password) return
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await register(email, password, displayName)
      navigate('/confirm', { state: { email } })
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-6 overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/background-login.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black/90" />

      <div className="relative w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 mb-4 shadow-2xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" />
              <path d="M12 2C12 2 14.5 6 14.5 12S12 22 12 22" stroke="white" strokeWidth="1.5" />
              <path d="M12 2C12 2 9.5 6 9.5 12S12 22 12 22" stroke="white" strokeWidth="1.5" />
              <path d="M2.5 9h19M2.5 15h19" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Create account</h1>
          <p className="text-white/50 text-sm mt-1">Join the game</p>
        </div>

        {/* Form card */}
        <div
          className="rounded-3xl p-6 space-y-4"
          style={{
            background: 'rgba(15, 15, 20, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          <div>
            <label className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 block">Display name</label>
            <input
              type="text"
              placeholder="How others see you"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 block">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 block">Password</label>
            <input
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              <p className="text-red-400 text-xs text-center">{error}</p>
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              boxShadow: '0 8px 24px -4px rgba(34,197,94,0.3)',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account…
              </span>
            ) : 'Create Account'}
          </button>
        </div>

        <p className="text-white/40 text-center text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
