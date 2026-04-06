import EventItem from './EventItem'
import { sortMatchEventsChronologically } from '../../utils/matchEvents'

export default function MatchFeed({ events }) {
  if (!events?.length) {
    return (
      <div className="bg-gray-900 rounded-2xl p-6 text-center">
        <p className="text-gray-500 text-sm">Match events will appear here</p>
      </div>
    )
  }

  const ordered = sortMatchEventsChronologically(events)

  return (
    <div className="bg-gray-900 rounded-2xl px-4">
      <p className="text-gray-400 text-sm py-3 border-b border-gray-800">
        Match Events
      </p>
      {ordered.map(event => (
        <EventItem key={event.eventId} event={event} />
      ))}
    </div>
  )
}