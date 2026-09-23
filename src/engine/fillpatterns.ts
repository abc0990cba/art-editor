import { resolveColor, type Doc } from './doc'
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
} from './ditherMatrices'

export { BAYER2, BAYER4, BAYER8 }

/**
 * Pattern fills for the fill tool: two-color textures and dithered gradients in the
 * classic pixel-art style. A pattern decides per cell between the active color (A)
 * and a second color (B); a transition profile sets the mix ratio t per position, so
 * the same patterns double as flat textures (flat) or dithered gradients.
 */
export type FillPatternId =
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'cluster'
  | 'halftone'
  | 'screen'
  | 'blue-noise'
  | 'void-cluster'
  | 'noise'
  | 'ign'
  | 'checker'
  | 'grid'
  | 'hatch'
  | 'stripes-h'
  | 'stripes-v'
  | 'stripes-diag'
  | 'zigzag'
  | 'dots'
  | 'bricks'
  | 'rings'

/** How the mix ratio t varies across the filled region. */
export type FillGradient = 'none' | 'vertical' | 'horizontal' | 'diag' | 'diag-inv' | 'radial'

/** Silhouette of the halftone screen dots. */
export type FillHtShape = 'dot' | 'square' | 'diamond' | 'line' | 'ellipse'

/** Halftone screen shapes in UI order. */
export const HT_SHAPES: FillHtShape[] = ['dot', 'square', 'diamond', 'line', 'ellipse']

export interface FillStyle {
  mode: 'solid' | 'pattern'
  pattern: FillPatternId
  gradient: FillGradient
  /** color B share 0..1, used when gradient = 'none' */
  density: number
  /** second color pattern fills blend towards */
  color2: string
  /** tile-size multiplier for scaled patterns (stripes, dots, checker, grid, …) */
  scale: number
  /** noise block size in cells (noise, ign) */
  grain: number
  /** halftone screen: dot silhouette */
  htShape: FillHtShape
  /** halftone screen: grid rotation in degrees, 0..180 */
  htAngle: number
  /** halftone screen: random dot displacement, 0..100 */
  htJitter: number
  /** halftone screen: randomly missing dots, 0..100 */
  htDropout: number
}

export const DEFAULT_FILL_STYLE: FillStyle = {
  mode: 'solid',
  pattern: 'bayer4',
  gradient: 'none',
  density: 0.5,
  color2: '#ffffff',
  scale: 1,
  grain: 1,
  htShape: 'dot',
  htAngle: 45,
  htJitter: 0,
  htDropout: 0,
}

/** Pattern library in UI order. */
export const PATTERNS: FillPatternId[] = [
  'bayer2',
  'bayer4',
  'bayer8',
  'bayer16',
  'cluster',
  'halftone',
  'screen',
  'blue-noise',
  'void-cluster',
  'noise',
  'ign',
  'checker',
  'grid',
  'hatch',
  'stripes-h',
  'stripes-v',
  'stripes-diag',
  'zigzag',
  'dots',
  'bricks',
  'rings',
]

/** Patterns whose tiles grow with the scale setting. */
export const SCALED_PATTERNS: ReadonlySet<FillPatternId> = new Set([
  'checker',
  'grid',
  'hatch',
  'stripes-h',
  'stripes-v',
  'stripes-diag',
  'zigzag',
  'dots',
  'bricks',
  'rings',
  'screen',
])

/** Patterns with a grain (noise block size) setting. */
export const GRAIN_PATTERNS: ReadonlySet<FillPatternId> = new Set(['noise', 'ign'])

/** Transition profiles in UI order. */
export const GRADIENTS: FillGradient[] = [
  'none',
  'vertical',
  'horizontal',
  'diag',
  'diag-inv',
  'radial',
]

const mod = (v: number, m: number) => ((v % m) + m) % m
const fract = (v: number) => v - Math.floor(v)

/** Deterministic per-position noise in [0,1) — stable for a given cell coordinate. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export interface PatternOpts {
  /** tile-size multiplier for scaled patterns */
  scale?: number
  /** noise block size in cells (noise, ign) */
  grain?: number
  /** anchor for concentric patterns (rings) */
  seed?: { x: number; y: number }
  /** halftone screen: dot silhouette */
  htShape?: FillHtShape
  /** halftone screen: grid rotation in degrees, 0..180 */
  htAngle?: number
  /** halftone screen: random dot displacement, 0..100 */
  htJitter?: number
  /** halftone screen: randomly missing dots, 0..100 */
  htDropout?: number
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
 * Whether the cell at buffer position (x, y) takes color B for mix ratio t (0..1).
 * Ordered dithering compares t against a Bayer threshold; stripes, hatching and shapes
 * grow with t; scaled patterns repeat every 4·scale cells.
 */
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
    case 'bayer2':
      return c > thresholdAt(BAYER2, 2, 4, x, y)
    case 'bayer4':
      return c > thresholdAt(BAYER4, 4, 16, x, y)
    case 'bayer8':
      return c > thresholdAt(BAYER8, 8, 64, x, y)
    case 'bayer16':
      return c > thresholdAt(BAYER16, 16, 256, x, y)
    case 'cluster':
      // clustered-dot print screen: ink grows in a spiral from each 4×4 cell
      return c > thresholdAt(CLUSTER4, 4, 16, x, y)
    case 'halftone':
      // diamond halftone dots, the newspaper-print look
      return c > thresholdAt(HALFTONE4, 4, 16, x, y)
    case 'screen': {
      // true halftone screen: a rotated dot grid in screen space, tone in dot
      // area. Shapes morph like print screens — round dots, squares, diamonds,
      // elliptical chains or plain bands; jitter scatters the grid, dropout
      // wears patches of dots away.
      const pitch = 6 * s
      const deg = ((((o.htAngle ?? 45) % 180) + 180) % 180) * (Math.PI / 180)
      const ca = Math.cos(deg)
      const sa = Math.sin(deg)
      const u = (x * ca + y * sa) / pitch
      const v = (y * ca - x * sa) / pitch
      const iu = Math.floor(u)
      const iv = Math.floor(v)
      let du = u - iu - 0.5
      let dv = v - iv - 0.5
      const jit = Math.max(0, Math.min(100, o.htJitter ?? 0)) / 100
      if (jit > 0) {
        du += (hash2(iu * 7 + 1, iv * 7 + 3) - 0.5) * jit
        dv += (hash2(iu * 7 + 5, iv * 7 + 9) - 0.5) * jit
      }
      const dropout = Math.max(0, Math.min(100, o.htDropout ?? 0)) / 100
      if (dropout > 0 && htNoise(iu / 2, iv / 2) < dropout * 0.95) return false
      if (c >= 0.999) return true
      switch (o.htShape ?? 'dot') {
        case 'square': {
          const h = Math.sqrt(c) / 2
          return Math.abs(du) < h && Math.abs(dv) < h
        }
        case 'diamond': {
          const r = Math.sqrt(c / 2)
          return Math.abs(du) + Math.abs(dv) < r
        }
        case 'line':
          return Math.abs(dv) < c / 2
        case 'ellipse': {
          // wide ellipses overlap along the row mid-tone — the chain-dot screen
          const rx = 0.8 * Math.sqrt((2 * c) / Math.PI)
          const ry = 0.8 * Math.sqrt(c / (2 * Math.PI))
          return (du / rx) * (du / rx) + (dv / ry) * (dv / ry) < 1
        }
        default: {
          const r = Math.sqrt(c / Math.PI)
          return du * du + dv * dv < r * r
        }
      }
    }
    case 'blue-noise':
      // aperiodic high-frequency mask — no visible grid, evenly speckled
      return c > thresholdAt(BLUE_NOISE8, 8, 16, x, y)
    case 'void-cluster':
      // void-and-cluster: blue-noise character on a finer 8×8×256 grain
      return c > thresholdAt(VOID_CLUSTER8, 8, 256, x, y)
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
    case 'checker':
      // coarse Bayer-2: an s×s-block checkerboard at 50%
      return c > (BAYER2[mod(Math.floor(y / s), 2)][mod(Math.floor(x / s), 2)] + 0.5) / 4
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
    case 'stripes-h':
      return mod(y, 4 * s) < Math.round(c * 4 * s)
    case 'stripes-v':
      return mod(x, 4 * s) < Math.round(c * 4 * s)
    case 'stripes-diag':
      return mod(x + y, 4 * s) < Math.round(c * 4 * s)
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
    case 'none':
      return 0
    case 'vertical':
      return spanY > 0 ? (y - box.y0) / spanY : 0
    case 'horizontal':
      return spanX > 0 ? (x - box.x0) / spanX : 0
    case 'diag':
      return spanX + spanY > 0 ? (x - box.x0 + (y - box.y0)) / (spanX + spanY) : 0
    case 'diag-inv':
      return spanX + spanY > 0 ? (x - box.x0 - (y - box.y0) + spanY) / (spanX + spanY) : 0
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

/**
 * Assign 0 (active color) or 1 (second color) to every cell of a fill region.
 * `seed` anchors radial gradients and concentric patterns; linear gradients span the
 * region's bounding box.
 */
export function applyFillStyle(
  style: FillStyle,
  region: readonly number[],
  seed: number,
  coordOf: FillCoord,
): Map<number, 0 | 1> {
  const out = new Map<number, 0 | 1>()
  if (region.length === 0) return out
  const s = coordOf(seed)
  let box: Box | null = null
  if (style.gradient !== 'none') {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const i of region) {
      const p = coordOf(i)
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    box = { x0, y0, x1, y1 }
  }
  const opts: PatternOpts = {
    scale: style.scale,
    grain: style.grain,
    seed: s,
    htShape: style.htShape,
    htAngle: style.htAngle,
    htJitter: style.htJitter,
    htDropout: style.htDropout,
  }
  for (const i of region) {
    const p = coordOf(i)
    const t =
      style.gradient === 'none' ? style.density : gradientAt(style.gradient, p.x, p.y, s, box!)
    out.set(i, patternAt(style.pattern, p.x, p.y, t, opts) ? 1 : 0)
  }
  return out
}

/**
 * Re-fill every painted cell owned by the selected elements — solid `colorA` or a two-color
 * pattern, exactly what a fill click paints but over the whole selection. Cell→element
 * attribution is untouched (cells keep their owners). Returns the new cell buffer with the
 * (possibly extended) palette, or null when the selection owns no painted cells.
 */
export function fillSelectionCells(
  doc: Doc,
  selection: readonly number[],
  style: FillStyle,
  colorA: string,
): { cells: Uint16Array; palette: string[] } | null {
  if (selection.length === 0 || !doc.cellObj) return null
  const sel = new Set(selection)
  const region: number[] = []
  for (let i = 0; i < doc.cells.length; i++) {
    if (doc.cells[i] > 0 && sel.has(doc.cellObj[i])) region.push(i)
  }
  if (region.length === 0) return null
  const rA = resolveColor(doc, colorA)
  const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
  const cells = doc.cells.slice()
  if (style.mode === 'pattern') {
    const coordOf = patternCoord(rB.doc)
    const bw = rB.doc.gridType === 'square' ? rB.doc.cols * rB.doc.sub : rB.doc.cols
    // anchor concentric patterns at the middle of the selection's bounding box
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const i of region) {
      const p = coordOf(i)
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    const seed = Math.round((y0 + y1) / 2) * bw + Math.round((x0 + x1) / 2)
    for (const [i, pick] of applyFillStyle(style, region, seed, coordOf)) {
      cells[i] = pick === 1 ? rB.v : rA.v
    }
  } else {
    for (const i of region) cells[i] = rA.v
  }
  return { cells, palette: rB.doc.palette }
}
