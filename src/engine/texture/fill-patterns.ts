/** Fill-pattern math: per-cell pattern predicates and gradient mix ratios. Pure, stateless. */

import type { Doc } from '../core/doc'
import {
  BAYER2,
  BAYER4,
  BAYER8,
  BAYER16,
  CLUSTER4,
  HALFTONE4,
  BLUE_NOISE8,
  VOID_CLUSTER8,
  thresholdAt,
} from '../dither/matrices.ts'
import { glyphCellAt, type GlyphTileSet } from '../glyph/tiles.ts'
import type { FillGradient, FillHtLattice, FillHtShape, FillPatternId } from './fill-data.ts'

/**
 * Pattern fills for the fill tool: two-color textures and dithered gradients in the classic
 * pixel-art style. A pattern decides per cell between the active color (A) and a second color (B);
 * a transition profile sets the mix ratio t per position, so the same patterns double as flat
 * textures (flat) or dithered gradients.
 */
const mod = (v: number, m: number) => ((v % m) + m) % m
const fract = (v: number) => v - Math.floor(v)

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263)
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  h ^= h >>> 16
  return (h >>> 0) / 4_294_967_296
}

export interface PatternOpts {
  /** Tile set for the glyph pattern */
  glyph?: GlyphTileSet | null
  /** Tile-size multiplier for scaled patterns */
  scale?: number
  /** Noise block size in cells (noise, ign) */
  grain?: number
  /** Anchor for concentric patterns (rings) */
  seed?: { x: number; y: number }
  /** Halftone screen: dot silhouette */
  htShape?: FillHtShape
  /** Halftone screen: grid rotation in degrees, 0..180 */
  htAngle?: number
  /** Halftone screen: random dot displacement, 0..100 */
  htJitter?: number
  /** Halftone screen: randomly missing dots, 0..100 */
  htDropout?: number
  /** Halftone screen: mark arrangement */
  htLattice?: FillHtLattice
}

/** Smooth bilinear value noise over `hash2` — clustered dropout patches. */
function htNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const v = (a: number, b: number) => hash2(a * 31 + 7, b * 31 + 11)
  return (
    (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) +
    (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy
  )
}

/**
 * Whether the cell at buffer position (x, y) takes color B for mix ratio t (0..1). Ordered
 * dithering compares t against a Bayer threshold; stripes, hatching and shapes grow with t; scaled
 * patterns repeat every 4·scale cells.
 */

/**
 * Cached screen rotation for the current angle: a fill region evaluates this per cell, so the trig
 * runs once per angle change instead of once per cell.
 */
let screenAngleCache: { deg: number; ca: number; sa: number } | null = null

function screenAngle(o: PatternOpts): { ca: number; sa: number } {
  const deg = ((((o.htAngle ?? 45) % 180) + 180) % 180) * (Math.PI / 180)
  const hit = screenAngleCache
  if (hit && hit.deg === deg) return hit
  const next = { deg, ca: Math.cos(deg), sa: Math.sin(deg) }
  screenAngleCache = next
  return next
}

/** One cell of the halftone screen pattern (grid / hex / rings), tone in dot area. */
function screenPatternAt(o: PatternOpts, x: number, y: number, c: number, s: number): boolean {
  // true halftone screen: a rotated dot grid in screen space, tone in dot
  // area. Shapes morph like print screens — round dots, squares, diamonds,
  // elliptical chains or plain bands; jitter scatters the grid, dropout
  // wears patches of dots away.
  const pitch = 6 * s
  const { ca, sa } = screenAngle(o)
  let iu = 0
  let iv = 0
  let du = 0
  let dv = 0
  if (o.htLattice === 'rings') {
    // polar screen: dot rings around the pattern anchor, tone in dot area
    const ax = x - (o.seed?.x ?? 0)
    const ay = y - (o.seed?.y ?? 0)
    const r = Math.hypot(ax, ay) / pitch
    const a = Math.atan2(ay, ax)
    const k = Math.max(1, Math.round(r))
    const count = Math.max(6, Math.round(2 * Math.PI * k))
    const ang = ((a / (2 * Math.PI)) * count + count) % count
    iu = Math.floor(ang)
    iv = k
    du = ang - iu - 0.5
    dv = r - k
  } else {
    const u = (x * ca + y * sa) / pitch
    let v = (y * ca - x * sa) / pitch
    if (o.htLattice === 'hex') v /= 0.866
    iu = Math.floor(u + (o.htLattice === 'hex' ? (Math.floor(v) % 2 === 0 ? 0 : 0.5) : 0))
    iv = Math.floor(v)
    du = u - iu - 0.5
    dv = v - iv - 0.5
  }
  const jit = Math.max(0, Math.min(100, o.htJitter ?? 0)) / 100
  if (jit > 0) {
    du += (hash2(iu * 7 + 1, iv * 7 + 3) - 0.5) * jit
    dv += (hash2(iu * 7 + 5, iv * 7 + 9) - 0.5) * jit
  }
  const dropout = Math.max(0, Math.min(100, o.htDropout ?? 0)) / 100
  if (dropout > 0 && htNoise(iu / 2, iv / 2) < dropout * 0.95) return false
  if (c >= 0.999) return true
  switch (o.htShape ?? 'dot') {
    case 'dot':
    case 'square':
    case 'diamond':
    case 'line':
    case 'ellipse':
    case 'star':
    case 'heart':
    case 'cross':
      return screenShapeHit(o.htShape ?? 'dot', du, dv, c)
    default:
      return screenShapeHit('dot', du, dv, c)
  }
}

/** Silhouette test of one screen dot at the normalized in-cell offset (du, dv); c = tone. */
function screenShapeHit(shape: FillHtShape, du: number, dv: number, c: number): boolean {
  switch (shape) {
    case 'square': {
      const h = Math.sqrt(c) / 2
      return Math.abs(du) < h && Math.abs(dv) < h
    }
    case 'diamond': {
      const r = Math.sqrt(c / 2)
      return Math.abs(du) + Math.abs(dv) < r
    }
    case 'line': {
      return Math.abs(dv) < c / 2
    }
    case 'ellipse': {
      // wide ellipses overlap along the row mid-tone — the chain-dot screen
      const rx = 0.8 * Math.sqrt((2 * c) / Math.PI)
      const ry = 0.8 * Math.sqrt(c / (2 * Math.PI))
      return (du / rx) * (du / rx) + (dv / ry) * (dv / ry) < 1
    }
    case 'star': {
      // five-point star: polar radius minimum over the star wedge profile
      const r = Math.hypot(du, dv)
      if (r < 1e-9) return true
      const ang = Math.atan2(dv, du)
      const k = 0.45 + 0.55 * Math.abs(Math.cos(((2.5 * ang) % Math.PI) - Math.PI / 2) * 1.6)
      return r < Math.sqrt(c) * Math.min(1.6, k)
    }
    case 'heart': {
      // classic heart curve, scaled so the area matches the dot at mid-tone
      const px = du * 1.7
      const py = -dv * 1.9 + 0.32
      const a2 = px * px + py * py - 1
      return a2 * a2 * a2 - px * px * py * py * py < 0
    }
    case 'cross': {
      const arm = Math.sqrt(c) / 2
      const w = Math.sqrt(c) / 6
      return (Math.abs(du) < w && Math.abs(dv) < arm) || (Math.abs(dv) < w && Math.abs(du) < arm)
    }
    default: {
      const r = Math.sqrt(c / Math.PI)
      return du * du + dv * dv < r * r
    }
  }
}

export function patternAt(
  id: FillPatternId,
  x: number,
  y: number,
  t: number,
  o: PatternOpts = {},
): boolean {
  const c = Math.min(1, Math.max(0, t))
  const s = Math.max(1, Math.round(o.scale ?? 1))
  switch (id) {
    case 'bayer2': {
      return c > thresholdAt(BAYER2, 2, 4, x, y)
    }
    case 'bayer4': {
      return c > thresholdAt(BAYER4, 4, 16, x, y)
    }
    case 'bayer8': {
      return c > thresholdAt(BAYER8, 8, 64, x, y)
    }
    case 'bayer16': {
      return c > thresholdAt(BAYER16, 16, 256, x, y)
    }
    case 'cluster': {
      // clustered-dot print screen: ink grows in a spiral from each 4×4 cell
      return c > thresholdAt(CLUSTER4, 4, 16, x, y)
    }
    case 'halftone': {
      // diamond halftone dots, the newspaper-print look
      return c > thresholdAt(HALFTONE4, 4, 16, x, y)
    }
    case 'screen': {
      return screenPatternAt(o, x, y, c, s)
    }
    case 'blue-noise': {
      // aperiodic high-frequency mask — no visible grid, evenly speckled
      return c > thresholdAt(BLUE_NOISE8, 8, 16, x, y)
    }
    case 'void-cluster': {
      // void-and-cluster: blue-noise character on a finer 8×8×256 grain
      return c > thresholdAt(VOID_CLUSTER8, 8, 256, x, y)
    }
    case 'noise': {
      const g = Math.max(1, Math.round(o.grain ?? 1))
      return hash2(Math.floor(x / g), Math.floor(y / g)) < c
    }
    case 'ign': {
      // interleaved gradient noise — like white noise but visibly smoother
      const g = Math.max(1, Math.round(o.grain ?? 1))
      const n = fract(
        52.9829189 * fract(0.06711056 * Math.floor(x / g) + 0.00583715 * Math.floor(y / g)),
      )
      return n < c
    }
    case 'checker': {
      // coarse Bayer-2: an s×s-block checkerboard at 50%
      return c > (BAYER2[mod(Math.floor(y / s), 2)][mod(Math.floor(x / s), 2)] + 0.5) / 4
    }
    case 'grid': {
      // windowpane: lines along the top/left of each cell×cell tile
      const cell = 4 * s
      const w = Math.round(c * cell)
      return mod(x, cell) < w || mod(y, cell) < w
    }
    case 'hatch': {
      // both diagonal directions at once
      const p = 4 * s
      const band = Math.round(c * p)
      return mod(x + y, p) < band || mod(x - y, p) < band
    }
    case 'stripes-h': {
      return mod(y, 4 * s) < Math.round(c * 4 * s)
    }
    case 'stripes-v': {
      return mod(x, 4 * s) < Math.round(c * 4 * s)
    }
    case 'stripes-diag': {
      return mod(x + y, 4 * s) < Math.round(c * 4 * s)
    }
    case 'zigzag': {
      // rows offset by a triangle wave; scale sets amplitude and spacing
      const p = 4 * s
      const tri = Math.abs(mod(x, 4 * s) / (2 * s) - 1)
      return mod(y - Math.round(tri * s), p) < Math.round(c * p)
    }
    case 'dots': {
      const tile = 4 * s
      const dx = mod(x, tile) + 0.5 - tile / 2
      const dy = mod(y, tile) + 0.5 - tile / 2
      const r = c * tile * 0.72
      return dx * dx + dy * dy <= r * r
    }
    case 'bricks': {
      // running-bond bricks; density widens the mortar joints
      const rh = 2 * s
      const bl = 4 * s
      const hm = Math.round((1 - c) * (rh / 2))
      const vm = Math.round((1 - c) * (bl / 2))
      const ym = mod(y, rh)
      const xm = mod(x + (mod(Math.floor(y / rh), 2) * bl) / 2, bl)
      return ym >= hm && ym < rh - hm && xm >= vm && xm < bl - vm
    }
    case 'rings': {
      const p = 4 * s
      const d = Math.hypot(x - (o.seed?.x ?? 0), y - (o.seed?.y ?? 0))
      return mod(d, p) < Math.round(c * p)
    }
    case 'glyph': {
      // user-editable tile set: tone picks the level, the tile cell decides
      const set = o.glyph
      if (!set || set.levels.length === 0) return c > 0.5
      const step = Math.max(1, s)
      return glyphCellAt(set, Math.floor(x / step), Math.floor(y / step), c)
    }
  }
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Mix ratio at a position for a transition profile: 0 = color A, 1 = color B. */
export function gradientAt(
  g: FillGradient,
  x: number,
  y: number,
  seed: { x: number; y: number },
  box: Box,
): number {
  const spanX = box.x1 - box.x0
  const spanY = box.y1 - box.y0
  switch (g) {
    case 'none': {
      return 0
    }
    case 'vertical': {
      return spanY > 0 ? (y - box.y0) / spanY : 0
    }
    case 'horizontal': {
      return spanX > 0 ? (x - box.x0) / spanX : 0
    }
    case 'diag': {
      return spanX + spanY > 0 ? (x - box.x0 + (y - box.y0)) / (spanX + spanY) : 0
    }
    case 'diag-inv': {
      return spanX + spanY > 0 ? (x - box.x0 - (y - box.y0) + spanY) / (spanX + spanY) : 0
    }
    case 'radial': {
      const max = Math.max(
        Math.hypot(box.x0 - seed.x, box.y0 - seed.y),
        Math.hypot(box.x1 - seed.x, box.y0 - seed.y),
        Math.hypot(box.x0 - seed.x, box.y1 - seed.y),
        Math.hypot(box.x1 - seed.x, box.y1 - seed.y),
      )
      if (max === 0) return 0
      return Math.hypot(x - seed.x, y - seed.y) / max
    }
  }
}

/** Buffer-space position of a cell index. */
export type FillCoord = (idx: number) => { x: number; y: number }

/** Row-major coordinate function; the square grid works in sub-cell resolution. */
export function patternCoord(doc: Doc): FillCoord {
  const bw = doc.gridType === 'square' ? doc.cols * doc.sub : doc.cols
  return (i: number) => ({ x: i % bw, y: Math.floor(i / bw) })
}
