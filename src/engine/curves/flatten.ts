/**
 * Cubic evaluation and flattening: turning the anchor/handle model into dense polylines for
 * rasterization and hit-testing. All functions are deterministic — the same path always flattens to
 * the same points, which the parametric `source.bezier` regeneration relies on.
 */

import { segmentCubic, segmentCount, type CurvePath, type Pt } from './model.ts'

/** Max distance of both control points from the chord line that still reads as flat, in cells. */
export const FLATTEN_TOL = 0.2

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ]
}

/** De Casteljau split at parameter t: left half [p0..mid], right half [mid..p3]. */
export function splitCubic(
  p0: Pt,
  c1: Pt,
  c2: Pt,
  p3: Pt,
  t: number,
): { left: [Pt, Pt, Pt, Pt]; right: [Pt, Pt, Pt, Pt] } {
  const q0 = lerp(p0, c1, t)
  const q1 = lerp(c1, c2, t)
  const q2 = lerp(c2, p3, t)
  const r0 = lerp(q0, q1, t)
  const r1 = lerp(q1, q2, t)
  const mid = lerp(r0, r1, t)
  return {
    left: [p0, q0, r0, mid],
    right: [mid, r1, q2, p3],
  }
}

/**
 * Bow of the cubic out of its chord line: the convex hull contains the whole curve, so when both
 * controls sit on the chord (a collapsed-handle straight is the extreme case) the curve does too.
 */
function flatness(p0: Pt, c1: Pt, c2: Pt, p3: Pt): number {
  const ax = p3[0] - p0[0]
  const ay = p3[1] - p0[1]
  const len = Math.hypot(ax, ay)
  const bow = (c: Pt): number =>
    len < 1e-9
      ? Math.hypot(c[0] - p0[0], c[1] - p0[1])
      : Math.abs(ax * (c[1] - p0[1]) - ay * (c[0] - p0[0])) / len
  return Math.max(bow(c1), bow(c2))
}

/** Points of one cubic, start excluded end included, adaptively subdivided until flat. */
export function flattenCubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, tol = FLATTEN_TOL): Pt[] {
  const out: Pt[] = []
  const rec = (a: Pt, b: Pt, c: Pt, d: Pt, depth: number): void => {
    if (depth >= 18 || flatness(a, b, c, d) <= tol) {
      out.push(d)
      return
    }
    const { left, right } = splitCubic(a, b, c, d, 0.5)
    rec(left[0], left[1], left[2], left[3], depth + 1)
    rec(right[0], right[1], right[2], right[3], depth + 1)
  }
  rec(p0, c1, c2, p3, 0)
  return out
}

/**
 * The whole path as one dense polyline; a closed path repeats its first point at the end so
 * Bresenham walks close the loop. A single anchor flattens to just that point.
 */
export function flattenPath(path: CurvePath, tol = FLATTEN_TOL): Pt[] {
  const n = path.anchors.length
  if (n === 0) return []
  const a0 = path.anchors[0]
  const out: Pt[] = [[a0.x, a0.y]]
  const count = segmentCount(path)
  for (let i = 0; i < count; i++) {
    const [p0, c1, c2, p3] = segmentCubic(path, i)
    out.push(...flattenCubic(p0, c1, c2, p3, tol))
  }
  return out
}

/** Nearest point of segment `seg` to (x, y): coarse sampling plus local ternary refinement. */
export function nearestOnSegment(
  path: CurvePath,
  seg: number,
  x: number,
  y: number,
): { t: number; x: number; y: number; dist: number } {
  const [p0, c1, c2, p3] = segmentCubic(path, seg)
  const N = 64
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= N; i++) {
    const p = cubicAt(p0, c1, c2, p3, i / N)
    const d = (p[0] - x) ** 2 + (p[1] - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  let lo = Math.max(0, (best - 1) / N)
  let hi = Math.min(1, (best + 1) / N)
  for (let k = 0; k < 24; k++) {
    const t1 = lo + (hi - lo) / 3
    const t2 = hi - (hi - lo) / 3
    const p1 = cubicAt(p0, c1, c2, p3, t1)
    const p2 = cubicAt(p0, c1, c2, p3, t2)
    const d1 = (p1[0] - x) ** 2 + (p1[1] - y) ** 2
    const d2 = (p2[0] - x) ** 2 + (p2[1] - y) ** 2
    if (d1 <= d2) hi = t2
    else lo = t1
  }
  const t = (lo + hi) / 2
  const [px, py] = cubicAt(p0, c1, c2, p3, t)
  return { t, x: px, y: py, dist: Math.hypot(px - x, py - y) }
}
