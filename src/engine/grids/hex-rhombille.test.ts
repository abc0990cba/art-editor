import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { deserialize, serialize } from '../core/project.ts'
import { buildGeometry } from '../geometry/index.ts'
import { cellCoordLabel, docSize, makeGrid } from './index.ts'

describe('hexFlat + rhombille shared lattice behavior', () => {
  for (const type of ['hexFlat', 'rhombille'] as const) {
    it(`${type}: cellAt round-trips for every cell`, () => {
      const g = makeGrid(type, 12, 10)
      for (let i = 0; i < g.count; i++) {
        const c = g.center(i)
        if (type === 'rhombille') {
          // the three lozenges of a hex share one center: probe halfway to each face's far vertex
          const v = g.polygon(i)[1]
          expect(g.cellAt((c.x + v.x) / 2, (c.y + v.y) / 2), `#${i}`).toBe(i)
        } else {
          expect(g.cellAt(c.x, c.y), `#${i}`).toBe(i)
        }
      }
    })

    it(`${type}: polygons have 3+ distinct vertices inside the canvas`, () => {
      const g = makeGrid(type, 12, 10)
      for (let i = 0; i < g.count; i++) {
        const poly = g.polygon(i)
        expect(poly.length).toBeGreaterThanOrEqual(3)
        for (const p of poly) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9)
          expect(p.x).toBeLessThanOrEqual(g.w + 1e-9)
          expect(p.y).toBeGreaterThanOrEqual(-1e-9)
          expect(p.y).toBeLessThanOrEqual(g.h + 1e-9)
        }
      }
    })

    it(`${type}: docSize covers all cell centers`, () => {
      const g = makeGrid(type, 12, 10)
      const { w, h } = docSize(type, 12, 10)
      expect(w).toBe(g.w)
      expect(h).toBe(g.h)
    })

    it(`${type}: edge adjacency is symmetric and one connected component`, () => {
      const g = makeGrid(type, 9, 7)
      for (let i = 0; i < g.count; i++) {
        for (const j of g.edgeNeighbors(i)) {
          expect(g.edgeNeighbors(j), `${i}->${j}`).toContain(i)
        }
      }
      const seen = new Set<number>([0])
      const queue = [0]
      while (queue.length > 0) {
        const i = queue.pop()!
        for (const j of g.edgeNeighbors(i)) {
          if (!seen.has(j)) {
            seen.add(j)
            queue.push(j)
          }
        }
      }
      expect(seen.size).toBe(g.count)
    })

    it(`${type}: project round trip restores type, buffer and rendering`, () => {
      const doc = defaultDoc()
      doc.gridType = type
      doc.cols = 6
      doc.rows = 5
      doc.cells = new Uint16Array(makeGrid(type, 6, 5).count)
      doc.cells[0] = 1
      doc.cells[1] = 1
      const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
      expect(restored.gridType).toBe(type)
      expect(restored.cells[0]).toBe(1)
      expect(restored.cells.length).toBe(makeGrid(type, 6, 5).count)
      expect(buildGeometry(restored).paths.length).toBeGreaterThan(0)
    })
  }
})

describe('hexFlat', () => {
  it('interior cells have 6 edge neighbors', () => {
    const g = makeGrid('hexFlat', 10, 10)
    expect(g.edgeNeighbors(5 * 10 + 5).length).toBe(6)
  })

  it('hit test resolves off-center points of the flat-top hexagon', () => {
    const g = makeGrid('hexFlat', 6, 4)
    const c = g.center(1 * 6 + 2)
    // flat-top hexagons extend ±1 in x and ±√3/2 in y from the center
    expect(g.cellAt(c.x + 0.6, c.y + 0.3)).toBe(1 * 6 + 2)
    expect(g.cellAt(c.x - 0.8, c.y + 0.1)).toBe(1 * 6 + 2)
    expect(g.cellAt(c.x + 0.2, c.y + 0.7)).toBe(1 * 6 + 2)
    expect(g.cellAt(-5, -5)).toBe(-1)
  })
})

describe('rhombille', () => {
  it('owns three lozenges per hexagon', () => {
    expect(makeGrid('rhombille', 6, 4).count).toBe(3 * 6 * 4)
  })

  it('each lozenge has 4 edge neighbors (2 hex edges + 2 inner diagonals)', () => {
    const g = makeGrid('rhombille', 8, 8)
    for (const i of [4 * 3 * 8 + 4 * 3, 4 * 3 * 8 + 4 * 3 + 1, 4 * 3 * 8 + 4 * 3 + 2]) {
      expect(g.edgeNeighbors(i).length).toBe(4)
    }
  })

  it('hit test picks the lozenge sector of the offset point', () => {
    const g = makeGrid('rhombille', 4, 4)
    const hex = 1 * 4 + 1
    const c = g.center(hex * 3)
    // face f spans the 120° sector from V2f to V2f+2: probe straight up/down/left/right
    // pointy-top vertex angles: −30 + 60k → face 0 covers [−30°, 90°], 1: [90°, 210°], 2: [210°, 330°]
    expect(g.cellAt(c.x + 0.3, c.y + 0.05)).toBe(hex * 3) // ~10° → face 0
    expect(g.cellAt(c.x - 0.05, c.y + 0.3)).toBe(hex * 3 + 1) // ~100° → face 1
    expect(g.cellAt(c.x - 0.05, c.y - 0.3)).toBe(hex * 3 + 2) // ~260° → face 2
  })

  it('renders pixels and metaball geometry without throwing', () => {
    for (const renderMode of ['pixels', 'metaball'] as const) {
      const doc = defaultDoc()
      doc.gridType = 'rhombille'
      doc.cols = 6
      doc.rows = 5
      doc.cells = new Uint16Array(makeGrid('rhombille', 6, 5).count)
      doc.cells[7 * 3] = 1
      doc.cells[8 * 3] = 1
      doc.renderMode = renderMode
      const geo = buildGeometry(doc)
      expect(geo.paths.length, renderMode).toBeGreaterThan(0)
    }
  })
})

describe('cellCoordLabel for the hex family', () => {
  it('hexFlat: odd-q axial q/r', () => {
    const g = makeGrid('hexFlat', 6, 4)
    expect(cellCoordLabel(g, 0)).toBe('q:0 r:0')
    expect(cellCoordLabel(g, 6 + 1)).toBe('q:1 r:1') // odd col 1: r = row - (col-1)/2
    expect(cellCoordLabel(g, 2 * 6 + 2)).toBe('q:2 r:1') // even col 2: r = 2 - 1
  })

  it('rhombille: axial q/r plus the lozenge face letter', () => {
    const g = makeGrid('rhombille', 6, 4)
    expect(cellCoordLabel(g, 0)).toBe('q:0 r:0 A')
    expect(cellCoordLabel(g, 2)).toBe('q:0 r:0 C')
    expect(cellCoordLabel(g, (1 * 6 + 1) * 3 + 1)).toBe('q:1 r:1 B')
  })
})
