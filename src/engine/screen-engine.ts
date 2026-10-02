/**
 * Halftone screen engine: tone → mark placement, shared by the fill tool's screen pattern, the
 * texture panel's halftone lattices and the node graph's halftone mod. One lattice generator (grid
 * / hex / rings / sunburst / spiral / phyllotaxis / scatter), mark silhouettes reused from the
 * cell-form registry and three tone mappings (size / density / twist). Pure.
 */

import type { CellShapeId, ShapeParams } from './cell-shape-defs.ts'
import { DEFAULT_SHAPE_PARAMS } from './cell-shape-defs.ts'
import { cellShapeHit } from './cell-shape-geom.ts'
import { hash2 } from './texture-core.ts'

/** Arrangement of the mark centers. Radial kinds anchor at the box center. */
export type ScreenLattice =
  | 'grid'
  | 'hex'
  | 'rings'
  | 'sunburst'
  | 'spiral'
  | 'phyllotaxis'
  | 'scatter'

export const SCREEN_LATTICES: readonly ScreenLattice[] = [
  'grid',
  'hex',
  'rings',
  'sunburst',
  'spiral',
  'phyllotaxis',
  'scatter',
]

/** How the tone drives the mark: growing size, keep/drop density or rotation span. */
export type ScreenMode = 'size' | 'density' | 'twist'

/** Mark silhouettes, drawn with the same geometry as the canvas cell forms. */
export type ScreenMark =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'star'
  | 'cross'
  | 'ring'
  | 'heart'
  | 'capsule'

const MARK_SHAPE: Record<ScreenMark, CellShapeId> = {
  circle: 'circle',
  square: 'square',
  diamond: 'diamond',
  triangle: 'triangle',
  hexagon: 'hexagon',
  star: 'star',
  cross: 'cross',
  ring: 'ring',
  heart: 'heart',
  capsule: 'capsule',
}

/** One mark center in cell units; `n` is the normalized distance from the box center (0..1). */
export interface ScreenPoint {
  x: number
  y: number
  n: number
}

/** Hard cap on lattice points per box (matches the texture fleck budget scale). */
export const MAX_SCREEN_POINTS = 20_000

/**
 * Mark centers of one lattice over the box [0,w)×[0,h) in cells, `pitch` cells apart. Radial
 * lattices anchor at the box center; scatter is a seeded best-candidate sample. Deterministic;
 * never more than MAX_SCREEN_POINTS points.
 */
export function latticePoints(
  kind: ScreenLattice,
  pitch: number,
  seed: number,
  w: number,
  h: number,
): ScreenPoint[] {
  const p = Math.max(1, pitch)
  const out: ScreenPoint[] = []
  const cx = w / 2
  const cy = h / 2
  const maxR = 0.5 * Math.hypot(w, h)
  const push = (x: number, y: number): void => {
    if (out.length >= MAX_SCREEN_POINTS) return
    if (x < -p || x > w + p || y < -p || y > h + p) return
    out.push({ x, y, n: maxR > 0 ? Math.min(1, Math.hypot(x - cx, y - cy) / maxR) : 0 })
  }
  if (kind === 'grid') {
    for (let j = 0; j * p < h; j++) {
      for (let i = 0; i * p < w; i++) push((i + 0.5) * p, (j + 0.5) * p)
    }
  } else if (kind === 'hex') {
    const rowH = p * 0.866
    for (let j = -1; j * rowH < h + rowH; j++) {
      for (let i = -1; i * p < w + p; i++) {
        push((i + 0.5) * p + (Math.abs(j % 2) as 0 | 1) * p * 0.5, (j + 0.5) * rowH)
      }
    }
  } else if (kind === 'rings' || kind === 'sunburst') {
    radialPoints(kind, push, { p, cx, cy, maxR })
  } else if (kind === 'spiral') {
    const da = p / Math.max(p * 0.7, 1)
    for (let a = 0; ; a += da) {
      const r = (p * a) / (2 * Math.PI)
      if (r > maxR || out.length >= MAX_SCREEN_POINTS) break
      push(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
  } else if (kind === 'phyllotaxis') {
    for (let k = 0; ; k++) {
      const r = p * 0.55 * Math.sqrt(k)
      if (r > maxR || out.length >= MAX_SCREEN_POINTS) break
      const a = k * 2.39996
      push(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
  } else {
    scatterPoints(out, p, seed, { w, h, cx, cy, maxR })
  }
  return out
}

/** Rings and sunburst: dot rings / radial rays around the box center. */
function radialPoints(
  kind: 'rings' | 'sunburst',
  push: (x: number, y: number) => void,
  geo: { p: number; cx: number; cy: number; maxR: number },
): void {
  const { p, cx, cy, maxR } = geo
  if (kind === 'rings') {
    for (let k = 1; k * p <= maxR; k++) {
      const r = k * p
      const count = Math.max(6, Math.round(2 * Math.PI * k))
      for (let m = 0; m < count; m++) {
        const a = (2 * Math.PI * m) / count
        push(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
    }
    return
  }
  const rays = Math.max(8, Math.round((2 * Math.PI * maxR) / p))
  for (let m = 0; m < rays; m++) {
    const a = (2 * Math.PI * m) / rays
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (let r = p * 0.75; r <= maxR; r += p) push(cx + r * ca, cy + r * sa)
  }
}

/** Best-candidate (Mitchell) scatter: each new point wins the farthest of 8 seeded tries. */
function scatterPoints(
  out: ScreenPoint[],
  p: number,
  seed: number,
  box: { w: number; h: number; cx: number; cy: number; maxR: number },
): void {
  const { w, h, cx, cy, maxR } = box
  const target = Math.min(MAX_SCREEN_POINTS, Math.floor((w * h) / (p * p * 0.9)))
  if (target <= 0) return
  let a = (seed | 0) ^ 0x9e_37_79_b9
  const rand = (): number => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  const minD = (x: number, y: number): number => {
    let best = Infinity
    for (const q of out) {
      const d = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y)
      if (d < best) best = d
    }
    return best
  }
  for (let k = 0; k < target; k++) {
    let bx = 0
    let by = 0
    let bd = -1
    for (let t = 0; t < 8; t++) {
      const x = rand() * w
      const y = rand() * h
      const d = out.length === 0 ? Infinity : minD(x, y)
      if (d > bd) {
        bd = d
        bx = x
        by = y
      }
    }
    out.push({ x: bx, y: by, n: maxR > 0 ? Math.hypot(bx - cx, by - cy) / maxR : 0 })
  }
}

/** Spatial hash over lattice points for O(1)-amortized nearest-center queries. */
export class LatticeIndex {
  private readonly buckets = new Map<number, number[]>()
  constructor(
    private readonly points: ScreenPoint[],
    private readonly pitch: number,
  ) {
    const p = Math.max(1, this.pitch)
    this.points.forEach((pt, i) => {
      const bx = Math.floor(pt.x / p)
      const by = Math.floor(pt.y / p)
      const key = bx * 0x10_00_00 + by
      const list = this.buckets.get(key)
      if (list) list.push(i)
      else this.buckets.set(key, [i])
    })
  }

  /** Lattice points in the buckets around (x, y) — every mark that could reach the cell. */
  near(x: number, y: number): ScreenPoint[] {
    const p = Math.max(1, this.pitch)
    const bx = Math.floor(x / p)
    const by = Math.floor(y / p)
    const out: ScreenPoint[] = []
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const list = this.buckets.get((bx + di) * 0x10_00_00 + (by + dj))
        if (!list) continue
        for (const i of list) out.push(this.points[i])
      }
    }
    return out
  }
}

/** Screen knobs shared by every surface. */
export interface ScreenStyle {
  lattice: ScreenLattice
  mark: ScreenMark
  mode: ScreenMode
  /** Mark pitch in cells (>= 1) */
  pitch: number
  /** Twist mode: rotation span in degrees over the full tone range */
  twist: number
  seed: number
}

/**
 * Whether the mark of the lattice point nearest to cell (x, y) covers that cell. `toneAt` returns
 * the ink coverage 0..1 at a cell; 1 = fully inked. Density keeps full marks stochastically; size
 * grows mark area with tone; twist rotates the mark by tone·twist.
 */
export function screenCellOn(
  style: ScreenStyle,
  index: LatticeIndex,
  x: number,
  y: number,
  toneAt: (x: number, y: number) => number,
): boolean {
  const t = toneAt(x, y)
  if (t <= 0) return false
  const p = Math.max(1, style.pitch)
  for (const pt of index.near(x + 0.5, y + 0.5)) {
    const u = (x + 0.5 - (pt.x - p / 2)) / p
    const v = (y + 0.5 - (pt.y - p / 2)) / p
    if (u < 0 || u > 1 || v < 0 || v > 1) continue
    if (style.mode === 'density') {
      const h = hash2(Math.round(pt.x * 64), Math.round(pt.y * 64), style.seed) / 4_294_967_296
      if (h < t) return true
      continue
    }
    const rotation = style.mode === 'twist' ? t * style.twist : 0
    const scale = style.mode === 'size' ? Math.min(1, Math.sqrt(t)) : 0.92
    if (screenShapeOn(style.mark, u, v, scale, rotation)) return true
  }
  return false
}

/** Silhouette test at cell-local (u, v) for a mark scaled to `scale` around the center. */
export function screenShapeOn(
  mark: ScreenMark,
  u: number,
  v: number,
  scale: number,
  rotation = 0,
): boolean {
  if (scale <= 0.02) return false
  const lu = 0.5 + (u - 0.5) / scale
  const lv = 0.5 + (v - 0.5) / scale
  if (lu < 0 || lu > 1 || lv < 0 || lv > 1) return false
  const params: ShapeParams =
    rotation === 0 ? DEFAULT_SHAPE_PARAMS : { ...DEFAULT_SHAPE_PARAMS, rotation }
  return cellShapeHit(MARK_SHAPE[mark], lu, lv, params)
}
