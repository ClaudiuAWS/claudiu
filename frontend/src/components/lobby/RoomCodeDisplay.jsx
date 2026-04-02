export default function RoomCodeDisplay({ code }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6 text-center">
      <p className="text-gray-400 text-sm mb-2">Room Code</p>
      <p className="text-green-400 text-5xl font-bold tracking-widest">
        {code}
      </p>
      <p className="text-gray-500 text-xs mt-2">
        Share this with your squad
      </p>
    </div>
  )
}