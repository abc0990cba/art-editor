import { describe, expect, it } from 'vitest'

import { symmetryAxes } from '../effects/symmetry-grid.ts'
import { makeGrid, type Grid } from '../grids/index.ts'
import { allNodes } from './index.ts'
import { resolveParams } from './registry.ts'
import type { EvalContext, RasterNodeDef } from './types.ts'

// the barrel import above registers every node family; resolveParams needs that registry
const offset = allNodes().find((n) => n.id === 'mod.offset') as RasterNodeDef
const symmetry = allNodes().find((n) => n.id === 'mod.symmetry') as RasterNodeDef

const lattice = (type: 'rhombille' | 'octasquare', cols = 4, rows = 4) => {
  const grid = makeGrid(type, cols, rows)
  const ctx: EvalContext = {
    bw: cols,
    bh: rows,
    grid,
    paletteLen: 8,
    hexValue: () => 1,
    luma: () => 0.5,
    rng: () => 0.5,
  }
  return { ctx, grid }
}

/** Square-buffer context without a grid: the historical bw/bh index math. */
const squareCtx = (bw = 8, bh = 8): EvalContext => ({
  bw,
  bh,
  paletteLen: 8,
  hexValue: () => 1,
  luma: () => 0.5,
  rng: () => 0.5,
})

/** Face cells of one lattice column (rhombille index = (row·cols+col)·3+face). */
const columnFaces = (grid: Grid, col: number, rows = grid.rows): number[] => {
  const out: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let face = 0; face < 3; face++) out.push((row * grid.cols + col) * 3 + face)
  }
  return out
}

const centroid = (grid: Grid, idxs: Iterable<number>, axis: 'x' | 'y'): number => {
  const vals = [...idxs].map((i) => grid.center(i)[axis])
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

describe('mod.offset', () => {
  it('dx=dy=0 passes compound-lattice ink through untouched', () => {
    const { ctx } = lattice('rhombille')
    const input = new Map([
      [0, 1],
      [30, 2],
      [47, 3],
    ])
    const out = offset.evaluate(ctx, resolveParams('mod.offset', { dx: 0, dy: 0 }), input)
    expect(out).toBe(input)
  })

  it('dx=1 shifts rhombille ink a lattice step right without dropping or merging cells', () => {
    const { ctx, grid } = lattice('rhombille')
    const input = new Map(columnFaces(grid, 1).map((i) => [i, 1] as const))
    const out = offset.evaluate(ctx, resolveParams('mod.offset', { dx: 1, dy: 0 }), input)
    expect(out.size).toBe(input.size)
    for (const j of out.keys()) {
      expect(j).toBeGreaterThanOrEqual(0)
      expect(j).toBeLessThan(grid.count)
    }
    expect(centroid(grid, out.keys(), 'x')).toBeGreaterThan(centroid(grid, input.keys(), 'x'))
  })

  it('dy=1 shifts interior rhombille ink a row band down', () => {
    const { ctx, grid } = lattice('rhombille')
    const input = new Map(columnFaces(grid, 1, grid.rows - 1).map((i) => [i, 1] as const))
    const out = offset.evaluate(ctx, resolveParams('mod.offset', { dx: 0, dy: 1 }), input)
    expect(out.size).toBe(input.size)
    for (const j of out.keys()) {
      expect(j).toBeGreaterThanOrEqual(0)
      expect(j).toBeLessThan(grid.count)
    }
    expect(centroid(grid, out.keys(), 'y')).toBeGreaterThan(centroid(grid, input.keys(), 'y'))
  })

  it('keeps the exact square-buffer math for square-index grids', () => {
    const ctx = squareCtx(4, 3)
    const input = new Map([
      [0, 1],
      [3, 2],
      [10, 3],
    ])
    const out = offset.evaluate(ctx, resolveParams('mod.offset', { dx: 1, dy: 0 }), input)
    // (0,0)→(1,0); (3,0) falls off the right edge; (2,2)→(3,2)
    expect(out.get(1)).toBe(1)
    expect(out.get(11)).toBe(3)
    expect(out.size).toBe(2)
  })
})

describe('mod.symmetry', () => {
  it('mirrors rhombille ink onto lattice cells (grid-aware orbit)', () => {
    const { ctx, grid } = lattice('rhombille')
    const axes = symmetryAxes(grid)
    // a face of the hex whose center sits on the snapped mirror axis: every surviving copy
    // stays in that hex, so the involutive center relation holds for the whole orbit
    const i = 2 * 3 + 0
    const out = symmetry.evaluate(
      ctx,
      resolveParams('mod.symmetry', { mode: 'mirrorX', n: 8 }),
      new Map([[i, 1]]),
    )
    expect(out.size).toBeGreaterThanOrEqual(2)
    const c = grid.center(i)
    for (const j of out.keys()) {
      expect(j).toBeGreaterThanOrEqual(0)
      expect(j).toBeLessThan(grid.count)
      // the involutive relation holds for the mirror partners, not for the original cell
      if (j === i) continue
      const cj = grid.center(j)
      expect(cj.y).toBeCloseTo(c.y, 3)
      expect(2 * axes.x - cj.x).toBeCloseTo(c.x, 3)
    }
  })

  it('quad copies stay inside the compound lattice', () => {
    const { ctx, grid } = lattice('octasquare')
    const out = symmetry.evaluate(
      ctx,
      resolveParams('mod.symmetry', { mode: 'quad', n: 8 }),
      new Map([[5, 1]]),
    )
    expect(out.size).toBeGreaterThanOrEqual(2)
    for (const j of out.keys()) {
      expect(j).toBeGreaterThanOrEqual(0)
      expect(j).toBeLessThan(grid.count)
    }
  })

  it('keeps the square-buffer mirror math when no grid is provided', () => {
    const ctx = squareCtx(8, 8)
    const out = symmetry.evaluate(
      ctx,
      resolveParams('mod.symmetry', { mode: 'quad', n: 8 }),
      new Map([[27, 1]]),
    )
    // (3,3) mirrors to (4,3), (3,4) and (4,4)
    expect([...out.keys()].sort((a, b) => a - b)).toEqual([27, 28, 35, 36])
  })
})
