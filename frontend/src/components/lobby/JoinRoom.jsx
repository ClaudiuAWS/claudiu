import { useState } from 'react'

export default function JoinRoom({ onJoin, onSwitch, loading }) {
  const [code, setCode] = useState('')

  const handleJoin = () => {
    if (code.length === 6) onJoin(code)
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="XXXXXX"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && handleJoin()}
        maxLength={6}
        disabled={loading}
        className="w-full bg-gray-900 text-white border border-gray-700 rounded-2xl px-4 py-4 outline-none focus:border-green-500 text-center text-3xl tracking-widest uppercase font-bold transition-colors disabled:opacity-50"
      />

      <button
        onClick={handleJoin}
        disabled={loading || code.length !== 6}
        className="w-full bg-green-500 text-black font-bold py-4 rounded-2xl text-lg disabled:opacity-50 transition-all hover:bg-green-400 active:scale-95"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Joining...
          </span>
        ) : (
          'Join Squad'
        )}
      </button>

      <button
        onClick={onSwitch}
        disabled={loading}
        className="w-full text-gray-400 text-sm py-2 hover:text-gray-300 transition-colors disabled:opacity-50"
      >
        Create a new squad instead
      </button>
    </div>
  )
}