import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppAudio } from '../hooks/useAppAudio'
import { useBadges } from '../hooks/useBadges'
import { useInventory } from '../hooks/useInventory'
import { TRACKS, isTrackUnlocked } from '../utils/tracks'
import { getBadgeById } from '../utils/badges'
import DiscArtwork from '../components/ui/DiscArtwork'
import AlbumEditor from '../components/AlbumEditor'
import PretzelCoin from '../components/ui/PretzelCoin'

/**
 * Tracks library — full list of every disc in the catalog. Unlocked
 * ones are tappable to set as the App-music track; locked ones show
 * the badge required to earn them.
 */
export default function TracksPage() {
  const navigate = useNavigate()
  const {
    appTrackId, setAppTrack,
    albums, activeAlbumId, createAlbum, setActiveAlbum,
    shuffle, toggleShuffle,
    repeatMode, cycleRepeatMode,
  } = useAppAudio()
  const { badges } = useBadges()
  const { inventory } = useInventory()

  const [editingAlbumId, setEditingAlbumId] = useState(null)

  const earnedIds = new Set((badges || []).map(b => b.badgeId))
  // Tracks unlock via the earned badge OR a purchased disc inventory
  // item (see DISC_TO_ITEM in utils/tracks.js).
  const unlocked = (t) => isTrackUnlocked(t, earnedIds, inventory)

  // When an album is active, narrow the disc list to its picks.
  // Locked tracks still appear (so users see what they could unlock),
  // but they're filtered to those in the album.
  const activeAlbum = albums.find(a => a.id === activeAlbumId)
  const activeAlbumTrackIds = activeAlbum ? new Set(activeAlbum.trackIds) : null
  const visibleTracks = activeAlbumTrackIds
    ? TRACKS.filter(t => activeAlbumTrackIds.has(t.id))
    : TRACKS

  const handleCreateAlbum = () => {
    const id = createAlbum(`Album ${albums.length + 1}`)
    setEditingAlbumId(id)
  }

  return (
    <div className="px-6 pt-8 pb-12 max-w-md mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-gray-300 text-xs font-semibold tracking-widest uppercase mb-3 flex items-center gap-1"
      >
        ‹ Back
      </button>

      {/* Glossy header bar */}
      <div className="relative overflow-hidden rounded-2xl mb-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
        <div
          className="relative px-5 py-4"
          style={{
            background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0606 100%)',
            border: '1px solid rgba(220,38,38,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -12px rgba(220,38,38,0.50)',
          }}
        >
          <h1
            className="text-white font-stadium text-2xl leading-none"
            style={{
              letterSpacing: '0.10em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05)',
            }}
          >
            DISC LIBRARY
          </h1>
          <p className="text-gray-400 text-[11px] mt-1.5 tracking-wider">
            {TRACKS.filter(unlocked).length} / {TRACKS.length} unlocked
          </p>

          {/* Playback mode pills — shuffle + repeat-one. The auto-advance
              engine reads these via refs so toggling mid-track doesn't
              restart playback. */}
          <div className="flex items-center gap-2 mt-3">
            <ModePill
              active={shuffle}
              onClick={toggleShuffle}
              label="Shuffle"
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              }
            />
            <ModePill
              active={repeatMode === 'one'}
              onClick={cycleRepeatMode}
              label="Repeat 1"
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              }
            />
            {activeAlbumId && (
              <button
                type="button"
                onClick={() => setActiveAlbum(null)}
                className="ml-auto text-[10px] font-bold tracking-widest uppercase text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Albums — horizontal strip. The "All Discs" tile is virtual:
          not stored in localStorage, always present, can't be deleted.
          It maps to activeAlbumId === null which the playback engine
          already treats as the full unlocked rotation. */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2 px-1">
          Albums
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-2 px-2" style={{ scrollbarWidth: 'thin' }}>
          <DefaultAlbumCard
            isActive={!activeAlbumId}
            count={TRACKS.filter(unlocked).length}
            onSelect={() => setActiveAlbum(null)}
          />
          {albums.map(album => (
            <AlbumCard
              key={album.id}
              album={album}
              isActive={activeAlbumId === album.id}
              onOpen={() => setEditingAlbumId(album.id)}
            />
          ))}
          <NewAlbumCard onClick={handleCreateAlbum} />
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleTracks.map(track => {
          const isUnlocked = unlocked(track)
          const isActive = appTrackId === track.id
          const reqBadge = track.requiredBadge ? getBadgeById(track.requiredBadge) : null

          return (
            <div
              key={track.id}
              className="relative overflow-hidden rounded-2xl"
            >
              {/* Top sheen — only on unlocked rows */}
              {isUnlocked && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              )}
              <div
                className="relative flex items-center gap-3 px-3.5 py-3"
                style={{
                  background: isUnlocked
                    ? (isActive
                      ? 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)'
                      : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)')
                    : 'rgba(255,255,255,0.015)',
                  border: isActive
                    ? '1px solid rgba(220,38,38,0.55)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isActive
                    ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -8px rgba(220,38,38,0.45)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  opacity: isUnlocked ? 1 : 0.55,
                }}
              >
                <DiscArtwork track={track} size={48} locked={!isUnlocked} />

                <div className="flex-1 min-w-0">
                  <p
                    className="text-white text-sm font-semibold truncate"
                    style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
                  >
                    {track.title}
                  </p>
                  <p className="text-gray-500 text-[11px] truncate">
                    {isUnlocked
                      ? track.artist
                      : reqBadge
                        ? `Locked — earn "${reqBadge.title}"`
                        : 'Locked'}
                  </p>
                </div>

                {isUnlocked && (
                  <button
                    type="button"
                    onClick={() => setAppTrack(track.id)}
                    className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                        : 'rgba(255,255,255,0.06)',
                      color: isActive ? '#fff' : '#9ca3af',
                      border: `1px solid ${isActive ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.10)'}`,
                      boxShadow: isActive ? '0 4px 12px -4px rgba(220,38,38,0.45)' : 'none',
                      minWidth: 70,
                    }}
                  >
                    {isActive ? 'Playing ✓' : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-gray-600 text-[11px] mt-6 leading-snug text-center">
        Earn the badges that unlock new discs to grow your library.
      </p>

      {editingAlbumId && (
        <AlbumEditor
          albumId={editingAlbumId}
          onClose={() => setEditingAlbumId(null)}
        />
      )}
    </div>
  )
}

function ModePill({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(220,38,38,0.30) 0%, rgba(153,27,27,0.20) 100%)'
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.10)'}`,
        color: active ? '#fca5a5' : '#9ca3af',
        boxShadow: active ? '0 0 12px -4px rgba(220,38,38,0.45)' : 'none',
      }}
    >
      <span className="leading-none">{icon}</span>
      {label}
    </button>
  )
}

// Virtual default "All Discs" album — always present, can't be edited
// or deleted. Maps to activeAlbumId === null in useAppAudio (which the
// auto-advance engine already treats as the full unlocked rotation).
// Visually distinct from user-created albums via the pretzel-coin icon
// in its art tile.
function DefaultAlbumCard({ isActive, count, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex-shrink-0 w-28 rounded-2xl p-3 text-left transition-all active:scale-[0.97]"
      style={{
        background: isActive
          ? 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)'
          : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
        border: `1px solid ${isActive ? 'rgba(220,38,38,0.55)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isActive
          ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -8px rgba(220,38,38,0.45)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div
        className="w-full aspect-square rounded-xl flex items-center justify-center mb-2"
        style={{
          background: 'radial-gradient(circle at 30% 25%, #4a0808 0%, #1a0303 60%, #000 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <PretzelCoin size={36} color="#fcd34d" />
      </div>
      <p className="text-white text-xs font-semibold truncate leading-tight">All Discs</p>
      <p className="text-gray-500 text-[10px] leading-tight mt-0.5">
        {count} {count === 1 ? 'disc' : 'discs'}
        {isActive && <span className="ml-1 text-red-400">· Active</span>}
      </p>
    </button>
  )
}

function AlbumCard({ album, isActive, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex-shrink-0 w-28 rounded-2xl p-3 text-left transition-all active:scale-[0.97]"
      style={{
        background: isActive
          ? 'linear-gradient(145deg, rgba(40,12,12,0.85) 0%, rgba(20,6,6,0.95) 100%)'
          : 'linear-gradient(145deg, #14181f 0%, #0a0d12 100%)',
        border: `1px solid ${isActive ? 'rgba(220,38,38,0.55)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isActive
          ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px -8px rgba(220,38,38,0.45)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div
        className="w-full aspect-square rounded-xl flex items-center justify-center mb-2"
        style={{
          background: 'radial-gradient(circle at 30% 25%, #4a0808 0%, #1a0303 60%, #000 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <span className="text-red-400/80 font-stadium text-3xl tracking-wider">
          {album.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <p className="text-white text-xs font-semibold truncate leading-tight">{album.name}</p>
      <p className="text-gray-500 text-[10px] leading-tight mt-0.5">
        {album.trackIds.length} {album.trackIds.length === 1 ? 'disc' : 'discs'}
        {isActive && <span className="ml-1 text-red-400">· Active</span>}
      </p>
    </button>
  )
}

function NewAlbumCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 w-28 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.97]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1.5px dashed rgba(255,255,255,0.15)',
        minHeight: 130,
      }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(220,38,38,0.15)',
          border: '1px solid rgba(248,113,113,0.40)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <span className="text-gray-400 text-[10px] font-semibold tracking-widest uppercase">
        New
      </span>
    </button>
  )
}
