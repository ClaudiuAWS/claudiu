import EventItem from './EventItem'
import { sortMatchEventsNewestFirst } from '../../utils/matchEvents'

export default function MatchFeed({ events }) {
  const ordered = sortMatchEventsNewestFirst(events ?? [])

  return (
    <div className="px-4 pt-4">
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
            <EventItem key={event.eventId} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
