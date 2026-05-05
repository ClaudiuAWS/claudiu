/**
 * Grouped list view of squad players by position
 * Can be used as fallback or reference view alongside pitch visualization
 */
export function SquadListView({
  players = [],     // Array of players with position property
  variant = 'full', // 'compact' | 'full'
}) {
  // Group players by position
  const POS_TO_GROUP = {
    TW: 'GK',
    IVR: 'DEF',
    IVL: 'DEF',
    IVZ: 'DEF',
    RV: 'DEF',
    LV: 'DEF',
    DMZ: 'MID',
    DMR: 'MID',
    DML: 'MID',
    DRM: 'MID',
    DLM: 'MID',
    ZO: 'MID',
    OLM: 'MID',
    ORM: 'MID',
    LA: 'FWD',
    RA: 'FWD',
    STZ: 'FWD',
    STL: 'FWD',
    STR: 'FWD',
  }

  const grouped = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) {
    const g = POS_TO_GROUP[p.position] ?? 'MID'
    grouped[g].push(p)
  }

  // Group colors and badges
  const groupConfig = {
    GK: { label: 'GK', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', count: grouped.GK.length },
    DEF: { label: 'DEF', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', count: grouped.DEF.length },
    MID: { label: 'MID', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', count: grouped.MID.length },
    FWD: { label: 'FWD', color: 'bg-red-500/20 text-red-400 border-red-500/40', count: grouped.FWD.length },
  }

  return (
    <div className={variant === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {['GK', 'DEF', 'MID', 'FWD'].map((group) => {
        const playerList = grouped[group] || []
        const config = groupConfig[group]

        if (playerList.length === 0) {
          return null
        }

        return (
          <div key={group} className="rounded-lg border border-white/10 overflow-hidden">
            {/* Group header */}
            <div className={`${config.color} border-b border-white/10 px-3 py-2 flex items-center gap-2`}>
              <span className="font-bold text-sm">{config.label}</span>
              <span className="text-xs opacity-75">({playerList.length})</span>
            </div>

            {/* Players in group */}
            <div className={`bg-white/3 ${variant === 'compact' ? 'p-2' : 'p-3'}`}>
              <div className="flex flex-wrap gap-2">
                {playerList.map((p) => (
                  <div
                    key={p.playerId}
                    className={`flex items-center justify-center rounded-full ${config.color} border font-bold text-sm ${
                      variant === 'compact' ? 'w-8 h-8' : 'w-10 h-10'
                    }`}
                    title={p.displayName || `${p.position}`}
                  >
                    {p.shirtNumber}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
