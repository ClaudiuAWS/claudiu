import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../services/auth'
import { useBgAmbientAudio } from '../hooks/useBgAmbientAudio'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const bgVideoRef = useBgAmbientAudio()
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
        ref={bgVideoRef}
        src="/bg-login-mobile.mp4"
        autoPlay
        loop
        muted
        playsInline
        poster="/intro-poster.jpg"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="relative w-full max-w-sm">
        {/* Logo / Brand — emblem cropped to drop the baked-in black
            BUNDESLIGA text; "BUNDESLIGA" + "MANAGER" rendered together
            as one tight white wordmark stack so the whole thing reads
            as a single integrated logo. */}
        <div className="text-center mb-8">
          <div
            className="mx-auto overflow-hidden"
            style={{ width: 88, height: 70 }}
          >
            <img
              src="/logo.png"
              alt=""
              className="block drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
              style={{ width: 88, height: 88 }}
            />
          </div>
          <p
            className="font-stadium text-white leading-[0.95] mt-1.5 [text-shadow:_0_2px_8px_rgba(0,0,0,0.7)]"
            style={{ fontSize: '1.5rem', letterSpacing: '0.14em' }}
          >
            BUNDESLIGA
          </p>
          <p
            className="font-stadium text-white leading-[0.95] [text-shadow:_0_2px_8px_rgba(0,0,0,0.7)]"
            style={{ fontSize: '1.5rem', letterSpacing: '0.14em' }}
          >
            MANAGER
          </p>
          <p className="text-white/80 text-sm mt-3 [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
            Join the game
          </p>
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
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-500/60 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 block">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-500/60 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
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
              className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-500/60 focus:bg-white/[0.07] transition-all placeholder:text-white/20"
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
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              boxShadow: '0 8px 24px -4px rgba(220,38,38,0.45)',
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

        <p className="text-white/80 text-center text-sm mt-6 [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
          Already have an account?{' '}
          <Link to="/login" className="text-red-400 font-medium hover:text-red-300 transition-colors [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
