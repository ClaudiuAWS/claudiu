import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
    try {
      await resendCode(email)
      setResent(true)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-white text-3xl font-bold text-center mb-2">
          Check your email
        </h1>
        <p className="text-gray-400 text-center mb-8">
          We sent a code to {email}
        </p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Confirmation code"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-green-500 text-center text-2xl tracking-widest"
            maxLength={6}
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          {resent && (
            <p className="text-green-400 text-sm text-center">Code resent!</p>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full bg-green-500 text-black font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>

          <button
            onClick={handleResend}
            className="w-full text-gray-400 text-sm py-2"
          >
            Resend code
          </button>
        </div>
      </div>
    </div>
  )
}