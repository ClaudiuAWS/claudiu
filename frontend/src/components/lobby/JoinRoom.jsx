import { useState } from 'react'

export default function JoinRoom({ onJoin, onSwitch, loading }) {
  const [code, setCode] = useState('')
  const ready = code.length === 6

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="XXXXXX"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        onKeyDown={e => e.key === 'Enter' && ready && onJoin(code)}
        maxLength={6}
        disabled={loading}
        autoFocus
        className="w-full py-5 rounded-2xl text-center text-3xl font-bold tracking-[0.3em] text-white bg-transparent outline-none transition-all disabled:opacity-50 placeholder:text-gray-700"
        style={{ border: `1px solid ${ready ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`, background: 'rgba(255,255,255,0.03)' }}
      />

      <button
        onClick={() => onJoin(code)}
        disabled={loading || !ready}
        className="w-full bg-green-500 text-black font-bold py-4 rounded-2xl text-base tracking-wide disabled:opacity-30 transition-all active:scale-[0.98] hover:bg-green-400"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Joining…
          </span>
        ) : 'Join Squad'}
      </button>

      <button
        onClick={onSwitch}
        disabled={loading}
        className="w-full py-3 text-gray-600 text-sm hover:text-gray-400 transition-colors disabled:opacity-50"
      >
        Create a new squad instead
      </button>
    </div>
  )
}
