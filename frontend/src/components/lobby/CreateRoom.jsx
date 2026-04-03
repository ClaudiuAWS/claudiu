const MATCH_ID = 'DFL-MAT-111111'

export default function CreateRoom({ onJoin, onSwitch, loading }) {
  const handleCreate = () => onJoin(MATCH_ID)

  return (
    <div className="space-y-4">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full bg-green-500 text-black font-bold py-4 rounded-2xl text-lg disabled:opacity-50 transition-all hover:bg-green-400 active:scale-95"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Creating...
          </span>
        ) : (
          'Create Squad'
        )}
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-gray-600 text-sm">or</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      <button
        onClick={onSwitch}
        disabled={loading}
        className="w-full bg-gray-900 text-white font-semibold py-4 rounded-2xl border border-gray-700 hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50"
      >
        Join with Code
      </button>
    </div>
  )
}