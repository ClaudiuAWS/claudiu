import { useEffect } from 'react'

/**
 * Slide-down toast shown when a badge is earned.
 * Auto-dismisses after 5s, tap to dismiss earlier.
 */
export default function BadgeAwardToast({ badge, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[70] px-4 pt-3 pointer-events-none animate-[slideDown_300ms_ease-out]"
    >
      <button
        onClick={onDismiss}
        className="max-w-md mx-auto rounded-2xl p-4 pointer-events-auto shadow-2xl flex items-center gap-4 w-full text-left"
        style={{
          background: 'linear-gradient(145deg, #1a2438 0%, #0d1117 100%)',
          border: '1px solid rgba(234,179,8,0.35)',
        }}
      >
        <img
          src={badge.image || '/badge-striker-1.png'}
          alt={badge.title}
          className="w-14 h-14 rounded-xl object-contain flex-shrink-0"
          style={{
            border: '2px solid rgba(234,179,8,0.5)',
            boxShadow: '0 0 20px -4px rgba(234,179,8,0.4)',
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-yellow-400 text-[10px] font-bold tracking-widest uppercase mb-0.5">
            🏆 New Badge
          </p>
          <p className="text-white text-sm font-semibold leading-tight">
            Congratulations! You just earned a new badge: {badge.title}
          </p>
        </div>
      </button>
    </div>
  )
}
