/**
 * 5-tier position system for football pitch visualization
 * Tiers: GK → DEF → CDM → CAM → FWD
 *
 * Coordinate system: 111×74 units (105m×68m field + 3m border each side)
 * Horizontal: GK on left (x≈7), FWD on right (x≈87)
 * Vertical center: y=37
 */

// ─── German code → specific English position type ────────────────────────────
export const POS_TO_TYPE = {
  TW:  'GK',
  IVZ: 'CB',  IVL: 'CB',  IVR: 'CB',
  LV:  'LB',  RV:  'RB',
  DMZ: 'CDM', DML: 'CDM', DMR: 'CDM',
  DLM: 'CM',  DRM: 'CM',
  ZO:  'CAM',
  OLM: 'LM',  ORM: 'RM',
  LA:  'LW',  RA:  'RW',
  STZ: 'ST',
  STL: 'CF',  STR: 'CF',
}

// ─── German code → broad pitch tier (used for slot assignment & bubble colour) ─
export const POS_TO_GROUP = {
  TW:  'GK',
  IVZ: 'DEF', IVL: 'DEF', IVR: 'DEF', LV: 'DEF', RV: 'DEF',
  // DLM/DRM are centre mids (CM) but sit on the CDM line visually
  DMZ: 'CDM', DMR: 'CDM', DML: 'CDM', DRM: 'CDM', DLM: 'CDM',
  ZO:  'CAM', OLM: 'CAM', ORM: 'CAM', LA: 'CAM', RA: 'CAM',
  STZ: 'FWD', STL: 'FWD', STR: 'FWD',
}

export const GROUP_COLORS = {
  GK:  '#EAB308', // yellow-500
  DEF: '#3B82F6', // blue-500
  CDM: '#10B981', // emerald-500
  CAM: '#F97316', // orange-500
  FWD: '#EF4444', // red-500
}

export const TEAM_COLORS = {
  home: '#DC2626', // red-600
  away: '#1D4ED8', // blue-700
}

// ─── Formation templates ──────────────────────────────────────────────────────
// Keys per template: GK, DEF, CDM, CAM, FWD
// CDM and CAM are separate x-bands: CDM≈x40, CAM≈x65
// Slot positions[] list which position codes fit that slot (priority order).
// Versatility: CAM slots accept wingers AND CAM; FWD slots accept strikers AND
//              versatile attackers; CDM slots do NOT accept wingers.

const FORMATION_TEMPLATES = {
  // ── 4-2-3-1 ──────────────────────────────────────────────────────────────
  '4-2-3-1': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                             x: 22, y: 10 },
      { positions: ['IVL', 'IVZ'],                                     x: 22, y: 29 },
      { positions: ['IVR', 'IVZ'],                                     x: 22, y: 45 },
      { positions: ['RV'],                                              x: 22, y: 64 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 40, y: 29 },
      { positions: ['DMR', 'DMZ', 'DLM'],                              x: 40, y: 45 },
    ],
    CAM: [
      { positions: ['OLM', 'LA', 'ZO'],                                x: 65, y: 11 },
      { positions: ['ZO', 'OLM', 'ORM', 'LA', 'RA'],                  x: 65, y: 37 },
      { positions: ['ORM', 'RA', 'ZO'],                                x: 65, y: 63 },
    ],
    FWD: [{ positions: ['STZ', 'STL', 'STR', 'LA', 'RA', 'OLM', 'ORM'], x: 87, y: 37 }],
  },

  // ── 4-2-2-2 (classic 4-4-2 with 2 CDMs + 2 wide ATMs) ───────────────────
  '4-2-2-2': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                             x: 22, y: 10 },
      { positions: ['IVL', 'IVZ'],                                     x: 22, y: 29 },
      { positions: ['IVR', 'IVZ'],                                     x: 22, y: 45 },
      { positions: ['RV'],                                              x: 22, y: 64 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 42, y: 29 },
      { positions: ['DMR', 'DMZ', 'DLM'],                              x: 42, y: 45 },
    ],
    CAM: [
      { positions: ['OLM', 'LA', 'ZO'],                                x: 62, y: 12 },
      { positions: ['ORM', 'RA', 'ZO'],                                x: 62, y: 62 },
    ],
    FWD: [
      { positions: ['STL', 'STZ', 'LA', 'OLM'],                       x: 87, y: 27 },
      { positions: ['STR', 'STZ', 'RA', 'ORM'],                       x: 87, y: 47 },
    ],
  },

  // ── 4-3-3 (3 CDMs + 3 ATM forwards) ─────────────────────────────────────
  '4-3-3': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                             x: 22, y:  9 },
      { positions: ['IVL', 'IVZ'],                                     x: 22, y: 27 },
      { positions: ['IVR', 'IVZ'],                                     x: 22, y: 47 },
      { positions: ['RV'],                                              x: 22, y: 65 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 50, y: 20 },
      { positions: ['ZO', 'DMZ'],                                      x: 50, y: 37 },
      { positions: ['DMR', 'DLM', 'DMZ'],                              x: 50, y: 54 },
    ],
    CAM: [],
    FWD: [
      { positions: ['STL', 'LA', 'OLM'],                               x: 85, y: 12 },
      { positions: ['STZ', 'LA', 'RA', 'OLM', 'ORM'],                 x: 85, y: 37 },
      { positions: ['STR', 'RA', 'ORM'],                               x: 85, y: 62 },
    ],
  },

  // ── 4-3-3 variant with ATM line (no CDMs) ────────────────────────────────
  '4-0-3-3': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                             x: 22, y:  9 },
      { positions: ['IVL', 'IVZ'],                                     x: 22, y: 27 },
      { positions: ['IVR', 'IVZ'],                                     x: 22, y: 47 },
      { positions: ['RV'],                                              x: 22, y: 65 },
    ],
    CDM: [],
    CAM: [
      { positions: ['OLM', 'LA', 'ZO'],                                x: 55, y: 20 },
      { positions: ['ZO', 'OLM', 'ORM', 'LA', 'RA'],                  x: 55, y: 37 },
      { positions: ['ORM', 'RA', 'ZO'],                                x: 55, y: 54 },
    ],
    FWD: [
      { positions: ['STL', 'LA', 'OLM'],                               x: 85, y: 12 },
      { positions: ['STZ'],                                             x: 85, y: 37 },
      { positions: ['STR', 'RA', 'ORM'],                               x: 85, y: 62 },
    ],
  },

  // ── 3-4-3 ────────────────────────────────────────────────────────────────
  '3-4-3': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['IVL', 'LV'],                                      x: 22, y: 20 },
      { positions: ['IVZ'],                                             x: 22, y: 37 },
      { positions: ['IVR', 'RV'],                                      x: 22, y: 54 },
    ],
    CDM: [
      { positions: ['LV', 'DML', 'OLM'],                               x: 48, y: 10 },
      { positions: ['DMZ', 'DML', 'DRM'],                              x: 48, y: 29 },
      { positions: ['DMR', 'DLM', 'DMZ'],                              x: 48, y: 45 },
      { positions: ['RV', 'DMR', 'ORM'],                               x: 48, y: 64 },
    ],
    CAM: [],
    FWD: [
      { positions: ['STL', 'LA', 'OLM'],                               x: 85, y: 15 },
      { positions: ['STZ', 'ZO'],                                       x: 85, y: 37 },
      { positions: ['STR', 'RA', 'ORM'],                               x: 85, y: 59 },
    ],
  },

  // ── 3-5-2 (classic: LM + CDM + CDM + RM all on same line, lone CAM ahead) ──
  '3-5-2': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['IVL', 'LV'],                                      x: 22, y: 18 },
      { positions: ['IVZ'],                                             x: 22, y: 37 },
      { positions: ['IVR', 'RV'],                                      x: 22, y: 56 },
    ],
    CDM: [
      { positions: ['LV', 'OLM', 'DML'],                               x: 42, y:  8 }, // LM / wing-back
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 42, y: 28 }, // CDM left
      { positions: ['DMR', 'DLM', 'DMZ'],                              x: 42, y: 46 }, // CDM right
      { positions: ['RV', 'ORM', 'DMR'],                               x: 42, y: 66 }, // RM / wing-back
    ],
    CAM: [
      { positions: ['ZO', 'OLM', 'ORM', 'LA', 'RA'],                  x: 62, y: 37 }, // lone CAM
    ],
    FWD: [
      { positions: ['STL', 'STZ', 'LA'],                               x: 84, y: 26 },
      { positions: ['STR', 'STZ', 'RA'],                               x: 84, y: 48 },
    ],
  },

  // ── 3-2-3-2 (attacking variant: 2 CDMs + wide AM trio) ────────────────────
  '3-2-3-2': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['IVL', 'LV'],                                      x: 22, y: 20 },
      { positions: ['IVZ'],                                             x: 22, y: 37 },
      { positions: ['IVR', 'RV'],                                      x: 22, y: 54 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 38, y: 29 },
      { positions: ['DMR', 'DMZ', 'DLM'],                              x: 38, y: 45 },
    ],
    CAM: [
      { positions: ['OLM', 'LA', 'LV'],                                x: 58, y: 10 },
      { positions: ['ZO', 'OLM', 'ORM'],                               x: 58, y: 37 },
      { positions: ['ORM', 'RA', 'RV'],                                x: 58, y: 64 },
    ],
    FWD: [
      { positions: ['STL', 'STZ', 'LA'],                               x: 82, y: 27 },
      { positions: ['STR', 'STZ', 'RA'],                               x: 82, y: 47 },
    ],
  },

  // ── 5-2-3 (CDM×2) ────────────────────────────────────────────────────────
  '5-2-3': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                              x: 22, y:  8 },
      { positions: ['IVL'],                                             x: 22, y: 22 },
      { positions: ['IVZ'],                                             x: 22, y: 37 },
      { positions: ['IVR'],                                             x: 22, y: 52 },
      { positions: ['RV'],                                              x: 22, y: 66 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'DRM'],                              x: 48, y: 27 },
      { positions: ['DMR', 'DMZ', 'DLM'],                              x: 48, y: 47 },
    ],
    CAM: [],
    FWD: [
      { positions: ['STL', 'LA', 'OLM'],                               x: 85, y: 12 },
      { positions: ['STZ', 'ZO'],                                       x: 85, y: 37 },
      { positions: ['STR', 'RA', 'ORM'],                               x: 85, y: 62 },
    ],
  },

  // ── 5-3-2 ────────────────────────────────────────────────────────────────
  '5-3-2': {
    GK: [{ positions: ['TW'],                                          x:  7, y: 37 }],
    DEF: [
      { positions: ['LV'],                                              x: 22, y:  8 },
      { positions: ['IVL'],                                             x: 22, y: 22 },
      { positions: ['IVZ'],                                             x: 22, y: 37 },
      { positions: ['IVR'],                                             x: 22, y: 52 },
      { positions: ['RV'],                                              x: 22, y: 66 },
    ],
    CDM: [
      { positions: ['DML', 'DMZ', 'OLM'],                              x: 52, y: 20 },
      { positions: ['ZO', 'DMZ'],                                       x: 52, y: 37 },
      { positions: ['DMR', 'ORM', 'DRM'],                              x: 52, y: 54 },
    ],
    CAM: [],
    FWD: [
      { positions: ['STL', 'STZ', 'LA', 'OLM'],                       x: 87, y: 27 },
      { positions: ['STR', 'STZ', 'RA', 'ORM'],                       x: 87, y: 47 },
    ],
  },
}

// ─── Canonical real-football formations ──────────────────────────────────────
// Each entry: display label (official name), nearest pitch template, and the
// exact DEF/CDM/CAM/FWD counts that map to it.
// detectFormation picks the entry with the smallest total absolute distance.
const CANONICAL_FORMATIONS = [
  { label: '4-2-3-1', template: '4-2-3-1', def: 4, cdm: 2, cam: 3, fwd: 1 },
  { label: '4-3-3',   template: '4-3-3',   def: 4, cdm: 3, cam: 0, fwd: 3 },
  { label: '4-3-3',   template: '4-0-3-3', def: 4, cdm: 0, cam: 3, fwd: 3 },
  { label: '4-2-2-2', template: '4-2-2-2', def: 4, cdm: 2, cam: 2, fwd: 2 },
  { label: '4-4-2',   template: '4-2-2-2', def: 4, cdm: 4, cam: 0, fwd: 2 },
  { label: '4-1-4-1', template: '4-2-3-1', def: 4, cdm: 1, cam: 4, fwd: 1 },
  { label: '4-5-1',   template: '4-2-3-1', def: 4, cdm: 5, cam: 0, fwd: 1 },
  { label: '4-3-2-1', template: '4-2-3-1', def: 4, cdm: 3, cam: 2, fwd: 1 },
  { label: '3-5-2',   template: '3-5-2',   def: 3, cdm: 4, cam: 1, fwd: 2 }, // LM+CDM+CDM+RM / CAM
  { label: '3-5-2',   template: '3-5-2',   def: 3, cdm: 5, cam: 0, fwd: 2 }, // flat 5-mid line
  { label: '3-4-3',   template: '3-4-3',   def: 3, cdm: 2, cam: 2, fwd: 3 },
  { label: '3-4-3',   template: '3-4-3',   def: 3, cdm: 4, cam: 0, fwd: 3 },
  { label: '5-3-2',   template: '5-3-2',   def: 5, cdm: 3, cam: 0, fwd: 2 },
  { label: '5-4-1',   template: '5-3-2',   def: 5, cdm: 4, cam: 0, fwd: 1 },
  { label: '5-4-1',   template: '5-3-2',   def: 5, cdm: 2, cam: 2, fwd: 1 },
  { label: '5-2-3',   template: '5-2-3',   def: 5, cdm: 2, cam: 0, fwd: 3 },
]

// ─── Squad composition validation ────────────────────────────────────────────
export function validateSquad(starters = []) {
  let gk = 0, def = 0, mid = 0, fwd = 0
  for (const p of starters) {
    const g = POS_TO_GROUP[p.position]
    if (g === 'GK')               gk++
    else if (g === 'DEF')         def++
    else if (g === 'CDM' || g === 'CAM') mid++
    else if (g === 'FWD')         fwd++
  }
  const errors = []
  if (gk !== 1)  errors.push(`GK: need exactly 1 (have ${gk})`)
  if (def < 3)   errors.push(`DEF: need at least 3 (have ${def})`)
  if (def > 5)   errors.push(`DEF: max 5 (have ${def})`)
  if (mid < 2)   errors.push(`MID: need at least 2 (have ${mid})`)
  if (mid > 6)   errors.push(`MID: max 6 (have ${mid})`)
  if (fwd < 1)   errors.push(`FWD: need at least 1 (have ${fwd})`)
  if (fwd > 3)   errors.push(`FWD: max 3 (have ${fwd})`)
  return { gk, def, mid, fwd, errors, valid: errors.length === 0 }
}

// ─── Internal: find canonical entry matching player counts ───────────────────
function findCanonicalEntry(defC, cdmC, camC, fwdC) {
  // Filter to formations with the exact same defender count first — this ensures
  // a 3-DEF squad is never labelled "4-2-3-1" and vice versa.
  const defCandidates = CANONICAL_FORMATIONS.filter(f => f.def === defC)
  // Then filter by exact forward count. A squad with 2 forwards is NEVER a
  // ...-1 formation regardless of how the mids are split. Without this, e.g.
  // (def=5, cdm=1, cam=2, fwd=2) was matching 5-4-1 (cdm=2, cam=2, fwd=1)
  // because the cdm/cam distance won out over the fwd diff.
  const fwdCandidates = defCandidates.filter(f => f.fwd === fwdC)
  const pool = fwdCandidates.length > 0
    ? fwdCandidates
    : (defCandidates.length > 0 ? defCandidates : CANONICAL_FORMATIONS)

  let best = pool[0], bestDist = Infinity, bestFwdDist = Infinity
  for (const f of pool) {
    const d = Math.abs(f.cdm - cdmC) + Math.abs(f.cam - camC) + Math.abs(f.fwd - fwdC)
    const fd = Math.abs(f.fwd - fwdC)
    if (d < bestDist || (d === bestDist && fd < bestFwdDist)) {
      bestDist = d; bestFwdDist = fd; best = f
    }
  }
  return best
}

// ─── Formation detection from user's actual picks ─────────────────────────────
export function detectFormation(players = []) {
  let def = 0, cdm = 0, cam = 0, fwd = 0
  for (const p of players) {
    const g = POS_TO_GROUP[p.position]
    if (g === 'DEF') def++
    else if (g === 'CDM') cdm++
    else if (g === 'CAM') cam++
    else if (g === 'FWD') fwd++
  }
  return findCanonicalEntry(def, cdm, cam, fwd).label
}

// ─── Resolve detected string to a template key ───────────────────────────────
function resolveTemplate(formation) {
  if (FORMATION_TEMPLATES[formation]) return formation

  // Map official names → nearest template key
  const canon = CANONICAL_FORMATIONS.find(f => f.label === formation)
  if (canon) return canon.template

  const MAP = {
    '4-3-3': '4-3-3',
    '4-4-2': '4-2-2-2',
    '4-5-1': '4-2-3-1',
    '4-3-2-1': '4-2-3-1',
    '4-1-4-1': '4-2-3-1',
    '3-5-2': '3-2-3-2',
    '3-4-3': '3-4-3',
    '5-2-3': '5-2-3',
    '5-3-2': '5-3-2',
    '5-4-1': '5-3-2',
  }
  if (MAP[formation]) return MAP[formation]

  // Last resort: least-squares on template keys
  const parts = formation.split('-').map(Number)
  let bestKey = '4-2-3-1', bestScore = Infinity
  for (const key of Object.keys(FORMATION_TEMPLATES)) {
    const kp = key.split('-').map(Number)
    const score = kp.reduce((s, v, i) => s + (v - (parts[i] ?? 0)) ** 2, 0)
    if (score < bestScore) { bestScore = score; bestKey = key }
  }
  return bestKey
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export function getFormationTemplate(formation) {
  const key = resolveTemplate(formation)
  return FORMATION_TEMPLATES[key] ?? FORMATION_TEMPLATES['4-2-3-1']
}

// ─── Vertical sort priority within each tier ─────────────────────────────────
// Lower number = higher up the pitch (smaller y). Unlisted codes → middle (2).
const TIER_Y_PRIORITY = {
  DEF: { LV: 0, IVL: 1, IVZ: 2, IVR: 3, RV: 4 },
  CDM: { DML: 0, DLM: 0, DMZ: 1, DMR: 2, DRM: 2 },
  CAM: { OLM: 0, LA: 0, ZO: 1, ORM: 2, RA: 2 },
  FWD: { STL: 0, STZ: 1, STR: 2 },
}

/**
 * Template-based formation layout.
 *
 * 1. Counts DEF/CDM/CAM/FWD from the actual players.
 * 2. Finds the nearest canonical formation, filtering first by DEF count so a
 *    3-DEF squad is never rendered as a "4-back" shape.
 * 3. Re-splits the combined mid pool into CDM / CAM bands according to the
 *    canonical entry's expected counts.
 * 4. Places each group at the template's x-position, spreading players evenly
 *    across the template's y-range for that band.
 */
export function assignPlayersToFormation(players) {
  if (!players.length) return []

  // ── 1. Bucket and count ───────────────────────────────────────────────────
  const byGroup = { GK: [], DEF: [], CDM: [], CAM: [], FWD: [] }
  let defC = 0, cdmC = 0, camC = 0, fwdC = 0
  for (const p of players) {
    const g = POS_TO_GROUP[p.position] ?? 'CDM'
    byGroup[g].push(p)
    if (g === 'DEF') defC++
    else if (g === 'CDM') cdmC++
    else if (g === 'CAM') camC++
    else if (g === 'FWD') fwdC++
  }

  // ── 2. Find canonical entry (DEF-count filtered) ──────────────────────────
  const canon = findCanonicalEntry(defC, cdmC, camC, fwdC)
  const template = FORMATION_TEMPLATES[canon.template] ?? FORMATION_TEMPLATES['4-2-3-1']

  // ── 3. Re-split mid pool to match canonical CDM/CAM counts ───────────────
  // Sort CDM players before CAM players so the defensive mids stay in the
  // deeper band; then slice at the canonical cdm count.
  const allMid = [
    ...byGroup.CDM.sort((a, b) => (TIER_Y_PRIORITY.CDM[a.position] ?? 2) - (TIER_Y_PRIORITY.CDM[b.position] ?? 2)),
    ...byGroup.CAM.sort((a, b) => (TIER_Y_PRIORITY.CAM[a.position] ?? 2) - (TIER_Y_PRIORITY.CAM[b.position] ?? 2)),
  ]
  byGroup.CDM = allMid.slice(0, canon.cdm)
  byGroup.CAM = allMid.slice(canon.cdm)

  // ── 3b. Bridge FWD/CAM gap to fill the canonical striker count ────────────
  // If the user picked fewer FWD than the formation expects (e.g. 1 FWD in a
  // 3-5-2), promote the most-attacking CAM player(s) to the FWD band so the
  // pitch shows the correct number of players up front.
  const fwdShortfall = canon.fwd - byGroup.FWD.length
  if (fwdShortfall > 0 && byGroup.CAM.length > fwdShortfall) {
    byGroup.FWD.push(...byGroup.CAM.splice(byGroup.CAM.length - fwdShortfall, fwdShortfall))
  }

  // ── 4. Place each group ───────────────────────────────────────────────────
  // Template provides the correct x for each band; y is spread evenly across
  // a fixed per-group range so players are never bunched regardless of how
  // many template slots exist for that band.
  const FALLBACK_X = { GK: 7, DEF: 22, CDM: 40, CAM: 62, FWD: 87 }

  const result = []

  for (const group of ['GK', 'DEF', 'CDM', 'CAM', 'FWD']) {
    const gPlayers = byGroup[group]
    if (!gPlayers.length) continue

    // Sort by natural vertical order (LV top → RV bottom, etc.)
    const priority = TIER_Y_PRIORITY[group] ?? {}
    const sorted = [...gPlayers].sort(
      (a, b) => (priority[a.position] ?? 2) - (priority[b.position] ?? 2),
    )

    // x comes from the template's middle slot (consistent within each band)
    const gSlots = (template[group] ?? []).slice().sort((a, b) => a.y - b.y)
    const refX = gSlots.length
      ? gSlots[Math.floor((gSlots.length - 1) / 2)].x
      : (FALLBACK_X[group] ?? 50)

    const n = sorted.length

    // y-range: use the template slot extent, but guarantee a minimum spread so
    // players are never bunched when actual count > template slot count.
    // minSpan grows with n so 4 players in a 2-slot band still spread nicely.
    let minY, maxY
    if (!gSlots.length) {
      minY = 10; maxY = 64
    } else {
      const rawMinY  = gSlots[0].y
      const rawMaxY  = gSlots[gSlots.length - 1].y
      const rawSpan  = rawMaxY - rawMinY
      const minSpan  = Math.min(58, 18 * Math.max(n - 1, 0))
      const span     = Math.max(rawSpan, minSpan)
      const midY     = (rawMinY + rawMaxY) / 2
      minY = Math.max(8,  midY - span / 2)
      maxY = Math.min(66, midY + span / 2)
    }

    sorted.forEach((p, i) => {
      const y = n === 1
        ? (minY + maxY) / 2
        : minY + (i / (n - 1)) * (maxY - minY)
      result.push({ ...p, x: refX, y, group })
    })
  }

  return result
}
