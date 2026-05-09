import EventItem from './EventItem'
import DirectorCommentary from './DirectorCommentary'
import { sortMatchEventsNewestFirst, gameTimeToSeconds } from '../../utils/matchEvents'

// Events surfaced in the live feed list. Goal/card/saved_shot drive scoring;
// offside/halftime/fulltime trigger mini-games; future: penalty, var.
// `nutmeg` and `spectacular_play` still flash via SkillFlashBadge.
// `substitution` lives in the Squad tab. `secondhalf` is a backend boundary
// marker only — the halftime row already conveys the half break.
const FEED_EVENT_TYPES = new Set([
  'goal',
  'card',
  'saved_shot',
  'offside',
  'halftime',
  'fulltime',
])

export default function MatchFeed({ events, commentaryStack }) {
  const filtered = (events ?? []).filter(e => FEED_EVENT_TYPES.has(e.eventType))
  const ordered  = sortMatchEventsNewestFirst(filtered)

  // Find the halftime event's stored seconds so EventItem can compute football minutes
  const htEvent = (events ?? []).find(e => e.eventType === 'halftime')
  const htStoredSec = htEvent ? gameTimeToSeconds(htEvent.gameTime) : -1

  return (
    <div className="px-4 pt-4">
      <DirectorCommentary stack={commentaryStack} />
      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-600 mb-3 px-1">
        Match Events
      </p>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-3xl">⚽</p>
          <p className="text-gray-600 text-sm">Events will appear here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ordered.map(event => (
            <EventItem key={event.eventId} event={event} htStoredSec={htStoredSec} />
          ))}
        </div>
      )}
    </div>
  )
}
