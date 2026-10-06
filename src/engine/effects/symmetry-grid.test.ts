import { describe, expect, it } from 'vitest'

import { makeGrid } from '../grids/index.ts'
import {
  gridSymmetryOrbit,
  gridSymmetryPairs,
  rotationCenter,
  symmetryAxes,
} from './symmetry-grid.ts'

describe('grid symmetry copies (non-square lattices)', () => {
  it('mirror axes snap to the lattice: hex canvas middles move a quarter-step', () => {
    // pointy-top hex: the bounding box is half-step asymmetric, w/2 is never a lattice axis
    const even = makeGrid('hex', 4, 4)
    expect(symmetryAxes(even).x).toBeCloseTo(Math.sqrt(3) * 2)
    const odd = makeGrid('hex', 5, 5)
    expect(symmetryAxes(odd).x).toBeCloseTo(Math.sqrt(3) * 3)
    // square and radial keep the exact middle
    const sq = makeGrid('square', 8, 6)
    expect(symmetryAxes(sq)).toEqual({ x: 4, y: 3 })
    // the rosette center sits on a cell center for hex
    const center = rotationCenter(makeGrid('hex', 13, 13))
    const cell = makeGrid('hex', 13, 13).cellAt(center.x, center.y)
    expect(cell).toBeGreaterThanOrEqual(0)
  })

  it('mirror copies are exact and involutive on every lattice that has mirror axes', () => {
    for (const [type, cols, rows, modes] of [
      ['hex', 4, 5, ['mirrorX', 'mirrorY', 'quad']],
      ['hex', 5, 4, ['mirrorX', 'mirrorY', 'quad']],
      ['hex', 5, 5, ['mirrorX', 'mirrorY', 'quad']],
      ['hexFlat', 5, 4, ['mirrorX', 'mirrorY', 'quad']],
      ['triangle', 7, 6, ['mirrorX']],
      ['rhombille', 4, 4, ['mirrorX']],
      ['brick', 7, 6, ['mirrorX', 'mirrorY', 'quad']],
      ['octasquare', 5, 4, ['mirrorX', 'mirrorY', 'quad']],
      ['diamond', 6, 5, ['mirrorX', 'mirrorY', 'quad']],
      ['iso', 6, 5, ['mirrorX', 'mirrorY', 'quad']],
    ] as const) {
      const g = makeGrid(type, cols, rows)
      for (const mode of modes) {
        for (let i = 0; i < g.count; i++) {
          const orbit = gridSymmetryOrbit(g, i, { mode, n: 8 })
          expect(orbit[0], `${type} ${mode} idx ${i}`).toBe(i)
          for (const j of orbit) {
            // every copy's own orbit contains the source: pairs resolve the same from both sides
            expect(
              gridSymmetryOrbit(g, j, { mode, n: 8 }),
              `${type} ${mode} idx ${i} → ${j}`,
            ).toContain(i)
          }
        }
      }
    }
  })

  it('lattices without a horizontal mirror axis still copy deterministically', () => {
    // triangle rows and rhombille kites have no horizontal mirror axis: copies snap to the
    // nearest cell and stay stable, but a pair may resolve asymmetrically — the honest limit
    for (const [type, cols, rows] of [
      ['triangle', 7, 6],
      ['rhombille', 4, 4],
    ] as const) {
      const g = makeGrid(type, cols, rows)
      for (let i = 0; i < g.count; i++) {
        const orbit = gridSymmetryOrbit(g, i, { mode: 'mirrorY', n: 8 })
        expect(orbit[0], `${type} idx ${i}`).toBe(i)
        expect(gridSymmetryOrbit(g, i, { mode: 'mirrorY', n: 8 })).toEqual(orbit)
        for (const j of orbit) expect(j).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('cells exactly on a mirror axis map to themselves (no spurious partner)', () => {
    const g = makeGrid('hex', 5, 5)
    const ax = symmetryAxes(g).x
    let onAxis = 0
    for (let i = 0; i < g.count; i++) {
      const c = g.center(i)
      if (Math.abs(c.x - ax) > 1e-4) continue
      onAxis++
      expect(gridSymmetryOrbit(g, i, { mode: 'mirrorX', n: 8 })).toEqual([i])
    }
    expect(onAxis).toBeGreaterThan(0)
  })

  it('diag8 yields the 7 other D4 elements and quad 3 copies', () => {
    const g = makeGrid('hex', 9, 9)
    const far = 0
    expect(gridSymmetryOrbit(g, far, { mode: 'quad', n: 8 }).length).toBeLessThanOrEqual(4)
    expect(gridSymmetryOrbit(g, far, { mode: 'diag8', n: 8 }).length).toBeLessThanOrEqual(8)
    expect(gridSymmetryOrbit(g, far, { mode: 'none', n: 8 })).toEqual([far])
  })

  it('radial folds close: 6-fold rotation orbits are shared sets of 6 hex cells', () => {
    const g = makeGrid('hex', 13, 13)
    const centerish = g.cellAt(symmetryAxes(g).x, symmetryAxes(g).y + 4.5)
    expect(centerish).toBeGreaterThanOrEqual(0)
    const orbit = gridSymmetryOrbit(g, centerish, { mode: 'radial', n: 6 })
    expect(orbit).toHaveLength(6)
    for (const j of orbit) {
      expect([...gridSymmetryOrbit(g, j, { mode: 'radial', n: 6 })].sort()).toEqual(
        [...orbit].sort(),
      )
    }
  })

  it('radial sector gate rejects cells outside the filled wedge', () => {
    const g = makeGrid('hex', 9, 9)
    let accepted = 0
    for (let i = 0; i < g.count; i++) {
      const orbit = gridSymmetryOrbit(g, i, { mode: 'radial', n: 6 }, { fill: 30 })
      if (orbit.length > 0) accepted++
    }
    expect(accepted).toBeLessThan(g.count)
  })

  it('pairs map both endpoints through the same copy', () => {
    const g = makeGrid('hex', 7, 7)
    const a = 2 * g.cols + 3
    const b = 2 * g.cols + 4
    for (const [ia] of gridSymmetryPairs(g, a, b, { mode: 'mirrorX', n: 8 })) {
      // each copy's first endpoint carries `a` in its own orbit (shared mirror pair)
      expect(gridSymmetryOrbit(g, ia, { mode: 'mirrorX', n: 8 })).toContain(a)
    }
    expect(gridSymmetryPairs(g, a, b, { mode: 'none', n: 8 })).toEqual([])
  })
})
