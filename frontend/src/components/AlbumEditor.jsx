import { useState, useEffect } from 'react'
import { TRACKS } from '../utils/tracks'
import { useAppAudio } from '../hooks/useAppAudio'
import DiscArtwork from './ui/DiscArtwork'

/**
 * AlbumEditor — bottom-sheet for editing a single user-created album.
 *
 * Surfaces:
 *   - Inline rename (commits on blur or Enter)
 *   - "Set as active" / "Active" pill
 *   - Delete button
 *   - Full track picker with checkmark toggles (only unlocked tracks
 *     can be added — badge-locked discs are excluded entirely since
 *     they can't auto-play)
 *
 * Props:
 *   albumId  — id of the album to edit (component reads from useAppAudio)
 *   onClose  — fired when user dismisses the sheet
 */
export default function AlbumEditor({ albumId, onClose }) {
  const {
    albums,
    activeAlbumId,
    renameAlbum,
    deleteAlbum,
    toggleAlbumTrack,
    setActiveAlbum,
  } = useAppAudio()

  const album = albums.find(a => a.id === albumId)
  const [name, setName] = useState(album?.name || '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    setName(album?.name || '')
  }, [album?.id])

  if (!album) {
    // Album was deleted out from under us (e.g. user tapped delete then
    // the parent passed a stale id) — just close.
    onClose()
    return null
  }

  const handleNameCommit = () => {
    if (name.trim() && name.trim() !== album.name) {
      renameAlbum(album.id, name.trim())
    } else {
      setName(album.name)
    }
  }

  const handleSetActive = () => {
    if (activeAlbumId === album.id) {
      setActiveAlbum(null)
    } else {
      setActiveAlbum(album.id)
    }
  }

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    deleteAlbum(album.id)
    onClose()
  }

  const isActive = activeAlbumId === album.id
  // Only show unlocked tracks in the picker. Adding a badge-locked
  // disc would just sit dead in the album.
  const pickableTracks = TRACKS.filter(t => !t.requiredBadge)
  const inAlbum = new Set(album.trackIds)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-t-3xl overflow-hidden max-h-[85vh] flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
          border: '1px solid rgba(220,38,38,0.30)',
          boxShadow: '0 -16px 48px -8px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />

          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleNameCommit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-full bg-transparent text-white font-stadium text-2xl text-center leading-none outline-none border-b border-transparent focus:border-red-500/50 pb-1"
            style={{ letterSpacing: '0.06em', textShadow: '0 2px 0 rgba(0,0,0,0.6)' }}
          />
          <p className="text-gray-400 text-xs text-center mt-2 tracking-wide">
            {album.trackIds.length} {album.trackIds.length === 1 ? 'disc' : 'discs'}
          </p>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSetActive}
              className="flex-1 py-2.5 rounded-2xl text-[11px] font-bold tracking-widest uppercase transition-all active:scale-[0.98]"
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                  : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isActive ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.12)'}`,
                color: isActive ? '#fff' : '#9ca3af',
                boxShadow: isActive ? '0 4px 12px -4px rgba(220,38,38,0.45)' : 'none',
              }}
            >
              {isActive ? 'Playing ✓' : 'Play this album'}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2.5 rounded-2xl text-[11px] font-bold tracking-widest uppercase transition-all active:scale-[0.98]"
              style={{
                background: confirmingDelete ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${confirmingDelete ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
                color: confirmingDelete ? '#fca5a5' : '#9ca3af',
              }}
            >
              {confirmingDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
        </div>

        <div className="px-2 pb-4 overflow-y-auto flex-1">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2 px-4">
            Discs · tap to add or remove
          </p>
          <div className="space-y-1.5 px-2">
            {pickableTracks.map(track => {
              const checked = inAlbum.has(track.id)
              return (
                <button
                  key={track.id}
                  onClick={() => toggleAlbumTrack(album.id, track.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all active:scale-[0.99]"
                  style={{
                    background: checked
                      ? 'linear-gradient(135deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${checked ? 'rgba(220,38,38,0.45)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <DiscArtwork track={track} size={36} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white text-sm font-semibold truncate leading-tight">{track.title}</p>
                    <p className="text-gray-500 text-[11px] truncate leading-tight">{track.artist}</p>
                  </div>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: checked ? '#dc2626' : 'transparent',
                      border: `1.5px solid ${checked ? '#dc2626' : 'rgba(255,255,255,0.20)'}`,
                      boxShadow: checked ? '0 0 10px -2px rgba(220,38,38,0.55)' : 'none',
                    }}
                  >
                    {checked && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 text-gray-500 text-xs font-semibold tracking-widest uppercase hover:text-gray-300 transition-colors flex-shrink-0 border-t border-white/5"
        >
          Done
        </button>
      </div>
    </div>
  )
}
