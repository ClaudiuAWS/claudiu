import { Toaster } from 'react-hot-toast'

/**
 * App-wide toast renderer. Two flavours:
 *  - Standard `toast.success(…)` / `toast.error(…)` for room-lifecycle
 *    feedback (created/joined/error). Uses the toastOptions below.
 *  - `toast.custom(<ScoreToast .../>)` for in-match score events — those
 *    bring their own gradient cards. The custom render bypasses our
 *    `style` defaults, so the two coexist cleanly.
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      gutter={10}
      toastOptions={{
        duration: 2800,
        style: {
          background: 'linear-gradient(180deg, #131a2a 0%, #0b1020 100%)',
          color: '#f8fafc',
          border: '1px solid rgba(148, 163, 184, 0.16)',
          borderRadius: '14px',
          padding: '10px 14px',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 14px 32px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
          backdropFilter: 'blur(6px)',
        },
        success: {
          iconTheme: {
            primary: '#34d399',
            secondary: '#0b1020',
          },
        },
        error: {
          iconTheme: {
            primary: '#fb7185',
            secondary: '#0b1020',
          },
        },
      }}
    />
  )
}
