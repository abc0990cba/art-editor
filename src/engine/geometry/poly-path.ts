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

/**
 * Tangent fillets for one closed loop. Every true corner (turn above ~10°) is replaced by a
 * circular arc tangent to both edges: the tangent length t clamps to half of the whole edge run to
 * the neighboring corners (arc samples included, so a curved run never starves a fillet), and the
 * arc radius is t / tan(θ/2) — exactly tangent to both edges, and equal to t for the 90° corners of
 * the square grid. Chamfer style keeps the same tangent points as a straight cut. `radiusFor` picks
 * the radius per corner (convex = turning with the loop's majority winding); `keepCorner` forces t
 * = 0 so e.g. canvas-border corners keep their angle.
 */
export function filletPath(
  raw: Pt[],
  chamfer: boolean,
  radiusFor: (convex: boolean) => number,
  keepCorner?: (p: Pt) => boolean,
): string {
  const { pts, segs, dirs, corners, cornerOf, convexSign, runOf } = loopTopology(raw)
  const n = pts.length
  if (n < 3) return ''
  const m = corners.length
  if (m < 3) {
    // degenerate: plain polygon
    return `M${pts.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`
  }
  const cornerIdx = new Map<number, number>()
  for (let j = 0; j < m; j++) cornerIdx.set(corners[j], j)
  let d = ''
  let first = true
  // arc length still consumed by the previous corner's fillet on the shared edge run
  let skip = 0
  // walk from the first corner: a fillet may consume samples past the loop seam
  const start = corners[0]
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (cornerOf[i]) {
      const j = cornerIdx.get(i)!
      const p = pts[i]
      const d1 = dirs[(i - 1 + n) % n]
      const d2 = dirs[i]
      const cross = d1.x * d2.y - d1.y * d2.x
      const r = radiusFor(Math.sign(cross) === convexSign)
      let t = Math.min(r, runOf[j] / 2, runOf[(j - 1 + m) % m] / 2)
      if (keepCorner && !keepCorner(p)) t = 0
      d += `${first ? 'M' : 'L'}${fmt(p.x - d1.x * t)} ${fmt(p.y - d1.y * t)}`
      if (t > 0) {
        // first-segment tangent points keep the classic exact formula (square grids stay
        // byte-identical); deeper points interpolate along the run
        const b =
          t <= segs[i].len ? { x: p.x + d2.x * t, y: p.y + d2.y * t } : runPoint(pts, segs, i, t)
        const theta = Math.acos(Math.min(1, Math.max(-1, d1.x * d2.x + d1.y * d2.y)))
        const rad = t / Math.tan(theta / 2)
        d += chamfer
          ? `L${fmt(b.x)} ${fmt(b.y)}`
          : `A${fmt(rad)} ${fmt(rad)} 0 0 ${cross > 0 ? 1 : 0} ${fmt(b.x)} ${fmt(b.y)}`
      }
      skip = t
    } else {
      const prevLen = segs[(i - 1 + n) % n].len
      if (skip >= prevLen) {
        skip -= prevLen
        continue // inside the consumed run: the fillet arc already covers this sample
      }
      skip = 0
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
 * without 3 true corners fall back to the shortest segment.
 */
export function minCornerRun(poly: Pt[]): number {
  const { pts, segs, corners } = loopTopology(poly)
  const n = pts.length
  if (n < 3) return 0
  const m = corners.length
  if (m < 3) {
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
