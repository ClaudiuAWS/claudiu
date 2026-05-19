import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppAudio } from '../../hooks/useAppAudio'
import { useAuth } from '../../hooks/useAuth'
import { historyApi } from '../../services/api'
import MemberAvatar from '../ui/MemberAvatar'

// Mirrors backend CREDITS_PER_POINT in backend/shared/credits.py
const CREDITS_PER_POINT = 2

const CONFETTI_COUNT = 36
const CONFETTI_VISIBLE_MS = 5000

const PIECES = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  left:     `${((i * 7.3) + (i % 5) * 1.9) % 98}%`,
  delay:    +((i * 0.07) % 1.2).toFixed(2),
  duration: +(1.8 + (i % 5) * 0.22).toFixed(2),
  size:     6 + (i % 4) * 2,
  rotEnd:   360 + (i % 3) * 360,
}))

/**
 * Full-time celebration overlay.
 *
 *   • Fires red confetti for ~5 s.
 *   • Loops /songs/sfx-match-end.mp3 as the celebration song.
 *   • Ducks the app music to 0 while the overlay is up; restores it on
 *     "Back to Home".
 *   • Shows a summary modal with the final score, per-member credits,
 *     the current user's winning streak, and the badges they earned in
 *     this match. Stays visible until the user taps the explicit CTA.
 *
 * Driven by useRoom's `matchJustEnded` flag (now persistent — the
 * MatchPage unmounts on navigate so the overlay tears down cleanly).
 */
export default function MatchEndCelebration({ shown, match, room, scoreEvents = [] }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { fadeAppMusic, appVolume } = useAppAudio()

  const [active, setActive] = useState(false)
  const [confettiOn, setConfettiOn] = useState(false)
  const [streak, setStreak] = useState(null)        // number, or null while loading
  const [closing, setClosing] = useState(false)

  const celebrationAudioRef = useRef(null)
  const restoreVolumeRef    = useRef(0.2)

  // Rising edge: arm the overlay exactly once per match.
  useEffect(() => {
    if (shown && !active) setActive(true)
  }, [shown, active])

  // On first activation: kick off audio + confetti + data fetches.
  useEffect(() => {
    if (!active) return

    // Snapshot the current app-music volume so we can restore it on
    // dismissal without overwriting the user's preference mid-fade.
    restoreVolumeRef.current = Math.max(0.05, Number(appVolume) || 0.2)

    // 1. Duck the app music (fade to 0, then pause).
    fadeAppMusic({ to: 0, durationMs: 800 })

    // 2. Start celebration song (looped sfx-match-end). Volume ramps
    //    up so it doesn't slam in on top of the residual app music.
    try {
      const a = new Audio('/songs/sfx-match-end.mp3')
      a.loop = true
      a.volume = 0
      celebrationAudioRef.current = a
      a.play().catch(() => { /* autoplay blocked — silent failure */ })
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 800)
        a.volume = 0.6 * t
        if (t < 1 && celebrationAudioRef.current === a) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch { /* Audio ctor unavailable */ }

    // 3. Confetti for 5s, then it unmounts itself.
    setConfettiOn(true)
    const confettiTimer = setTimeout(() => setConfettiOn(false), CONFETTI_VISIBLE_MS)

    // 4. Fetch winning streak. The history row for THIS match may not
    //    be persisted yet — we count consecutive `won` rows in the API
    //    response, then optimistically add +1 if the current user won
    //    the match that just finished (highest score in members).
    historyApi.list(20)
      .then(({ history = [] }) => {
        let count = 0
        for (const row of history) {
          if (row.won) count += 1
          else break
        }
        if (didCurrentUserWin(room, user?.userId)) count += 1
        setStreak(count)
      })
      .catch(() => setStreak(0))

    return () => {
      clearTimeout(confettiTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Cleanup if the page unmounts without an explicit Back tap (browser
  // back, navigate elsewhere, etc.) — never leave the celebration audio
  // playing past the match.
  useEffect(() => () => {
    const a = celebrationAudioRef.current
    if (a) { try { a.pause() } catch {} ; celebrationAudioRef.current = null }
  }, [])

  const handleBack = async () => {
    if (closing) return
    setClosing(true)

    // Fade the celebration song down before stopping it.
    const a = celebrationAudioRef.current
    if (a) {
      const from = a.volume
      const start = performance.now()
      await new Promise((resolve) => {
        const tick = (now) => {
          const t = Math.min(1, (now - start) / 600)
          a.volume = from * (1 - t)
          if (t < 1) requestAnimationFrame(tick)
          else { try { a.pause() } catch {} ; resolve() }
        }
        requestAnimationFrame(tick)
      })
      celebrationAudioRef.current = null
    }

    // Fade the app music back up to the saved baseline.
    fadeAppMusic({ to: restoreVolumeRef.current, durationMs: 800 })

    navigate('/')
  }

  // Per-member credit totals computed from the per-match scoreEvents log.
  // Mirrors the backend's award rule (positive deltas only, multiplied
  // by CREDITS_PER_POINT).
  const creditsByUser = useMemo(() => {
    const out = {}
    for (const ev of scoreEvents) {
      if (!ev || !ev.userId || typeof ev.delta !== 'number') continue
      if (ev.delta <= 0) continue
      out[ev.userId] = (out[ev.userId] || 0) + ev.delta * CREDITS_PER_POINT
    }
    return out
  }, [scoreEvents])

  if (!active) return null

  const members = [...(room?.members || [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const myScore = members.find(m => m.userId === user?.userId)?.score ?? 0
  const finalResult = match?.finalResult || room?.finalResult || ''
  const homeTeam = match?.homeTeamName || 'Home'
  const awayTeam = match?.awayTeamName || 'Away'

  return (
    <>
      {/* Confetti — pulled out of the modal so it rains over the whole
          viewport, not just inside the panel. */}
      {confettiOn && (
        <div className="fixed inset-0 pointer-events-none z-[110] overflow-hidden" aria-hidden="true">
          {PIECES.map((p, i) => (
            <span
              key={i}
              className="absolute -top-4 block"
              style={{
                left:            p.left,
                width:           p.size,
                height:          p.size * 0.55,
                backgroundColor: '#dc2626',
                borderRadius:    '2px',
                '--rot-end':     `${p.rotEnd}deg`,
                animation:       `matchEndConfetti ${p.duration}s cubic-bezier(.45,.05,.55,.95) ${p.delay}s forwards`,
              }}
            />
          ))}
          <style>{`
            @keyframes matchEndConfetti {
              0%   { transform: translateY(0)     rotate(0deg);          opacity: 0; }
              8%   { opacity: 1; }
              90%  { opacity: 1; }
              100% { transform: translateY(110vh) rotate(var(--rot-end)); opacity: 0; }
            }
            /* Respect the OS-level "Reduce motion" toggle — disables the
               confetti animation entirely for users with vestibular
               disorders or motion sensitivity. The summary modal +
               audio still play (those aren't motion-triggering). */
            @media (prefers-reduced-motion: reduce) {
              @keyframes matchEndConfetti {
                0%, 100% { transform: none; opacity: 0; }
              }
            }
          `}</style>
        </div>
      )}

      {/* Summary modal */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-y-auto"
        style={{ background: 'rgba(5,8,15,0.78)', backdropFilter: 'blur(6px)' }}
        aria-modal="true"
        role="dialog"
      >
        <div
          className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(160deg, #111827 0%, #0b1220 55%, #08101c 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
            animation: 'matchEndModalIn 360ms cubic-bezier(.22,1.4,.36,1)',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-white/[0.06]">
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-amber-300">Full Time</p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="text-white text-sm font-semibold truncate max-w-[35%]">{homeTeam}</span>
              <span className="text-white text-3xl font-black tabular-nums px-2">{finalResult || '—'}</span>
              <span className="text-white text-sm font-semibold truncate max-w-[35%]">{awayTeam}</span>
            </div>
          </div>

          {/* Per-member breakdown */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500 px-1">Scoreboard</p>
            {members.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-2">No members</p>
            ) : (
              members.map((m, i) => {
                const isMe = m.userId === user?.userId
                const credits = creditsByUser[m.userId] || 0
                return (
                  <div
                    key={m.userId}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                      isMe
                        ? 'border-amber-400/40 bg-amber-500/8'
                        : 'border-white/[0.06] bg-white/[0.02]'
                    }`}
                  >
                    <span className="w-5 text-center text-xs font-bold text-gray-500">{i + 1}</span>
                    <MemberAvatar member={m} size={32} colorIndex={i} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMe ? 'text-amber-200' : 'text-white'}`}>
                        {m.displayName || 'Player'}{isMe && <span className="ml-1.5 text-[10px] text-amber-400/80 font-normal">you</span>}
                      </p>
                      <p className="text-[10px] text-gray-500 tabular-nums">
                        🥨 +{credits} brezn earned
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold tabular-nums ${
                        (m.score ?? 0) > 0 ? 'text-white' : (m.score ?? 0) < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {(m.score ?? 0) > 0 ? '+' : ''}{m.score ?? 0}
                      </p>
                      <p className="text-[9px] text-gray-600 tracking-wider uppercase">pts</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Streak */}
          <div className="px-5 pb-2">
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.08) 100%)',
                border: '1px solid rgba(245,158,11,0.30)',
              }}
            >
              <span className="text-2xl">🔥</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest uppercase text-amber-300/80">Your win streak</p>
                <p className="text-white font-bold text-base">
                  {streak === null
                    ? 'Counting…'
                    : streak === 0
                      ? 'No streak — get one next time!'
                      : `${streak} in a row${didCurrentUserWin(room, user?.userId) ? ' — including this one' : ''}`}
                </p>
              </div>
              <p className="text-amber-300 text-2xl font-black tabular-nums">
                {streak === null ? '·' : streak}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="px-5 pb-5 pt-2">
            <button
              onClick={handleBack}
              disabled={closing}
              className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all
                bg-red-600 hover:bg-red-500 active:bg-red-700 text-white
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {closing ? 'Wrapping up…' : 'Back to Home'}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes matchEndModalIn {
            0%   { opacity: 0; transform: translateY(24px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0)    scale(1);    }
          }
        `}</style>
      </div>
    </>
  )
}

// Solo matches don't have a "winner" in the multi-user sense, but we
// treat the just-finished match as a streak-extender so a solo player
// who keeps playing sees their streak climb.
function didCurrentUserWin(room, userId) {
  const members = room?.members || []
  if (!userId || members.length === 0) return false
  if (members.length === 1) return true
  const me = members.find(m => m.userId === userId)
  if (!me) return false
  const myScore = Number(me.score ?? 0)
  return members.every(m => m.userId === userId || Number(m.score ?? 0) <= myScore)
}
