import MemberAvatar from '../ui/MemberAvatar'

export default function MembersList({ members, hostUserId, teamReadyIds = new Set() }) {
  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ background: 'linear-gradient(145deg,#111827,#0d1117)', border: '1px solid rgba(255,255,255,0.06)' }}>

      <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase">Squad</p>
        <p className="text-gray-600 text-xs">{members.length} {members.length === 1 ? 'player' : 'players'}</p>
      </div>

      <div className="px-5 py-2">
        {members.map((member, i) => (
          <div key={member.userId} className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0">
            <MemberAvatar member={member} size={36} colorIndex={i} />
            <span className="text-white text-sm flex-1">{member.displayName}</span>
            {teamReadyIds.has(member.userId) && (
              <span className="text-[10px] font-semibold tracking-widest uppercase text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                11 ✓
              </span>
            )}
            {member.userId === hostUserId && (
              <span className="text-[10px] font-semibold tracking-widest uppercase text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">
                Host
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
