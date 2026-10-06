import type { SymmetryState } from '../core/doc.ts'
import type { Pt } from '../geometry/marching-squares.ts'
import type { Grid } from '../grids/index.ts'
import { angleInFilledWedge, foldCount, twistRad, type RadialOpts } from './symmetry-radial.ts'
import { isRepeat } from './symmetry-repeat.ts'

export type SymMode = SymmetryState['mode']

/**
 * Grid-aware symmetry for the non-square lattices (hex, hexFlat, triangle, rhombille, radial,
 * diamond, iso, brick, octasquare — and rotated squares): mirrors and rosette copies are computed
 * geometrically instead of through polar angle scans.
 *
 * The mirror axes snap from the raw canvas middle to the nearest lattice mirror axis — a line where
 * reflecting every cell center lands back on a cell center (or outside the canvas). On hex grids
 * the canvas middle always sits a quarter-step off such an axis (the lattice's bounding box is
 * half-step asymmetric), which made every mirrored copy land between cells; snapping aligns the
 * symmetry with the grid so copies are exact. Each copy maps a cell's polygon centroid through the
 * isometry and reads the owning cell via `cellAt`; the result is memoized per grid and copy, and
 * involutive copies (mirrors, point reflection) complete themselves symmetrically (i→j forces j→i),
 * so a cell exactly on an axis maps to itself instead of spawning a spurious partner and painting
 * from either side of a pair yields the same pair.
 */

/** Mirror axes of the active mode, in doc/grid space (the drawn guides use the same values). */
export interface SymAxes {
  x: number
  y: number
}

const Q = 1e6 // candidate quantization for the axis comb (absorbs fp noise in rotated lattices)
const PROBE = 512 // center sample size for the exactness scan (a wrong axis fails whole row bands)

const axesCache = new WeakMap<Grid, SymAxes>()
const centroidCache = new WeakMap<Grid, Float64Array>()
const mapCache = new WeakMap<Grid, Map<string, Map<number, number>>>()

/**
 * Lattice-aligned mirror axes for a grid: the canvas middle snapped to the nearest axis whose
 * reflection maps cell centers back onto cell centers (center lines and between-cell lines both
 * qualify; mirrors that only leave the grid are fine — those copies are dropped). The check is 2D:
 * for hex, the canvas middle mirrors the coordinate sets onto each other while every image lands
 * between two cells. Radial and square grids keep the exact middle: the disc's center is its
 * natural symmetry center and the square's buffer math already mirrors about it. Ties resolve to
 * the larger candidate.
 */
export function symmetryAxes(grid: Grid): SymAxes {
  const hit = axesCache.get(grid)
  if (hit) return hit
  const axes: SymAxes =
    grid.type === 'square' || grid.type === 'radial'
      ? { x: grid.w / 2, y: grid.h / 2 }
      : { x: snapAxis(grid, 'x'), y: snapAxis(grid, 'y') }
  axesCache.set(grid, axes)
  return axes
}

/**
 * Rotation center for radial/kaleido: the mirror axes' intersection snapped to the nearest cell
 * center, so N-fold rotations that are lattice automorphisms (hex family at 6-fold N) map centers
 * exactly onto centers. Square and radial grids keep the exact canvas middle.
 */
export function rotationCenter(grid: Grid): Pt {
  const ax = symmetryAxes(grid)
  if (grid.type === 'square' || grid.type === 'radial') return { x: ax.x, y: ax.y }
  const j = grid.cellAt(ax.x, ax.y)
  return j >= 0 ? grid.center(j) : { x: ax.x, y: ax.y }
}

function snapAxis(grid: Grid, axis: 'x' | 'y'): number {
  const coords = new Set<number>()
  for (let i = 0; i < grid.count; i++) {
    const c = grid.center(i)
    coords.add(Math.round((axis === 'x' ? c.x : c.y) * Q))
  }
  const sorted = [...coords].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  // candidates: the center lines plus the midpoints of neighboring center lines (cell boundaries)
  const cand: number[] = []
  for (let k = 0; k < sorted.length; k++) {
    cand.push(sorted[k])
    if (k > 0 && sorted[k] - sorted[k - 1] > 1) cand.push((sorted[k] + sorted[k - 1]) / 2)
  }
  // probe centers, evenly strided over the row-major index so every row band is represented
  const step = Math.max(1, Math.floor(grid.count / PROBE))
  const probe: [number, number][] = []
  for (let i = 0; i < grid.count; i += step) probe.push([grid.center(i).x, grid.center(i).y])
  const lo = min / Q
  const hi = max / Q
  /** Reflecting every probed center about `c` lands back on a center — or leaves the grid. */
  const exact = (c: number): boolean => {
    const cv = c / Q
    for (const [px, py] of probe) {
      const mx = axis === 'x' ? 2 * cv - px : px
      const my = axis === 'x' ? py : 2 * cv - py
      const m = axis === 'x' ? mx : my
      if (m < lo || m > hi) continue // the mirror copy falls outside the lattice: dropped
      const j = grid.cellAt(mx, my)
      if (j < 0) continue
      const cc = grid.center(j)
      if (Math.abs(cc.x - mx) > 1e-4 || Math.abs(cc.y - my) > 1e-4) return false
    }
    return true
  }
  const midQ = Math.round((axis === 'x' ? grid.w / 2 : grid.h / 2) * Q)
  let best = -1
  let bestD = Infinity
  for (const c of cand) {
    if (!exact(c)) continue
    const d = Math.abs(c - midQ)
    if (d <= bestD) {
      bestD = d
      best = c
    }
  }
  if (best < 0) {
    // no axis reflects the finite lattice onto itself (triangle/rhombille vs horizontal): the
    // nearest center line is the honest fallback — copies still snap cell-wise and stay put
    for (const c of cand) {
      const d = Math.abs(c - midQ)
      if (d <= bestD) {
        bestD = d
        best = c
      }
    }
  }
  return best / Q
}

/**
 * Polygon centroid per cell (lazy, cached per grid) — rhombille faces share a center, not a
 * centroid.
 */
function centroids(grid: Grid): Float64Array {
  let cents = centroidCache.get(grid)
  if (!cents) {
    cents = new Float64Array(grid.count * 2)
    for (let i = 0; i < grid.count; i++) {
      const poly = grid.polygon(i)
      let x = 0
      let y = 0
      for (const p of poly) {
        x += p.x
        y += p.y
      }
      cents[i * 2] = x / poly.length
      cents[i * 2 + 1] = y / poly.length
    }
    centroidCache.set(grid, cents)
  }
  return cents
}

/** One symmetry copy: a doc-space isometry plus whether it is its own inverse. */
interface GridIso {
  pt: (x: number, y: number) => Pt
  involutive: boolean
}

function modeIsos(grid: Grid, mode: SymMode, n: number, radial: RadialOpts | undefined): GridIso[] {
  if (mode === 'none' || isRepeat(mode)) return []
  const rosette = mode === 'radial' || mode === 'kaleido'
  // mirrors reflect about the snapped axes; rosette rotations spin about a lattice point
  const ox = rosette ? rotationCenter(grid).x : symmetryAxes(grid).x
  const oy = rosette ? rotationCenter(grid).y : symmetryAxes(grid).y
  const cx = ox
  const cy = oy
  // relative-coordinate isometries, re-centered on the snapped axes
  const iso = (f: (x: number, y: number) => [number, number], involutive = true): GridIso => ({
    pt: (x, y) => relMap(f, x - cx, y - cy, cx, cy),
    involutive,
  })
  switch (mode) {
    case 'mirrorX': {
      return [iso((x, y) => [-x, y])]
    }
    case 'mirrorY': {
      return [iso((x, y) => [x, -y])]
    }
    case 'quad': {
      return [iso((x, y) => [-x, y]), iso((x, y) => [x, -y]), iso((x, y) => [-x, -y])]
    }
    case 'diag8': {
      return [
        iso((x, y) => [-x, y]),
        iso((x, y) => [x, -y]),
        iso((x, y) => [-x, -y]),
        iso((x, y) => [y, x]),
        iso((x, y) => [-y, -x]),
        iso((x, y) => [-y, x], false),
        iso((x, y) => [y, -x], false),
      ]
    }
    case 'radial':
    case 'kaleido': {
      const fold = foldCount(n)
      const tw = twistRad(radial)
      const out: GridIso[] = []
      const rot = (k: number, flip: boolean): GridIso => ({
        pt: (x, y) => {
          const dx = flip ? cx - x : x - cx
          const dy = y - cy
          const ta = tw * Math.hypot(dx, dy)
          const a = (k * 2 * Math.PI) / fold + ta
          const cos = Math.cos(a)
          const sin = Math.sin(a)
          return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
        },
        involutive: false,
      })
      for (let k = 0; k < fold; k++) {
        out.push(rot(k, false))
        if (mode === 'kaleido') out.push(rot(k, true))
      }
      return out
    }
    default: {
      return []
    }
  }
}

function relMap(
  f: (x: number, y: number) => [number, number],
  dx: number,
  dy: number,
  cx: number,
  cy: number,
): Pt {
  const [rx, ry] = f(dx, dy)
  return { x: rx + cx, y: ry + cy }
}

/** Cell under one copy of `idx` (memoized; involutive copies complete themselves symmetrically). */
function isoCell(
  grid: Grid,
  cents: Float64Array,
  cache: Map<number, number>,
  iso: GridIso,
  idx: number,
): number {
  const hit = cache.get(idx)
  if (hit !== undefined) return hit
  const q = iso.pt(cents[idx * 2], cents[idx * 2 + 1])
  const j = grid.cellAt(q.x, q.y)
  cache.set(idx, j)
  // a reflection pairs the cell with its image: record the pair in both directions, so cells
  // exactly on the axis stay self-symmetric and either side of a pair resolves to the same one
  if (iso.involutive && j >= 0 && !cache.has(j)) cache.set(j, idx)
  return j
}

function cellMapSlot(grid: Grid, key: string): Map<number, number> {
  let perGrid = mapCache.get(grid)
  if (!perGrid) {
    perGrid = new Map()
    mapCache.set(grid, perGrid)
  }
  let m = perGrid.get(key)
  if (!m) {
    m = new Map()
    perGrid.set(key, m)
  }
  return m
}

const isoKey = (mode: SymMode, n: number, radial: RadialOpts | undefined, k: number): string =>
  `${mode}|${n}|${radial ? radial.fill : 100}|${radial ? radial.phase : 0}|${radial ? radial.twist : 0}|${k}`

/**
 * Cell orbit of one grid cell under a finite symmetry mode (the cell itself first). Empty when a
 * radial sector gate rejects the cell (nothing paints outside the filled wedge).
 */
export function gridSymmetryOrbit(
  grid: Grid,
  idx: number,
  sym: Pick<SymmetryState, 'mode' | 'n'>,
  radial?: RadialOpts,
): number[] {
  const { mode, n } = sym
  if (mode === 'none') return [idx]
  if ((mode === 'radial' || mode === 'kaleido') && radial) {
    const c = rotationCenter(grid)
    const p = grid.center(idx)
    if (!angleInFilledWedge(Math.atan2(p.y - c.y, p.x - c.x), n, radial)) return []
  }
  const isos = modeIsos(grid, mode, n, radial)
  if (isos.length === 0) return [idx]
  const cents = centroids(grid)
  const out = [idx]
  const seen = new Set([idx])
  for (let k = 0; k < isos.length; k++) {
    const cache = cellMapSlot(grid, isoKey(mode, n, radial, k))
    const j = isoCell(grid, cents, cache, isos[k], idx)
    if (j >= 0 && !seen.has(j)) {
      seen.add(j)
      out.push(j)
    }
  }
  return out
}

/**
 * Non-identity copies of a directed cell pair (connector endpoints): both cells map through the
 * same copy, so mirrored/rotated connectors stay connected. The original pair is not included —
 * callers stamp it themselves; also empty for none and the square-only repeat modes.
 */
export function gridSymmetryPairs(
  grid: Grid,
  a: number,
  b: number,
  sym: Pick<SymmetryState, 'mode' | 'n'>,
  radial?: RadialOpts,
): [number, number][] {
  const out: [number, number][] = []
  const isos = modeIsos(grid, sym.mode, sym.n, radial)
  if (isos.length === 0) return out
  const cents = centroids(grid)
  const seen = new Set([a])
  for (let k = 0; k < isos.length; k++) {
    const cache = cellMapSlot(grid, isoKey(sym.mode, sym.n, radial, k))
    const ia = isoCell(grid, cents, cache, isos[k], a)
    const ib = isoCell(grid, cents, cache, isos[k], b)
    if (ia >= 0 && ib >= 0 && !seen.has(ia)) {
      seen.add(ia)
      out.push([ia, ib])
    }
  }
  return out
}
