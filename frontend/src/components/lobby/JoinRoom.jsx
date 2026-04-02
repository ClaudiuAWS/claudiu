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
        className="w-full bg-gray-900 text-white border border-gray-700 rounded-2xl px-4 py-4 outline-none focus:border-green-500 text-center text-3xl tracking-widest uppercase font-bold"
      />

      <button
        onClick={handleJoin}
        disabled={loading || code.length !== 6}
        className="w-full bg-green-500 text-black font-bold py-4 rounded-2xl text-lg disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Joining...' : 'Join Squad'}
      </button>

      <button
        onClick={onSwitch}
        className="w-full text-gray-400 text-sm py-2"
      >
        Create a new squad instead
      </button>
    </div>
  )
}