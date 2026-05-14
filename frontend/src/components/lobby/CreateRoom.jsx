export default function CreateRoom({ onCreate, onSwitch, loading }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onCreate}
        disabled={loading}
        className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl text-base tracking-wide disabled:opacity-50 transition-all active:scale-[0.98] hover:bg-red-500"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating…
          </span>
        ) : 'Create Squad'}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-gray-600 text-xs">or</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <button
        onClick={onSwitch}
        disabled={loading}
        className="w-full py-4 rounded-2xl text-gray-300 text-sm font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
        style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
      >
        Join with a code
      </button>
    </div>
  )
}
