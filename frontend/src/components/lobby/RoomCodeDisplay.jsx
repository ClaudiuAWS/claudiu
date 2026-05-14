import { useState } from 'react'

export default function RoomCodeDisplay({ code }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      className="w-full rounded-3xl p-6 text-center transition-all active:scale-[0.98]"
      style={{ background: 'linear-gradient(145deg,#111827,#0d1117)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-3">Room Code</p>
      <p className="text-white font-bold tracking-[0.3em] text-4xl">{code}</p>
      <p className="text-gray-600 text-xs mt-3 transition-colors">
        {copied ? <span className="text-red-400">Copied!</span> : 'Tap to copy · Share with your squad'}
      </p>
    </button>
  )
}
