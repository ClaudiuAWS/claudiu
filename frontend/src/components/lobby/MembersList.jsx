function MemberAvatar({ name }) {
  return (
    <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function MemberRow({ member, isHost }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <MemberAvatar name={member.displayName} />
      <span className="text-white flex-1">{member.displayName}</span>
      {isHost && (
        <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
          Host
        </span>
      )}
    </div>
  )
}

export default function MembersList({ members, hostUserId }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <p className="text-gray-400 text-sm mb-3">
        Squad — {members.length} {members.length === 1 ? 'player' : 'players'}
      </p>
      <div className="divide-y divide-gray-800">
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            isHost={member.userId === hostUserId}
          />
        ))}
      </div>
    </div>
  )
}