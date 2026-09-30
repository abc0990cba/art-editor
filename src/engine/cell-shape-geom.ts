/**
 * Unit-box silhouettes and hit tests of the cell forms. Every form answers "is this unit-box point
 * inside the figure" through cellShapeHit, which the glyph ramp generators (glyph-generators-forms)
 * sample to rasterize tiles that always match the canvas rendering of the same form. Hit tests
 * serve tone-scale rasters — corner radius/chamfer deliberately stay out of them.
 */

import { clamp, type CellShapeId, type ShapeParams } from './cell-shape-defs.ts'

export type UnitPt = [number, number]

const pol = (r: number, a: number): UnitPt => [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]

/* ------------------------------ static unit silhouettes ------------------------------ */

export const UNIT_SQUARE: UnitPt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
export const UNIT_TRIANGLE: UnitPt[] = [
  [0.5, 0],
  [1, 1],
  [0, 1],
]
export const UNIT_TRIANGLE_DOWN: UnitPt[] = [
  [0, 0],
  [1, 0],
  [0.5, 1],
]
export const UNIT_DIAMOND: UnitPt[] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
]
export const UNIT_HEXAGON: UnitPt[] = [
  [0.5, 0],
  [0.933, 0.25],
  [0.933, 0.75],
  [0.5, 1],
  [0.067, 0.75],
  [0.067, 0.25],
]
/** Cubic heart: anchor + 6 × (control, control, anchor). */
export const UNIT_HEART: UnitPt[] = [
  [0.5, 0.93],
  [0.1, 0.64],
  [0, 0.45],
  [0, 0.3],
  [0, 0.11],
  [0.16, 0],
  [0.31, 0],
  [0.41, 0],
  [0.47, 0.06],
  [0.5, 0.12],
  [0.53, 0.06],
  [0.59, 0],
  [0.69, 0],
  [0.84, 0],
  [1, 0.11],
  [1, 0.3],
  [1, 0.45],
  [0.9, 0.64],
  [0.5, 0.93],
]
/** Cubic teardrop: anchor + 4 × (control, control, anchor) — apex on top, round belly below. */
export const UNIT_TEARDROP: UnitPt[] = [
  [0.5, 0.04],
  [0.4, 0.26],
  [0.12, 0.38],
  [0.12, 0.6],
  [0.12, 0.81],
  [0.29, 0.96],
  [0.5, 0.96],
  [0.71, 0.96],
  [0.88, 0.81],
  [0.88, 0.6],
  [0.88, 0.38],
  [0.6, 0.26],
  [0.5, 0.04],
]

/* ------------------------------ parametric silhouettes ------------------------------ */

/** Star polygon: `points` outer vertices at radius 0.5, inner vertices at `inner`. */
export function starPoly(points: number, inner: number): UnitPt[] {
  const n = Math.max(3, Math.round(points))
  const rIn = clamp(inner, 0.05, 0.5)
  const pts: UnitPt[] = []
  for (let i = 0; i < n * 2; i++) {
    pts.push(pol(i % 2 === 0 ? 0.5 : rIn, -Math.PI / 2 + (Math.PI * i) / n))
  }
  return pts
}

/** Plus (diagonal=false) or × (diagonal=true) with arms `hw` half-width wide. */
export function crossPoly(hw: number, diagonal: boolean): UnitPt[] {
  const w = clamp(hw, 0.025, 0.25)
  const pts: UnitPt[] = [
    [0.5 - w, 0],
    [0.5 + w, 0],
    [0.5 + w, 0.5 - w],
    [1, 0.5 - w],
    [1, 0.5 + w],
    [0.5 + w, 0.5 + w],
    [0.5 + w, 1],
    [0.5 - w, 1],
    [0.5 - w, 0.5 + w],
    [0, 0.5 + w],
    [0, 0.5 - w],
    [0.5 - w, 0.5 - w],
  ]
  if (!diagonal) return pts
  const c = Math.SQRT1_2
  return pts.map(([px, py]) => {
    const dx = px - 0.5
    const dy = py - 0.5
    return [0.5 + dx * c - dy * c, 0.5 + dx * c + dy * c]
  })
}

/** Petal radius of the polar flower: cosine lobes rising from the valley radius to 0.5. */
function flowerRadius(petals: number, valley: number, th: number): number {
  return valley + (0.5 - valley) * Math.abs(Math.cos((petals * th) / 2))
}

/** Flower sampled finely enough that straight segments stay sub-pixel at any cell size. */
export function flowerPoly(points: number, thickness: number): UnitPt[] {
  const n = Math.max(3, Math.round(points))
  const valley = clamp(thickness, 0.05, 0.5)
  const total = n * 6
  const pts: UnitPt[] = []
  for (let i = 0; i < total; i++) {
    const th = (2 * Math.PI * i) / total
    pts.push(pol(flowerRadius(n, valley, th), th))
  }
  return pts
}

/** Gear: `points` trapezoid teeth; `thickness` sets how far the tips stand above the root circle. */
export function gearPoly(points: number, thickness: number): UnitPt[] {
  const n = Math.max(3, Math.round(points))
  const rin = 0.5 - clamp(thickness, 0.05, 0.5) * 0.8
  const pitch = (2 * Math.PI) / n
  const wa = pitch * 0.31
  const wb = wa * 0.55
  const pts: UnitPt[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * pitch
    pts.push(pol(rin, a - wa), pol(0.5, a - wb), pol(0.5, a + wb), pol(rin, a + wa))
  }
  return pts
}

/** Asterisk: exact silhouette of `points` crossed bars of half-width `thickness`/2. */
export function asteriskPoly(points: number, thickness: number): UnitPt[] {
  const n = Math.max(3, Math.round(points))
  const step = Math.PI / n
  // cap the half-width so neighbouring arms still carve a valley between the tips
  const w = Math.min(clamp(thickness, 0.05, 0.5) * 0.5, 0.5 * Math.sin(step / 2) * 0.9)
  const delta = Math.asin(2 * w)
  const rin = w / Math.sin(step / 2)
  const pts: UnitPt[] = []
  // every bar is double-ended: 2n ray directions around the center
  for (let i = 0; i < 2 * n; i++) {
    const a = -Math.PI / 2 + i * step
    pts.push(pol(0.5, a - delta), pol(0.5, a + delta), pol(rin, a + step / 2))
  }
  return pts
}

const BOLT: UnitPt[] = [
  [0.62, 0],
  [0.16, 0.54],
  [0.44, 0.54],
  [0.3, 1],
  [0.84, 0.44],
  [0.55, 0.44],
]

/** Lightning bolt: fixed silhouette, `thickness` squeezes its width around the vertical axis. */
export function lightningPoly(thickness: number): UnitPt[] {
  // 1.35 max keeps the widest squeeze (|x-0.5| ≤ 0.34 in the bolt) inside the unit box
  const sx = clamp(clamp(thickness, 0.05, 0.5) / 0.25, 0.55, 1.35)
  return BOLT.map(([x, y]) => [0.5 + (x - 0.5) * sx, y] as UnitPt)
}

/**
 * Chevron: a ^-band of vertical thickness `thickness` centered in the box, arms falling to the
 * sides.
 */
export function chevronPoly(thickness: number): UnitPt[] {
  const tv = clamp(thickness, 0.05, 0.5)
  const yEnd = 1 - tv / 2
  return [
    [0, yEnd - tv / 2],
    [0.5, 0.5 - tv / 2],
    [1, yEnd - tv / 2],
    [1, yEnd + tv / 2],
    [0.5, 0.5 + tv / 2],
    [0, yEnd + tv / 2],
  ]
}

/* ------------------------------ silhouette hit tests ------------------------------ */

/** Even-odd ray-cast point-in-polygon on unit-space points. */
export function unitPolyHit(poly: readonly UnitPt[], u: number, v: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Cubic silhouette flattened to a polygon for hit tests (same control points as the path). */
function cubicPolyPts(curve: readonly UnitPt[], samples = 6): UnitPt[] {
  const pts: UnitPt[] = [curve[0]]
  for (let seg = 1; seg < curve.length; seg += 3) {
    const [p0x, p0y] = curve[seg - 1]
    const [c1x, c1y] = curve[seg]
    const [c2x, c2y] = curve[seg + 1]
    const [p1x, p1y] = curve[seg + 2]
    for (let k = 1; k <= samples; k++) {
      const t = k / samples
      const m = 1 - t
      pts.push([
        m * m * m * p0x + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * p1x,
        m * m * m * p0y + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * p1y,
      ])
    }
  }
  return pts
}

const HEART_HITS = cubicPolyPts(UNIT_HEART)
const TEARDROP_HITS = cubicPolyPts(UNIT_TEARDROP)

/**
 * Moon: the unit disc with a circular bite scooped out between the top and right poles. `thickness`
 * scales the bite — small values carve a thin waxing crescent, large ones leave a fat moon. The
 * bite center slides along the tips' perpendicular bisector, so any thickness keeps the box center
 * inked (the glyph ramps grow the figure from there).
 */
export function moonBite(t: number): { cx: number; cy: number; r: number } {
  const s = 0.05 + clamp(t, 0.05, 0.5) * 0.7
  const k = Math.SQRT1_2 * s
  const cx = 0.75 + k
  const cy = 0.25 - k
  const r = Math.hypot(0.25 + k, 0.25 - k)
  return { cx, cy, r }
}

function moonHit(x: number, y: number, p: ShapeParams): boolean {
  const dx = x - 0.5
  const dy = y - 0.5
  if (dx * dx + dy * dy > 0.25) return false
  const b = moonBite(p.thickness)
  const bx = x - b.cx
  const by = y - b.cy
  return bx * bx + by * by >= b.r * b.r
}

/** Per-shape silhouette in the unrotated unit box, probed after cellShapeHit undoes the rotation. */
const HIT_OF: Record<CellShapeId, (x: number, y: number, p: ShapeParams) => boolean> = {
  square: (x, y) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
  circle: (x, y) => (x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) <= 0.25,
  ring: (x, y, p) => {
    const r = Math.hypot(x - 0.5, y - 0.5)
    return r <= 0.5 && r >= 0.5 - clamp(p.thickness, 0.05, 0.5)
  },
  triangle: (x, y) => unitPolyHit(UNIT_TRIANGLE, x, y),
  triangleDown: (x, y) => unitPolyHit(UNIT_TRIANGLE_DOWN, x, y),
  diamond: (x, y) => unitPolyHit(UNIT_DIAMOND, x, y),
  cross: (x, y, p) => unitPolyHit(crossPoly(p.thickness / 2, false), x, y),
  xCross: (x, y, p) => unitPolyHit(crossPoly(p.thickness / 2, true), x, y),
  star: (x, y, p) => unitPolyHit(starPoly(p.points, p.thickness), x, y),
  sparkle: (x, y, p) => unitPolyHit(starPoly(4, clamp(p.thickness * 0.7, 0.05, 0.5)), x, y),
  hexagon: (x, y) => unitPolyHit(UNIT_HEXAGON, x, y),
  heart: (x, y) => unitPolyHit(HEART_HITS, x, y),
  moon: (x, y, p) => moonHit(x, y, p),
  teardrop: (x, y) => unitPolyHit(TEARDROP_HITS, x, y),
  flower: (x, y, p) => {
    const dx = x - 0.5
    const dy = y - 0.5
    if (dx * dx + dy * dy > 0.25) return false
    const n = Math.max(3, Math.round(p.points))
    const valley = clamp(p.thickness, 0.05, 0.5)
    return Math.hypot(dx, dy) <= flowerRadius(n, valley, Math.atan2(dy, dx))
  },
  // dome: unit circle portion above the chord at y = 0.6 (slightly past the middle, so the
  // ramp probes converging on the center always land inside the ink)
  semicircle: (x, y) => (x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) <= 0.25 && y <= 0.6,
  gear: (x, y, p) => unitPolyHit(gearPoly(p.points, p.thickness), x, y),
  asterisk: (x, y, p) => unitPolyHit(asteriskPoly(p.points, p.thickness), x, y),
  lightning: (x, y, p) => unitPolyHit(lightningPoly(p.thickness), x, y),
  chevron: (x, y, p) => unitPolyHit(chevronPoly(p.thickness), x, y),
}

/**
 * Whether the point (u, v) in the unit cell box lies inside the form. Rotation turns the point
 * against the unrotated silhouette; ring relies on its wall thickness; radius/chamfer (polygon
 * corner rounding) are ignored — hit tests serve tone-scale rasters where corners stay sharp.
 */
export function cellShapeHit(id: CellShapeId, u: number, v: number, p: ShapeParams): boolean {
  const rad = (-p.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = u - 0.5
  const dy = v - 0.5
  const x = 0.5 + dx * cos - dy * sin
  const y = 0.5 + dx * sin + dy * cos
  return HIT_OF[id](x, y, p)
}
