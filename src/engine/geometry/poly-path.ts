import type { Pt } from './marching-squares.ts'

/**
 * Generic SVG path helpers shared by the grid renderer, the outline emitter and the cell-form
 * registry: tangent corner fillets for closed loops.
 */

export const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/** Turns shallower than ~10° read as arc samples or collinear splits, not corners. */
const CORNER_COS = 0.985

interface Seg {
  dx: number
  dy: number
  len: number
}

interface Dir {
  x: number
  y: number
}

interface LoopTopology {
  pts: Pt[]
  segs: Seg[]
  dirs: Dir[]
  /** Vertex indices of true corners, in loop order */
  corners: number[]
  cornerOf: boolean[]
  /** +1 if the loop winds with its majority turn sign */
  convexSign: number
  /** RunOf[j]: edge-run arc length from corners[j] to the next corner (arc samples included) */
  runOf: number[]
}

/** Consecutive duplicates removed (incl. wrap-around) so segments never have zero length. */
function dedupeLoop(raw: Pt[]): Pt[] {
  const pts: Pt[] = []
  for (const p of raw) {
    const last = pts.at(-1)
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p)
  }
  if (pts.length > 1) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (f.x === l.x && f.y === l.y) pts.pop()
  }
  return pts
}

function loopTopology(raw: Pt[]): LoopTopology {
  const pts = dedupeLoop(raw)
  const n = pts.length
  const segs: Seg[] = []
  const dirs: Dir[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    segs.push({ dx, dy, len })
    dirs.push({ x: dx / len, y: dy / len })
  }
  const cornerOf = new Array<boolean>(n).fill(false)
  const corners: number[] = []
  let crossSum = 0
  for (let i = 0; i < n; i++) {
    const d1 = dirs[(i - 1 + n) % n]
    const d2 = dirs[i]
    if (d1.x * d2.x + d1.y * d2.y < CORNER_COS) {
      cornerOf[i] = true
      corners.push(i)
    }
    crossSum += Math.sign(d1.x * d2.y - d1.y * d2.x)
  }
  const m = corners.length
  const runOf = new Array<number>(m)
  for (let j = 0; j < m; j++) {
    let len = 0
    for (let k = corners[j]; k !== corners[(j + 1) % m]; k = (k + 1) % n) len += segs[k].len
    runOf[j] = len
  }
  return { pts, segs, dirs, corners, cornerOf, convexSign: Math.sign(crossSum) || 1, runOf }
}

/** Point at arc distance `dist` from pts[start] along the loop direction (tangent point B). */
function runPoint(pts: Pt[], segs: Seg[], start: number, dist: number): Pt {
  const n = pts.length
  let k = start
  let left = dist
  while (k < start + n && left > segs[k % n].len) {
    left -= segs[k % n].len
    k++
  }
  const i = k % n
  const f = left / segs[i].len
  return { x: pts[i].x + segs[i].dx * f, y: pts[i].y + segs[i].dy * f }
}

/** Point at arc distance `dist` before pts[start] along the loop, with that segment's direction. */
function runPointBackward(
  pts: Pt[],
  segs: Seg[],
  start: number,
  dist: number,
): { point: Pt; dir: Dir } {
  const n = pts.length
  let k = (start - 1 + n) % n
  let left = dist
  while (k !== start && left >= segs[k].len) {
    left -= segs[k].len
    k = (k - 1 + n) % n
  }
  const seg = segs[k]
  return {
    point: {
      x: pts[(k + 1) % n].x - (seg.dx / seg.len) * left,
      y: pts[(k + 1) % n].y - (seg.dy / seg.len) * left,
    },
    dir: { x: seg.dx / seg.len, y: seg.dy / seg.len },
  }
}

interface Fillet {
  i: number
  t: number
  entry: Pt
  entryDir: Dir
  exit: Pt
  cross: number
}

/** Tangent length, entry/exit points and local turn of one corner's fillet (pass 1). */
function planFillets(
  topology: LoopTopology,
  radiusFor: (convex: boolean) => number,
  keepCorner?: (p: Pt) => boolean,
): Fillet[] {
  const { pts, segs, dirs, corners, runOf, convexSign } = topology
  const fillets: Fillet[] = []
  for (let j = 0; j < corners.length; j++) {
    const i = corners[j]
    const p = pts[i]
    const d1 = dirs[(i - 1 + pts.length) % pts.length]
    const d2 = dirs[i]
    const cross = d1.x * d2.y - d1.y * d2.x
    const r = radiusFor(Math.sign(cross) === convexSign)
    let t = Math.min(r, runOf[j] / 2, runOf[(j - 1 + corners.length) % corners.length] / 2)
    if (keepCorner && !keepCorner(p)) t = 0
    const back = runPointBackward(pts, segs, i, t)
    fillets.push({
      i,
      t,
      entry: back.point,
      entryDir: back.dir,
      exit: t > 0 ? runPoint(pts, segs, i, t) : p,
      cross,
    })
  }
  return fillets
}

/** Mark the samples covered by a fillet along either of its runs (pass 2). */
function markConsumed(consumed: boolean[], segs: Seg[], i: number, t: number): void {
  const n = consumed.length
  let remaining = t
  for (let k = (i - 1 + n) % n; remaining > 1e-9 && k !== i; k = (k - 1 + n) % n) {
    if (remaining < segs[k].len - 1e-9) break // the entry lands inside this segment
    consumed[k] = true
    remaining -= segs[k].len
  }
  remaining = t
  for (let k = i; remaining > 1e-9; k = (k + 1) % n) {
    if (remaining < segs[k].len - 1e-9) break
    consumed[(k + 1) % n] = true
    remaining -= segs[k].len
  }
}

/** One fillet's path segment: tangent arc (or chamfer cut) from the entry to the exit point. */
function filletCommand(f: Fillet, chamfer: boolean): string {
  if (chamfer) return `L${fmt(f.exit.x)} ${fmt(f.exit.y)}`
  const chx = f.exit.x - f.entry.x
  const chy = f.exit.y - f.entry.y
  const denom = 2 * Math.abs(f.entryDir.x * chy - f.entryDir.y * chx)
  const rad = (chx * chx + chy * chy) / denom
  return Number.isFinite(rad) && rad > 0
    ? `A${fmt(rad)} ${fmt(rad)} 0 0 ${f.cross > 0 ? 1 : 0} ${fmt(f.exit.x)} ${fmt(f.exit.y)}`
    : `L${fmt(f.exit.x)} ${fmt(f.exit.y)}`
}

/**
 * Tangent fillets for one closed loop. Every true corner (turn above ~10°) is replaced by a
 * circular arc: the tangent length t clamps to half of the whole edge run to the neighboring
 * corners (arc samples included, so a curved run never starves a fillet), the entry/exit points sit
 * at arc distance t along those runs (interpolated when t passes the first segment), and the arc —
 * tangent to the entry edge, through the exit — has radius |chord|² / 2·|cross|, equal to t /
 * tan(θ/2) while the exit lies on the outgoing edge (equal to t at 90°, so square grids stay
 * byte-identical). Chamfer style keeps the same tangent points as a straight cut. `radiusFor` picks
 * the radius per corner (convex = turning with the loop's majority winding); `keepCorner` forces t
 * = 0 so e.g. canvas-border corners keep their angle.
 */
export function filletPath(
  raw: Pt[],
  chamfer: boolean,
  radiusFor: (convex: boolean) => number,
  keepCorner?: (p: Pt) => boolean,
): string {
  const topology = loopTopology(raw)
  const { pts, segs, corners, cornerOf } = topology
  const n = pts.length
  if (n < 3) return ''
  if (corners.length === 0) {
    // corner-free loop (e.g. a full-disc union boundary): plain polygon
    return `M${pts.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`
  }
  const fillets = planFillets(topology, radiusFor, keepCorner)
  const consumed = new Array<boolean>(n).fill(false)
  for (const f of fillets) {
    if (f.t > 0) markConsumed(consumed, segs, f.i, f.t)
  }
  let d = ''
  let first = true
  for (let k = 0; k < n; k++) {
    const i = (corners[0] + k) % n
    if (cornerOf[i]) {
      const f = fillets[corners.indexOf(i)]
      const anchor = f.t > 0 ? f.entry : pts[i]
      d += `${first ? 'M' : 'L'}${fmt(anchor.x)} ${fmt(anchor.y)}`
      if (f.t > 0) d += filletCommand(f, chamfer)
    } else if (!consumed[i]) {
      // arc sample between corners: keep it, or the curved edge collapses into a chord
      d += `${first ? 'M' : 'L'}${fmt(pts[i].x)} ${fmt(pts[i].y)}`
    }
    first = false
  }
  return d ? `${d}Z` : ''
}

/** Rounded polygon: fillet every true corner with the same radius. */
export function roundedPolygonPath(poly: Pt[], r: number, chamfer: boolean): string {
  return filletPath(poly, chamfer, () => r)
}

/**
 * Shortest true edge of a polygon: the minimal edge-run arc length between consecutive corners,
 * with collinear split vertices and arc samples merged into their run. This is the per-grid
 * rounding base — `radius * base` keeps the square-grid semantics where radius is a fraction of the
 * cell's smaller side (unit lattices give base = 1, hex at radius 0.5 rounds to a circle). Polygons
 * without any true corner fall back to the shortest segment.
 */
export function minCornerRun(poly: Pt[]): number {
  const { pts, segs, corners } = loopTopology(poly)
  const n = pts.length
  if (n < 3) return 0
  const m = corners.length
  if (m < 1) {
    let min = Infinity
    for (const s of segs) min = Math.min(min, s.len)
    return min
  }
  let min = Infinity
  for (let j = 0; j < m; j++) {
    let len = 0
    for (let k = corners[j]; k !== corners[(j + 1) % m]; k = (k + 1) % n) len += segs[k].len
    min = Math.min(min, len)
  }
  return min
}
