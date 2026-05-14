import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { confirmRegistration, resendCode } from '../services/auth'

export default function ConfirmPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || ''

  const handleConfirm = async () => {
    if (!code) return
    setLoading(true)
    setError('')
    try {
      await confirmRegistration(email, code)
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setResent(false)
    try {
      await resendCode(email)
      setResent(true)
    } catch (err) {
      setError(err.message)
    }
  }

  // Outer wrapper + bg video live in AuthLayout; this page is just
  // the brand stack + glass card, same composition as Login/Register.
  return (
    <>
      {/* Logo / Brand */}
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
          FANTASY
        </p>
        <p className="text-white/80 text-sm mt-3 [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
          Verify your email
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
        <div className="text-center">
          <p className="text-white text-sm font-semibold">
            We sent a 6-digit code to
          </p>
          <p className="text-red-300 text-sm font-medium break-all mt-0.5">
            {email || 'your inbox'}
          </p>
        </div>

        <div>
          <label className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 block text-center">
            Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            maxLength={6}
            className="font-stadium tabular-nums w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-red-500/60 focus:bg-white/[0.07] transition-all placeholder:text-white/20 text-center"
            style={{ fontSize: '2rem', letterSpacing: '0.5em', paddingRight: 'calc(1rem - 0.5em)' }}
          />
        </div>

        {/* Spam-folder hint — until the SES email config ships,
            verification mail lands in spam for most providers. */}
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{
            background: 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.30)',
          }}
        >
          <span className="text-amber-300 text-sm leading-none mt-0.5">⚠️</span>
          <p className="text-amber-200/90 text-[11px] leading-snug">
            Don't see it? Check your <span className="font-semibold">spam</span> or promotions folder — the code sometimes lands there.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            <p className="text-red-400 text-xs text-center">{error}</p>
          </div>
        )}

        {resent && !error && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5">
            <p className="text-emerald-300 text-xs text-center">
              ✓ New code sent — check your inbox (and spam).
            </p>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={loading || code.length < 6}
          className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all disabled:opacity-50 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            boxShadow: '0 8px 24px -4px rgba(220,38,38,0.45)',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying…
            </span>
          ) : 'Verify'}
        </button>
      </div>

      <p className="text-white/80 text-center text-sm mt-6 [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
        Didn't receive it?{' '}
        <button
          type="button"
          onClick={handleResend}
          className="text-red-400 font-medium hover:text-red-300 transition-colors [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]"
        >
          Resend code
        </button>
      </p>

      <p className="text-white/60 text-center text-xs mt-3 [text-shadow:_0_1px_4px_rgba(0,0,0,0.6)]">
        Wrong email?{' '}
        <Link to="/register" className="text-white/80 hover:text-white underline-offset-2 hover:underline transition-colors">
          Start over
        </Link>
      </p>
    </>
  )
}
