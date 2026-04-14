export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  )
}
