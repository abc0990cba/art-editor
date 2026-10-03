import type { TextureSettings } from '../core/doc'
import { clamp, hash2, MAX_REGION_FLECKS, randSeed, type RandState } from './core'
import type { FigureSpace } from './figure'
import { cachedFragments, storeFragments } from './fragment-cache.ts'
import { emitHalftoneDots, filterSpray, type HtDot } from './halftone'
import { hatchRegionFragments } from './hatch'
import { latticeHalftoneDots } from './lattices.ts'
import { angleRad, type DistContext } from './patterns'
import { regionHalftoneCell, regionScatterCell } from './region-cells'
import { hashCells, regionIndex } from './region-index.ts'

/**
 * Texture hole fragments for a whole same-color region of pixel cells. Specks are placed on a
 * lattice anchored to the document origin, so adjacent connected cells share one continuous pattern
 * with no seams; only sides facing empty space (or another color) carry the gap margin.
 */

/**
 * Lattice-node budget of one region scan: beyond it the candidate grid coarsens (see
 * `regionGridRange`), bounding the walk to ~25 ms on any region size. Placement stays
 * byte-identical below the cap — regions up to ~450 cells across at scale 1 — and keeps its
 * statistical character above it (expected fleck yield is normalized to the thinned node count).
 */
export const SCAN_CAP = 1_000_000

/** One paintable cell of a same-color region, in doc units. */
export interface TextureCell {
  /** Fill rect (the rounded rect actually painted for this cell) */
  x: number
  y: number
  w: number
  h: number
  /** Fill corner radii tl,tr,br,bl */
  radii: number[]
  chamfer: boolean
  /** Grid-tile bounds this cell occupies (fill rect ⊆ tile bounds) */
  cx0: number
  cy0: number
  cx1: number
  cy1: number
  /** True when the neighboring tile holds the same value: texture runs across */
  connectedL: boolean
  connectedT: boolean
  connectedR: boolean
  connectedB: boolean
}

/** Read-only setup shared by one region scan. */
interface RegionMetrics {
  cells: TextureCell[]
  t: TextureSettings
  sub: number
  /** Lattice pitch in cells */
  L: number
  /** Lattice pitch in doc units */
  Ld: number
  /** Gap margin in doc units */
  gapU: number
  band: number
  p: number
  e: number
  minW: number
  halftone: boolean
  /** Whole-figure silhouette space (gapMode 'figure' only) */
  fig: FigureSpace | undefined
  /** Figure geometry the structured distributions anchor to */
  dc: DistContext
  even: boolean
}

/** Mutable accumulator for one region scan. */
export interface RegionState extends RegionMetrics {
  ca: number
  sa: number
  prMin: number
  prMax: number
  keep: number
  locate: (px: number, py: number) => number | undefined
  fits: (fx: number, fy: number, a: number) => boolean
  /** Accepted fleck centers of the even-scatter mode, bucketed by minimum distance */
  taken: Map<number, number[]>
  dots: HtDot[]
  dotKeys: number[]
  dotAt: Map<number, number>
  sprayCand: (HtDot & { key: number })[]
  out: string
  count: number
}

/** Lattice range and screen-ramp projection of one region scan. */
interface RegionGrid {
  I0: number
  I1: number
  J0: number
  J1: number
  stride: number
  keep: number
  ca: number
  sa: number
  prMin: number
  prMax: number
}

/**
 * Point inside a fillet corner? arc — distance; chamfer — diagonal offset. Allocation-free: the
 * scan probes this millions of times on large regions, so no probe objects here.
 */
export function fillPointOk(c: TextureCell, px: number, py: number): boolean {
  const right = c.x + c.w
  const bottom = c.y + c.h
  if (px < c.x || px > right || py < c.y || py > bottom) return false
  if (c.chamfer) return chamferPointOk(c, px, py, right, bottom)
  return arcPointOk(c, px, py, right, bottom)
}

/** Chamfer cut: the 45° diagonal keeps everything with u + v ≥ r inside. */
function chamferPointOk(
  c: TextureCell,
  px: number,
  py: number,
  right: number,
  bottom: number,
): boolean {
  const [tl, tr, br, bl] = c.radii
  if (px < c.x + tl && py < c.y + tl) return px - c.x + (py - c.y) >= tl
  if (px > right - tr && py < c.y + tr) return right - px + (py - c.y) >= tr
  if (px > right - br && py > bottom - br) return right - px + (bottom - py) >= br
  if (px < c.x + bl && py > bottom - bl) return px - c.x + (bottom - py) >= bl
  return true
}

/** Arc-rounded corners: the probe stays inside while its distance to the arc center ≤ radius. */
function arcPointOk(
  c: TextureCell,
  px: number,
  py: number,
  right: number,
  bottom: number,
): boolean {
  const [tl, tr, br, bl] = c.radii
  if (px < c.x + tl && py < c.y + tl) {
    const dx = px - (c.x + tl)
    const dy = py - (c.y + tl)
    return dx * dx + dy * dy <= tl * tl
  }
  if (px > right - tr && py < c.y + tr) {
    const dx = px - (right - tr)
    const dy = py - (c.y + tr)
    return dx * dx + dy * dy <= tr * tr
  }
  if (px > right - br && py > bottom - br) {
    const dx = px - (right - br)
    const dy = py - (bottom - br)
    return dx * dx + dy * dy <= br * br
  }
  if (px < c.x + bl && py > bottom - bl) {
    const dx = px - (c.x + bl)
    const dy = py - (bottom - bl)
    return dx * dx + dy * dy <= bl * bl
  }
  return true
}

/** Placement bounds of the cell a candidate box is tested against (single scan, no reentrancy). */
const probeBox = { l: 0, r: 0, t: 0, b: 0 }

/** One probe point of a candidate box against the bounds in `probeBox` + the cell's painted fill. */
function cellPointOk(c: TextureCell, px: number, py: number): boolean {
  return (
    px >= probeBox.l &&
    px <= probeBox.r &&
    py >= probeBox.t &&
    py <= probeBox.b &&
    fillPointOk(c, px, py)
  )
}

/** All nine probe points of a candidate box against one cell (bounds assumed set in `probeBox`). */
function boxOk(c: TextureCell, fx: number, fy: number, a: number): boolean {
  const mx = fx + a / 2
  const my = fy + a / 2
  return (
    cellPointOk(c, fx, fy) &&
    cellPointOk(c, fx + a, fy) &&
    cellPointOk(c, fx, fy + a) &&
    cellPointOk(c, fx + a, fy + a) &&
    cellPointOk(c, mx, fy) &&
    cellPointOk(c, mx, fy + a) &&
    cellPointOk(c, fx, my) &&
    cellPointOk(c, fx + a, my) &&
    cellPointOk(c, mx, my)
  )
}

/** Placement bounds of one cell, derived on the fly (connected sides run to the tile edge). */
function setProbeBox(c: TextureCell, boundsGap: number): void {
  probeBox.l = c.connectedL ? c.cx0 : c.x + boundsGap
  probeBox.r = c.connectedR ? c.cx1 : c.x + c.w - boundsGap
  probeBox.t = c.connectedT ? c.cy0 : c.y + boundsGap
  probeBox.b = c.connectedB ? c.cy1 : c.y + c.h - boundsGap
}

/**
 * Spatial lookup plus painted-fill sampling: the candidate acceptance test of the scan. `boundsGap`
 * is the per-side inset (0 in figure mode — there the silhouette distance test does the gap), while
 * `gapU` drives the figure test itself and the grunge edge reference.
 */
function regionSampler(
  cells: TextureCell[],
  sub: number,
  fig: FigureSpace | undefined,
  gapU: number,
  boundsGap: number,
): Pick<RegionState, 'locate' | 'fits'> {
  // spatial lookup: buffer tile under a doc point (dense bitmap — probed millions of times)
  const { locate, locateTile } = regionIndex(cells, sub)

  // a sample point must sit inside the painted fill rect (corner fillets
  // included) AND inside the tile's placement bounds. The fill-rect test is what
  // keeps specks out of the gutters between non-touching fills; when fills tile
  // fully (size 100%) specks cross shared edges freely, so regions stay seamless.
  const sampleOk = (px: number, py: number): boolean => {
    const k = locate(px, py)
    if (k === undefined) return false
    const c = cells[k]
    setProbeBox(c, boundsGap)
    if (!cellPointOk(c, px, py)) return false
    // figure mode: the margin is measured from the whole silhouette, not per side
    return !(fig && gapU > 0 && fig.edgeDist(px, py) < gapU)
  }
  const fitsFull = (fx: number, fy: number, a: number): boolean => {
    const mx = fx + a / 2
    const my = fy + a / 2
    return (
      sampleOk(fx, fy) &&
      sampleOk(fx + a, fy) &&
      sampleOk(fx, fy + a) &&
      sampleOk(fx + a, fy + a) &&
      sampleOk(mx, fy) &&
      sampleOk(mx, fy + a) &&
      sampleOk(fx, my) &&
      sampleOk(fx + a, my) &&
      sampleOk(mx, my)
    )
  }
  const fits = (fx: number, fy: number, a: number): boolean => {
    if (fig === undefined) {
      // fast path: all nine probe points inside ONE tile — that single cell decides the box, so
      // the answer is final (one locate + plain rect tests instead of nine full samples)
      const tx0 = Math.floor(fx * sub)
      const tx1 = Math.floor((fx + a) * sub)
      const ty0 = Math.floor(fy * sub)
      const ty1 = Math.floor((fy + a) * sub)
      if (tx0 === tx1 && ty0 === ty1) {
        const k = locateTile(tx0, ty0)
        if (k === undefined) return false
        const c = cells[k]
        setProbeBox(c, boundsGap)
        return boxOk(c, fx, fy, a)
      }
    }
    return fitsFull(fx, fy, a)
  }
  return { locate, fits }
}

/** Rotated screen-grid range for halftone, plain lattice range otherwise, plus tone ramp bounds. */
function regionGridRange(m: RegionMetrics): RegionGrid {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of m.cells) {
    minX = Math.min(minX, c.cx0)
    minY = Math.min(minY, c.cy0)
    maxX = Math.max(maxX, c.cx1)
    maxY = Math.max(maxY, c.cy1)
  }
  const theta = (clamp(m.t.angle, 0, 180) * Math.PI) / 180
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  let I0: number
  let I1: number
  let J0: number
  let J1: number
  let prMin = 0
  let prMax = 0
  if (m.halftone) {
    // rotated screen grid: scan the grid-index range covering the region's
    // rotated bbox, and precompute the tone-ramp projection range
    const mx = (minX + maxX) / 2
    const my = (minY + maxY) / 2
    const hx = (maxX - minX) / 2
    const hy = (maxY - minY) / 2
    const gcx = mx * ca + my * sa
    const gcy = -mx * sa + my * ca
    const rx = Math.abs(ca) * hx + Math.abs(sa) * hy + m.Ld
    const ry = Math.abs(sa) * hx + Math.abs(ca) * hy + m.Ld
    I0 = Math.floor((gcx - rx) / m.Ld) - 1
    I1 = Math.ceil((gcx + rx) / m.Ld) + 1
    J0 = Math.floor((gcy - ry) / m.Ld) - 1
    J1 = Math.ceil((gcy + ry) / m.Ld) + 1
    prMin = Infinity
    prMax = -Infinity
    for (const [px, py] of [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ]) {
      const pr = px * ca + py * sa
      prMin = Math.min(prMin, pr)
      prMax = Math.max(prMax, pr)
    }
  } else {
    I0 = Math.floor((minX * m.sub) / m.L)
    I1 = Math.ceil((maxX * m.sub) / m.L)
    J0 = Math.floor((minY * m.sub) / m.L)
    J1 = Math.ceil((maxY * m.sub) / m.L)
  }
  const estTotal = (I1 - I0 + 1) * (J1 - J0 + 1)
  let stride = 1
  if (m.halftone) {
    const factor = Math.ceil(Math.sqrt(estTotal / MAX_REGION_FLECKS))
    if (factor > 1) stride = factor
  } else if (estTotal > SCAN_CAP) {
    // tiny-scale scatter on huge regions: coarsen the candidate lattice like halftone does, so the
    // scan stays bounded; keep normalizes against the thinned node count, so the expected fleck
    // yield is unchanged. Only the regime that already took seconds changes its exact placement.
    stride = Math.ceil(Math.sqrt(estTotal / SCAN_CAP))
  }
  const visited = Math.ceil((I1 - I0 + 1) / stride) * Math.ceil((J1 - J0 + 1) / stride)
  const keep = m.halftone ? 1 : Math.min(1, MAX_REGION_FLECKS / Math.max(1, visited * m.p))
  return { I0, I1, J0, J1, stride, keep, ca, sa, prMin, prMax }
}

/**
 * Texture hole fragments for a whole same-color region. Candidates are sampled against the actual
 * painted fills (including corner fillets), so holes never land outside the artwork. `fig` carries
 * the combined-color silhouette for figure-level gaps; each color keeps its own seamless pattern.
 * `contentHash` is the caller's region digest for the fragment cache (figures must pass a digest
 * covering the whole silhouette, since the gap hugs its outline); without it a digest is computed
 * from the cell list, and figure mode skips the cache.
 */
export function regionTextureFragments(
  cells: TextureCell[],
  t: TextureSettings,
  key: number,
  fig?: FigureSpace,
  contentHash?: number,
): string {
  if (cells.length === 0 || t.effect === 'none' || t.amount <= 0) return ''
  const sub = Math.max(1, Math.round(1 / (cells[0].cx1 - cells[0].cx0)))
  const cacheKey =
    contentHash !== undefined || fig === undefined
      ? cacheKeyOf(t, key, sub, contentHash ?? hashCells(cells, sub))
      : ''
  if (cacheKey) {
    const hit = cachedFragments(cacheKey)
    if (hit !== undefined) return hit
  }
  return finish(cacheKey, scanRegionFragments(cells, t, key, fig, sub))
}

/** The uncached scan: lattice walk + candidate emitters + dot/line assembly. */
function scanRegionFragments(
  cells: TextureCell[],
  t: TextureSettings,
  key: number,
  fig: FigureSpace | undefined,
  sub: number,
): string {
  const L = 0.14 * clamp(t.scale, 0.1, 8) // lattice pitch, in cells
  const Ld = L / sub // lattice pitch, doc units
  const gapU = clamp(t.gap, 0, 0.45) / sub
  const band = 0.25 * (clamp(t.scale, 0.1, 8) / sub) // grunge edge band, doc units
  const halftone = t.effect === 'halftone'
  const p = t.amount / 100
  const e = clamp(t.edge, 0, 100) / 100
  const minW = 1 - 0.85 * e
  // structured patterns anchor to the figure's tile envelope
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cells) {
    minX = Math.min(minX, c.cx0)
    minY = Math.min(minY, c.cy0)
    maxX = Math.max(maxX, c.cx1)
    maxY = Math.max(maxY, c.cy1)
  }
  const dc: DistContext = {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
    theta: angleRad(t.angle),
  }
  // figure mode: no per-side insets — the silhouette distance test does the gap
  const metrics: RegionMetrics = {
    cells,
    t,
    sub,
    L,
    Ld,
    gapU,
    band,
    p,
    e,
    minW,
    halftone,
    fig,
    dc,
    even: t.even === true && !halftone,
  }
  const grid = regionGridRange(metrics)
  const s: RegionState = {
    ...metrics,
    ca: grid.ca,
    sa: grid.sa,
    prMin: grid.prMin,
    prMax: grid.prMax,
    keep: grid.keep,
    ...regionSampler(cells, sub, fig, gapU, fig ? 0 : gapU),
    taken: new Map<number, number[]>(),
    dots: [],
    dotKeys: [],
    dotAt: new Map<number, number>(),
    sprayCand: [],
    out: '',
    count: 0,
  }
  if (halftone && t.htLattice && t.htLattice !== 'grid') {
    latticeHalftoneDots(s, t.htLattice, Ld)
    return emitHalftoneDots({ dots: s.dots, keys: s.dotKeys, dotAt: s.dotAt }, 1, t, Ld)
  }
  if (t.effect === 'hatch') return hatchRegionFragments(s, Ld)
  // one reusable PRNG state for the whole scan: a mulberry32 closure per lattice node costs
  // megabytes of garbage on large regions (millions of nodes)
  const rs: RandState = { a: 0 }
  for (let J = grid.J0; J <= grid.J1 && s.count < MAX_REGION_FLECKS; J += grid.stride) {
    for (let I = grid.I0; I <= grid.I1 && s.count < MAX_REGION_FLECKS; I += grid.stride) {
      randSeed(rs, hash2(I, J, t.seed + key * 1013))
      if (halftone) regionHalftoneCell(s, I, J, rs)
      else regionScatterCell(s, I, J, rs)
    }
  }
  if (halftone) {
    return (
      emitHalftoneDots({ dots: s.dots, keys: s.dotKeys, dotAt: s.dotAt }, grid.stride, t, Ld) +
      filterSpray(s.sprayCand, s.dots, s.dotAt, Ld)
    )
  }
  return s.out
}

/** Cache key of one region scan: full settings, palette-value key, sub-detail and region digest. */
function cacheKeyOf(t: TextureSettings, key: number, sub: number, digest: number): string {
  return `${JSON.stringify(t)}|${key}|${sub}|${digest}`
}

/** Store an emitted fragment under a non-empty cache key (pass '' to skip). */
function finish(cacheKey: string, frag: string): string {
  if (cacheKey) storeFragments(cacheKey, frag)
  return frag
}
