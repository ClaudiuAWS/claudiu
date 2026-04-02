export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null

  return (
    <div className="bg-red-900/30 border border-red-500/50 rounded-xl px-4 py-3 flex items-center justify-between">
      <p className="text-red-400 text-sm">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400 text-lg ml-3 leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}