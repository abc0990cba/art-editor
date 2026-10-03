import type { Grid, GridType } from './index.ts'
import { byAngle } from './polar.ts'

/**
 * Lattices beyond the classic four (square/hex/triangle/radial). Each maps 1:1 onto the flat
 * cols×rows buffer, exposes an exact O(1) point→cell hit and leans on the shared edge-key adjacency
 * builder in grids-builders for edge neighbors, silhouette tracing and flood fill.
 */

export function buildLattice(type: GridType, cols: number, rows: number): Grid | null {
  if (type === 'diamond') return makeSheared('diamond', cols, rows)
  if (type === 'iso') return makeSheared('iso', cols, rows)
  if (type === 'brick') return makeBrick(cols, rows)
  if (type === 'octasquare') return makeOctasquare(cols, rows)
  return null
}

/**
 * Rhombi cut from a unit-square lattice by a shear: centers sit on (x0 + vx·(c−r), y0 + vy·(c+r)),
 * vertices at ±vx/±vy. In shear coordinates (u, v) = ((x−x0)/2vx, (y−y0)/2vy) the cells are
 * axis-aligned unit boxes, so the hit test is two floors. diamond = squares turned 45°, iso =
 * classic 2:1 isometric tiles.
 */
function makeSheared(type: 'diamond' | 'iso', cols: number, rows: number): Grid {
  const vx = type === 'diamond' ? 0.5 : 1
  const vy = 0.5
  const count = cols * rows
  const x0 = vx * rows
  const y0 = vy
  const w = vx * (cols + rows)
  const h = vy * (cols + rows)
  const rowOf = (i: number) => Math.floor(i / cols)
  const colOf = (i: number) => i % cols
  const center = (i: number) => {
    const c = colOf(i)
    const r = rowOf(i)
    return { x: x0 + vx * (c - r), y: y0 + vy * (c + r) }
  }
  const polygon = (i: number) => {
    const { x, y } = center(i)
    return [
      { x, y: y - vy },
      { x: x + vx, y },
      { x, y: y + vy },
      { x: x - vx, y },
    ]
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - w / 2, center(i).y - h / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - h / 2, center(i).x - w / 2)
  return {
    type,
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      // shear back to the unit-square lattice: cells are boxes CENTERED at the integer
      // (u+v, v−u), so floor(+0.5) — centers land mid-box and stay FP-safe under rotation
      const u = (x - x0) / (2 * vx)
      const v = (y - y0) / (2 * vy)
      const c = Math.floor(u + v + 0.5)
      const r = Math.floor(v - u + 0.5)
      if (c < 0 || c >= cols || r < 0 || r >= rows) return -1
      return r * cols + c
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}

const BRICK_H = 0.5 // running bond: bricks are 1 × 0.5, odd rows shift right by half

function makeBrick(cols: number, rows: number): Grid {
  const count = cols * rows
  const w = cols + 0.5
  const h = rows * BRICK_H
  const rowOf = (i: number) => Math.floor(i / cols)
  const colOf = (i: number) => i % cols
  const center = (i: number) => {
    const row = rowOf(i)
    const col = colOf(i)
    return { x: col + 0.5 + (row % 2) * 0.5, y: row * BRICK_H + BRICK_H / 2 }
  }
  const polygon = (i: number) => {
    const { x, y } = center(i)
    return [
      // horizontal edges carry their midpoints as vertices: the bricks above/below are
      // offset by half, so each top/bottom edge is shared as two half-edges (T-junction,
      // same trick as the triangle builder's split base)
      { x: x - 0.5, y: y - BRICK_H / 2 },
      { x, y: y - BRICK_H / 2 },
      { x: x + 0.5, y: y - BRICK_H / 2 },
      { x: x + 0.5, y: y + BRICK_H / 2 },
      { x, y: y + BRICK_H / 2 },
      { x: x - 0.5, y: y + BRICK_H / 2 },
    ]
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - w / 2, center(i).y - h / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - h / 2, center(i).x - w / 2)
  return {
    type: 'brick',
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      const row = Math.floor(y / BRICK_H)
      if (row < 0 || row >= rows) return -1
      const col = Math.floor(x - (row % 2) * 0.5)
      if (col < 0 || col >= cols) return -1
      return row * cols + col
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}

/**
 * Truncated square tiling 4.8.8 ("squares with cut corners"): regular octagons centered on a
 * lattice of step 2, small diamond-oriented squares filling the corner gaps between four octagons.
 * Compound lattices work because polygon() is per-cell; the edges match exactly, so the shared
 * edge-key adjacency yields 8 neighbors for octagons and 4 for gap squares. Index space: octagons
 * first (row-major), then the (cols−1)×(rows−1) interior gaps.
 */
const OCT_A = Math.tan(Math.PI / 8) // half of the octagon side (inradius 1)
const OCT_CUT = 1 + OCT_A // corner cut line |dx| + |dy| = cut
const OCT_G = OCT_A * Math.SQRT2 // gap square half-diagonal

function makeOctasquare(cols: number, rows: number): Grid {
  const count = cols * rows + (cols - 1) * (rows - 1)
  const w = 2 * cols
  const h = 2 * rows
  const isOct = (i: number) => i < cols * rows
  const octOf = (i: number) => ({ col: i % cols, row: Math.floor(i / cols) })
  const gapOf = (i: number) => {
    const j = i - cols * rows
    return { col: j % (cols - 1), row: Math.floor(j / (cols - 1)) }
  }
  const center = (i: number) => {
    if (isOct(i)) {
      const { col, row } = octOf(i)
      return { x: 1 + 2 * col, y: 1 + 2 * row }
    }
    const { col, row } = gapOf(i)
    return { x: 2 + 2 * col, y: 2 + 2 * row }
  }
  const polygon = (i: number) => {
    const { x, y } = center(i)
    if (isOct(i)) {
      // flats at distance 1, diagonal cuts at |dx| + |dy| = OCT_CUT
      return [
        { x: x + OCT_A, y: y + 1 },
        { x: x + 1, y: y + OCT_A },
        { x: x + 1, y: y - OCT_A },
        { x: x + OCT_A, y: y - 1 },
        { x: x - OCT_A, y: y - 1 },
        { x: x - 1, y: y - OCT_A },
        { x: x - 1, y: y + OCT_A },
        { x: x - OCT_A, y: y + 1 },
      ]
    }
    return [
      { x, y: y - OCT_G },
      { x: x + OCT_G, y },
      { x, y: y + OCT_G },
      { x: x - OCT_G, y },
    ]
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - w / 2, center(i).y - h / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - h / 2, center(i).x - w / 2)
  return {
    type: 'octasquare',
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      // nearest octagon center, then either that octagon or the corner gap square
      const col = Math.round((x - 1) / 2)
      const row = Math.round((y - 1) / 2)
      if (col < 0 || col >= cols || row < 0 || row >= rows) return -1
      const dx = x - (1 + 2 * col)
      const dy = y - (1 + 2 * row)
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (adx <= 1 && ady <= 1 && adx + ady <= OCT_CUT) return row * cols + col
      const gx = 1 + 2 * col + Math.sign(dx)
      const gy = 1 + 2 * row + Math.sign(dy)
      const gcol = (gx - 2) / 2
      const grow = (gy - 2) / 2
      if (
        gcol < 0 ||
        gcol >= cols - 1 ||
        grow < 0 ||
        grow >= rows - 1 ||
        Math.abs(x - gx) + Math.abs(y - gy) > OCT_G + 1e-9
      ) {
        return -1
      }
      return cols * rows + grow * (cols - 1) + gcol
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}
