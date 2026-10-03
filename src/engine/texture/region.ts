import type { TextureSettings } from '../core/doc'
import { clamp, hash2, mulberry32, MAX_REGION_FLECKS } from './core'
import type { FigureSpace } from './figure'
import { emitHalftoneDots, filterSpray, type HtDot } from './halftone'
import { hatchRegionFragments } from './hatch'
import { latticeHalftoneDots } from './lattices.ts'
import { angleRad, type DistContext } from './patterns'
import { regionHalftoneCell, regionScatterCell } from './region-cells'

/**
 * Texture hole fragments for a whole same-color region of pixel cells. Specks are placed on a
 * lattice anchored to the document origin, so adjacent connected cells share one continuous pattern
 * with no seams; only sides facing empty space (or another color) carry the gap margin.
 */

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

/** Per-side placement bounds for one cell, in doc units. */
export interface RegionBounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** Read-only setup shared by one region scan. */
interface RegionMetrics {
  cells: TextureCell[]
  bounds: RegionBounds[]
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

/** Per-cell RNG draws: r1..r5 are taken up front for both scan branches. */
export interface CellRand {
  r1: number
  r2: number
  r3: number
  r4: number
  r5: number
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

/** One rounded-corner probe: corner id, its arc center/radius and the point to test. */
interface CornerProbe {
  px: number
  py: number
  ccx: number
  ccy: number
  r: number
  corner: 'tl' | 'tr' | 'br' | 'bl'
  c: TextureCell
}

/** Point inside a fillet corner? arc — distance; chamfer — diagonal offset. */
function cornerPointOk({ px, py, ccx, ccy, r, corner, c }: CornerProbe): boolean {
  if (c.chamfer) {
    const u = corner === 'tl' || corner === 'bl' ? px - c.x : c.x + c.w - px
    const v = corner === 'tl' || corner === 'tr' ? py - c.y : c.y + c.h - py
    return u + v >= r
  }
  const dx = px - ccx
  const dy = py - ccy
  return dx * dx + dy * dy <= r * r
}

/** Point inside the cell's painted fill rect, corner fillets included. */
export function fillPointOk(c: TextureCell, px: number, py: number): boolean {
  if (px < c.x || px > c.x + c.w || py < c.y || py > c.y + c.h) return false
  const [tl, tr, br, bl] = c.radii
  if (px < c.x + tl && py < c.y + tl)
    return cornerPointOk({ px, py, ccx: c.x + tl, ccy: c.y + tl, r: tl, corner: 'tl', c })
  if (px > c.x + c.w - tr && py < c.y + tr)
    return cornerPointOk({ px, py, ccx: c.x + c.w - tr, ccy: c.y + tr, r: tr, corner: 'tr', c })
  if (px > c.x + c.w - br && py > c.y + c.h - br) {
    return cornerPointOk({
      px,
      py,
      ccx: c.x + c.w - br,
      ccy: c.y + c.h - br,
      r: br,
      corner: 'br',
      c,
    })
  }
  if (px < c.x + bl && py > c.y + c.h - bl)
    return cornerPointOk({ px, py, ccx: c.x + bl, ccy: c.y + c.h - bl, r: bl, corner: 'bl', c })
  return true
}

/** Connected sides run to the tile edge, open sides are inset by the gap margin. */
function regionBounds(cells: TextureCell[], gapU: number): RegionBounds[] {
  return cells.map((c) => ({
    left: c.connectedL ? c.cx0 : c.x + gapU,
    top: c.connectedT ? c.cy0 : c.y + gapU,
    right: c.connectedR ? c.cx1 : c.x + c.w - gapU,
    bottom: c.connectedB ? c.cy1 : c.y + c.h - gapU,
  }))
}

/** Spatial lookup plus painted-fill sampling: the candidate acceptance test of the scan. */
function regionSampler(
  cells: TextureCell[],
  bounds: RegionBounds[],
  sub: number,
  fig: FigureSpace | undefined,
  gapU: number,
): Pick<RegionState, 'locate' | 'fits'> {
  // spatial lookup: buffer tile under a doc point
  const index = new Map<number, number>()
  cells.forEach((c, k) => {
    const bx = Math.floor(((c.cx0 + c.cx1) / 2) * sub)
    const by = Math.floor(((c.cy0 + c.cy1) / 2) * sub)
    index.set(bx * 65_536 + by, k)
  })
  const locate = (px: number, py: number): number | undefined =>
    index.get(Math.floor(px * sub) * 65_536 + Math.floor(py * sub))

  // a sample point must sit inside the painted fill rect (corner fillets
  // included) AND inside the tile's placement bounds. The fill-rect test is what
  // keeps specks out of the gutters between non-touching fills; when fills tile
  // fully (size 100%) specks cross shared edges freely, so regions stay seamless
  const sampleOk = (px: number, py: number): boolean => {
    const k = locate(px, py)
    if (k === undefined) return false
    const b = bounds[k]
    if (px < b.left || px > b.right || py < b.top || py > b.bottom) return false
    if (!fillPointOk(cells[k], px, py)) return false
    // figure mode: the margin is measured from the whole silhouette, not per side
    return !(fig && gapU > 0 && fig.edgeDist(px, py) < gapU)
  }
  const fits = (fx: number, fy: number, a: number): boolean => {
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
  }
  const keep = m.halftone ? 1 : Math.min(1, MAX_REGION_FLECKS / Math.max(1, estTotal * m.p))
  return { I0, I1, J0, J1, stride, keep, ca, sa, prMin, prMax }
}

/**
 * Texture hole fragments for a whole same-color region. Candidates are sampled against the actual
 * painted fills (including corner fillets), so holes never land outside the artwork. `fig` carries
 * the combined-color silhouette for figure-level gaps; each color keeps its own seamless pattern.
 */
export function regionTextureFragments(
  cells: TextureCell[],
  t: TextureSettings,
  key: number,
  fig?: FigureSpace,
): string {
  if (cells.length === 0 || t.effect === 'none' || t.amount <= 0) return ''
  const sub = Math.max(1, Math.round(1 / (cells[0].cx1 - cells[0].cx0)))
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
    bounds: regionBounds(cells, fig ? 0 : gapU),
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
    ...regionSampler(cells, metrics.bounds, sub, fig, gapU),
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
  for (let J = grid.J0; J <= grid.J1 && s.count < MAX_REGION_FLECKS; J += grid.stride) {
    for (let I = grid.I0; I <= grid.I1 && s.count < MAX_REGION_FLECKS; I += grid.stride) {
      const rand = mulberry32(hash2(I, J, t.seed + key * 1013))
      const r: CellRand = { r1: rand(), r2: rand(), r3: rand(), r4: rand(), r5: rand() }
      if (halftone) regionHalftoneCell(s, I, J, r, rand)
      else regionScatterCell(s, I, J, r)
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
