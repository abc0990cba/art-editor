/**
 * Pure editing operations on the pen draft: hit-testing, anchor/handle dragging, smooth/corner
 * conversion, segment bending, insertion and deletion. Every function returns a new CurvePath and
 * never mutates its argument — the store slice treats paths as immutable state.
 */

import { nearestOnSegment, splitCubic } from './flatten.ts'
import {
  clonePath,
  makeAnchor,
  segmentCubic,
  segmentCount,
  segmentEnd,
  type CurveAnchor,
  type CurvePath,
  type Pt,
} from './model.ts'

export type PenHit =
  | { kind: 'handle'; i: number; which: 'in' | 'out' }
  | { kind: 'anchor'; i: number }
  | { kind: 'segment'; seg: number; t: number }

/** Nearest editable thing within `tol` doc units: handles and anchors first, then segments. */
export function hitPen(path: CurvePath | null, x: number, y: number, tol: number): PenHit | null {
  if (!path || path.anchors.length === 0) return null
  const cands: (PenHit & { dist: number })[] = []
  const keep = (dist: number, hit: PenHit): void => {
    if (dist <= tol) cands.push({ ...hit, dist })
  }
  path.anchors.forEach((a, i) => {
    keep(Math.hypot(a.x - x, a.y - y), { kind: 'anchor', i })
    if (a.hIn) keep(Math.hypot(a.hIn[0] - x, a.hIn[1] - y), { kind: 'handle', i, which: 'in' })
    if (a.hOut) keep(Math.hypot(a.hOut[0] - x, a.hOut[1] - y), { kind: 'handle', i, which: 'out' })
  })
  const count = segmentCount(path)
  for (let seg = 0; seg < count; seg++) {
    const n = nearestOnSegment(path, seg, x, y)
    keep(n.dist, { kind: 'segment', seg, t: n.t })
  }
  if (cands.length === 0) return null
  // stable sort keeps registration order on ties, so anchors win over their own segment
  cands.sort((a, b) => a.dist - b.dist)
  const { dist: _dist, ...hit } = cands[0]
  return hit
}

/** A smooth point's auto handles: Catmull-Rom tangents, /6 standard, clamped at open ends. */
function autoHandles(a: Pt, prev: Pt, next: Pt): { hIn: Pt; hOut: Pt } {
  const dx = (next[0] - prev[0]) / 6
  const dy = (next[1] - prev[1]) / 6
  return {
    hIn: [a[0] - dx, a[1] - dy],
    hOut: [a[0] + dx, a[1] + dy],
  }
}

function neighbors(path: CurvePath, i: number): [Pt, Pt] {
  const n = path.anchors.length
  const pt = (a: CurveAnchor): Pt => [a.x, a.y]
  const open = !path.closed
  const prev = open && i === 0 ? path.anchors[0] : path.anchors[(i - 1 + n) % n]
  const next = open && i === n - 1 ? path.anchors[n - 1] : path.anchors[(i + 1) % n]
  return [pt(prev), pt(next)]
}

export function smoothAnchor(path: CurvePath, i: number): CurvePath {
  const out = clonePath(path)
  const a = out.anchors[i]
  const [prev, next] = neighbors(out, i)
  const { hIn, hOut } = autoHandles([a.x, a.y], prev, next)
  a.hIn = hIn
  a.hOut = hOut
  return out
}

/** Corner anchors (both handles null) become smooth with auto handles; smooth ones go corner. */
export function toggleSmooth(path: CurvePath, i: number): CurvePath {
  const a = path.anchors[i]
  return a.hIn === null && a.hOut === null ? smoothAnchor(path, i) : cornerAnchor(path, i)
}

function cornerAnchor(path: CurvePath, i: number): CurvePath {
  const out = clonePath(path)
  out.anchors[i].hIn = null
  out.anchors[i].hOut = null
  return out
}

/** Smooth every anchor of the path in one step (the "Smooth all" action). */
export function smoothAll(path: CurvePath): CurvePath {
  let out = clonePath(path)
  for (let i = 0; i < out.anchors.length; i++) out = smoothAnchor(out, i)
  return out
}

/** Move an anchor; its handles travel along so the local curve shape is preserved. */
export function moveAnchor(path: CurvePath, i: number, x: number, y: number): CurvePath {
  const out = clonePath(path)
  const a = out.anchors[i]
  const dx = x - a.x
  const dy = y - a.y
  a.x = x
  a.y = y
  if (a.hIn) {
    a.hIn[0] += dx
    a.hIn[1] += dy
  }
  if (a.hOut) {
    a.hOut[0] += dx
    a.hOut[1] += dy
  }
  return out
}

/**
 * Drag one handle to `h`. With `mirror` the opposite handle follows symmetrically (only when it
 * already exists, so broken corners stay broken) — Alt-dragging passes `false` to break free.
 */
export function setHandle(
  path: CurvePath,
  i: number,
  which: 'in' | 'out',
  h: Pt,
  mirror: boolean,
): CurvePath {
  const out = clonePath(path)
  const a = out.anchors[i]
  const key = which === 'in' ? 'hIn' : 'hOut'
  const otherKey = which === 'in' ? 'hOut' : 'hIn'
  a[key] = [h[0], h[1]]
  if (mirror && a[otherKey]) {
    a[otherKey] = [2 * a.x - h[0], 2 * a.y - h[1]]
  }
  return out
}

/**
 * Bend a segment by dragging: both control points follow the pointer delta from the drag-start
 * snapshot; missing handles materialize first, which is what turns a straight run into a curve.
 */
export function bendSegment(startPath: CurvePath, seg: number, dx: number, dy: number): CurvePath {
  const out = clonePath(startPath)
  const a = out.anchors[seg]
  const b = out.anchors[segmentEnd(out, seg)]
  const [, c1, c2] = segmentCubic(startPath, seg)
  a.hOut = [c1[0] + dx, c1[1] + dy]
  b.hIn = [c2[0] + dx, c2[1] + dy]
  return out
}

/**
 * Split segment `seg` at parameter t and insert the new anchor there, inheriting the halves. A
 * straight segment stays straight: the inserted anchor is a plain corner and the neighbors keep
 * their (null) handles.
 */
export function insertAnchor(path: CurvePath, seg: number, t: number): CurvePath {
  const out = clonePath(path)
  const [p0, c1, c2, p3] = segmentCubic(path, seg)
  const at = path.closed && seg === path.anchors.length - 1 ? out.anchors.length : seg + 1
  const a = out.anchors[seg]
  const b = out.anchors[segmentEnd(out, seg)]
  if (a.hOut === null && b.hIn === null) {
    out.anchors.splice(at, 0, makeAnchor(p0[0] + (p3[0] - p0[0]) * t, p0[1] + (p3[1] - p0[1]) * t))
    return out
  }
  const { left, right } = splitCubic(p0, c1, c2, p3, t)
  a.hOut = left[1]
  b.hIn = right[2]
  const mid: CurveAnchor = { x: left[3][0], y: left[3][1], hIn: left[2], hOut: right[1] }
  out.anchors.splice(at, 0, mid)
  return out
}

/** Remove an anchor and its handles; a closed path opens up once fewer than 2 anchors remain. */
export function deleteAnchor(path: CurvePath, i: number): CurvePath {
  const out = clonePath(path)
  out.anchors.splice(i, 1)
  if (out.anchors.length < 2) out.closed = false
  return out
}

/** Snap angle of a rubber-band segment to the constraint: null = free, 45 = 45° steps, ortho. */
export type AngleSnap = 'free' | 'deg45' | 'ortho'

export function constrainPoint(
  origin: Pt,
  x: number,
  y: number,
  snap: AngleSnap,
  shift: boolean,
): Pt {
  const deg45 = snap === 'deg45' || shift
  const ortho = snap === 'ortho'
  if (!deg45 && !ortho) return [x, y]
  const dx = x - origin[0]
  const dy = y - origin[1]
  const step = Math.PI / 4
  const angle = Math.atan2(dy, dx)
  const len = Math.hypot(dx, dy)
  if (ortho) {
    return Math.abs(dx) >= Math.abs(dy) ? [x, origin[1]] : [origin[0], y]
  }
  const snapped = Math.round(angle / step) * step
  return [origin[0] + Math.cos(snapped) * len, origin[1] + Math.sin(snapped) * len]
}
