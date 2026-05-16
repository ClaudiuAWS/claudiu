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
        <img
          src="/logo-brezn-bf.png"
          alt="Bundesliga Brezn"
          className="mx-auto block drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
          style={{ width: 160, height: 'auto' }}
        />
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

        {/* Spam-folder hint — glossy red panel matching the brand. */}
        <div className="relative overflow-hidden rounded-xl">
          {/* Top sheen */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />
          <div
            className="relative flex items-start gap-3 px-3.5 py-3"
            style={{
              background: 'linear-gradient(180deg, rgba(40,12,12,0.65) 0%, rgba(20,6,6,0.7) 100%)',
              border: '1px solid rgba(220,38,38,0.30)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 16px -8px rgba(220,38,38,0.45)',
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.45) 0%, rgba(127,29,29,0.35) 100%)',
                border: '1px solid rgba(248,113,113,0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <span className="text-base leading-none">✉</span>
            </div>
            <div className="min-w-0">
              <p
                className="text-red-100 text-[11px] font-bold tracking-widest uppercase"
                style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
              >
                Don't see it?
              </p>
              <p className="text-white/70 text-[11px] leading-snug mt-0.5">
                Check your <span className="text-red-300 font-semibold">spam</span> or promotions folder. Gmail occasionally routes verification codes there. Marking the email as <span className="text-red-300 font-semibold">"Not spam"</span> fixes it for next time.
              </p>
            </div>
          </div>
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
