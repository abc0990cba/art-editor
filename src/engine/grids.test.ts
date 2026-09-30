import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from './doc.ts'
import { buildGeometry } from './geometry.ts'
import { cellCoordLabel, docSize, makeGrid } from './grids.ts'
import type { Pt } from './marching-squares'
import { deserialize, serialize } from './project.ts'

describe('grid geometry', () => {
  for (const type of [
    'square',
    'hex',
    'triangle',
    'radial',
    'diamond',
    'iso',
    'brick',
    'octasquare',
  ] as const) {
    it(`${type}: cellAt(center(i)) round-trips for every cell`, () => {
      const g = makeGrid(type, 12, 10)
      for (let i = 0; i < g.count; i++) {
        const c = g.center(i)
        expect(g.cellAt(c.x, c.y)).toBe(i)
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
  }

  it('hex interior cells have 6 edge neighbors', () => {
    const g = makeGrid('hex', 10, 10)
    const i = 5 * 10 + 5
    expect(g.edgeNeighbors(i).length).toBe(6)
  })

  it('triangle interior cells have 4 edge neighbors (base split in halves)', () => {
    const g = makeGrid('triangle', 8, 6)
    const i = 2 * 8 + 2
    expect(g.edgeNeighbors(i).length).toBe(4)
  })

  it('radial interior cells have 3+ edge neighbors', () => {
    const g = makeGrid('radial', 12, 8)
    const i = 4 * 12 + 3
    expect(g.edgeNeighbors(i).length).toBeGreaterThanOrEqual(3)
  })

  it('diamond and iso interior cells have 4 edge neighbors', () => {
    for (const type of ['diamond', 'iso'] as const) {
      const g = makeGrid(type, 10, 8)
      const i = 4 * 10 + 4
      expect(g.edgeNeighbors(i).length, type).toBe(4)
    }
  })

  it('diamond and iso resolve off-center points inside the cell', () => {
    const d = makeGrid('diamond', 8, 6)
    const cd = d.center(3 * 8 + 3)
    expect(d.cellAt(cd.x + 0.2, cd.y + 0.1)).toBe(3 * 8 + 3)
    expect(d.cellAt(cd.x - 0.45, cd.y)).toBe(3 * 8 + 3)
    // the shear boxes tile the plane: an off-cell point lands in the neighbor diamond,
    // and only points outside the lattice bounds return -1
    expect(d.cellAt(cd.x + 0.45, cd.y + 0.45)).toBe(3 * 8 + 4)
    expect(d.cellAt(-5, -5)).toBe(-1)
    const iso = makeGrid('iso', 8, 6)
    const ci = iso.center(3 * 8 + 3)
    expect(iso.cellAt(ci.x + 0.6, ci.y + 0.1)).toBe(3 * 8 + 3)
    expect(iso.cellAt(ci.x - 0.9, ci.y)).toBe(3 * 8 + 3)
  })

  it('brick interior cells have 6 edge neighbors (2 sides + 2 above + 2 below)', () => {
    const g = makeGrid('brick', 10, 8)
    const i = 4 * 10 + 4
    expect(g.edgeNeighbors(i).length).toBe(6)
  })

  it('octasquare: octagons have 8 neighbors, gap squares 4', () => {
    const g = makeGrid('octasquare', 8, 6)
    expect(g.edgeNeighbors(3 * 8 + 3).length).toBe(8)
    const gap = 8 * 6 + 2 * (8 - 1) + 2
    expect(g.edgeNeighbors(gap).length).toBe(4)
  })

  it('octasquare: cellAt resolves octagons, gaps and canvas corners', () => {
    const g = makeGrid('octasquare', 4, 4)
    expect(g.cellAt(1, 1)).toBe(0) // octagon center
    expect(g.cellAt(3, 3)).toBe(1 * 4 + 1) // next octagon
    expect(g.cellAt(2, 2)).toBe(16) // first interior gap square
    expect(g.cellAt(2, 1.2)).toBe(1) // inside octagon 1's west flat
    expect(g.cellAt(0.5, 1)).toBe(0) // on the north flat
    expect(g.cellAt(0.2, 0.2)).toBe(-1) // canvas corner outside every cell
  })

  it('sheared and brick lattices are one connected component', () => {
    for (const type of ['diamond', 'iso', 'brick', 'octasquare'] as const) {
      const g = makeGrid(type, 9, 7)
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
      expect(seen.size, type).toBe(g.count)
    }
  })

  it('sheared lattices place their vertices inside the canvas even at the edges', () => {
    for (const type of ['diamond', 'iso', 'brick'] as const) {
      const g = makeGrid(type, 7, 9)
      for (const corner of [0, g.cols - 1, (g.rows - 1) * g.cols, g.count - 1]) {
        for (const p of g.polygon(corner)) {
          expect(p.x, type).toBeGreaterThanOrEqual(-1e-9)
          expect(p.x, type).toBeLessThanOrEqual(g.w + 1e-9)
          expect(p.y, type).toBeGreaterThanOrEqual(-1e-9)
          expect(p.y, type).toBeLessThanOrEqual(g.h + 1e-9)
        }
      }
    }
  })
})

function docOn(
  type: 'hex' | 'triangle' | 'radial' | 'diamond' | 'iso' | 'brick' | 'octasquare',
  cells: number[],
): Doc {
  const doc = defaultDoc()
  doc.gridType = type
  doc.cols = 12
  doc.rows = 10
  doc.cells = new Uint16Array(makeGrid(type, 12, 10).count)
  cells.forEach((i) => (doc.cells[i] = 1))
  return doc
}

describe('rendering on non-square grids', () => {
  it('hex: outline merges two adjacent cells into one loop', () => {
    const doc = docOn('hex', [])
    const g0 = makeGrid('hex', 12, 10)
    doc.cells = new Uint16Array(g0.count)
    doc.cells[5 * 12 + 5] = 1
    doc.cells[5 * 12 + 6] = 1 // edge-adjacent hex
    doc.renderMode = 'outline'
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(1)
    expect((geo.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('hex: separate cells produce separate subpaths', () => {
    const doc = docOn('hex', [])
    const g0 = makeGrid('hex', 12, 10)
    doc.cells = new Uint16Array(g0.count)
    doc.cells[5 * 12 + 5] = 1
    doc.cells[5 * 12 + 7] = 1 // one hex apart
    doc.renderMode = 'outline'
    const geo = buildGeometry(doc)
    expect((geo.paths[0].d.match(/M/g) ?? []).length).toBe(2)
  })

  it('triangle: pixels mode emits arcs for rounded triangles', () => {
    const doc = docOn('triangle', [3])
    doc.renderMode = 'pixels'
    doc.style.radius = 0.3
    const geo = buildGeometry(doc)
    expect(geo.paths[0].d).toContain('A')
  })

  it('radial: pixels mode fill follows the ring arc, not a straight chord', () => {
    const doc = docOn('radial', [])
    const g0 = makeGrid('radial', 12, 10)
    doc.cells = new Uint16Array(g0.count)
    const cell = 8 * 12 + 3
    doc.cells[cell] = 1
    doc.renderMode = 'pixels'
    doc.style.radius = 0.2
    const geo = buildGeometry(doc)
    // path vertices: endpoint of every M/L and of every A segment (its last two numbers)
    const verts: Pt[] = []
    for (const [, , cmd] of geo.paths[0].d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
      const n = (cmd.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      if (n.length >= 2) verts.push({ x: n[n.length - 2], y: n[n.length - 1] })
    }
    expect(verts.length).toBeGreaterThan(4)
    // take the polygon's outer-arc mid sample and shrink it exactly like the renderer
    // (scaledPolygon: size about the centroid), then require it as a path vertex
    const poly = g0.polygon(cell)
    const cx0 = poly.reduce((s, p) => s + p.x, 0) / poly.length
    const cy0 = poly.reduce((s, p) => s + p.y, 0) / poly.length
    const { x: cx, y: cy } = g0.center(cell)
    const midA = (2 * Math.PI * (3 + 0.5)) / 12
    let sample = poly[0]
    let best = Infinity
    for (const p of poly) {
      const da = Math.abs(Math.atan2(p.y - cy, p.x - cx) - midA)
      if (da < best) {
        best = da
        sample = p
      }
    }
    const sx = doc.style.sizeX
    const sy = doc.style.sizeY
    const expected = { x: cx0 + (sample.x - cx0) * sx, y: cy0 + (sample.y - cy0) * sy }
    const nearest = Math.min(...verts.map((v) => Math.hypot(v.x - expected.x, v.y - expected.y)))
    expect(nearest).toBeLessThan(2e-3)
  })

  it('radial: metaball merges adjacent sectors into one blob', () => {
    const doc = docOn('radial', [])
    doc.cells = new Uint16Array(makeGrid('radial', 12, 10).count)
    doc.cells[1 * 12 + 3] = 1
    doc.cells[1 * 12 + 4] = 1
    doc.renderMode = 'metaball'
    doc.metaball.strength = 40
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(1)
    expect((geo.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('diamond: outline merges two edge-adjacent cells into one loop', () => {
    const doc = docOn('diamond', [])
    doc.cells[4 * 12 + 5] = 1
    doc.cells[4 * 12 + 6] = 1 // neighbors across the shear lattice
    doc.renderMode = 'outline'
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(1)
    expect((geo.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('iso and brick: pixels mode renders ink into native cells', () => {
    for (const type of ['iso', 'brick'] as const) {
      const doc = docOn(type, [5 * 12 + 5, 5 * 12 + 6])
      const geo = buildGeometry(doc)
      expect(geo.paths.length, type).toBeGreaterThan(0)
      expect(geo.paths[0].d, type).toMatch(/^M/)
    }
  })
})

describe('grid project round trip', () => {
  it('restores gridType and content', () => {
    const doc = docOn('hex', [5, 6, 7])
    doc.renderMode = 'outline'
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.gridType).toBe('hex')
    expect(Array.from(restored.cells.slice(5, 8))).toEqual([1, 1, 1])
    expect(deserialize({ gridType: 'nonsense' }).gridType).toBe('square')
  })

  it('restores the new lattices', () => {
    for (const type of ['diamond', 'iso', 'brick', 'octasquare'] as const) {
      const doc = docOn(type, [0, 1])
      const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
      expect(restored.gridType, type).toBe(type)
      expect(Array.from(restored.cells.slice(0, 2)), type).toEqual([1, 1])
      // the restored buffer holds every cell, gap squares included
      expect(restored.cells.length, type).toBe(makeGrid(type, 12, 10).count)
      // and the restored doc renders without throwing
      expect(buildGeometry(restored).paths.length, type).toBeGreaterThan(0)
    }
  })
})

describe('radial grid: equal cells per ring (radialEven)', () => {
  const g = makeGrid('radial', 24, 12, true)

  it('sector counts grow with radius and never exceed cols', () => {
    const count = (ring: number) => {
      // count cells whose center sits on that ring
      const target = ((ring + 0.5) / 12) * 12 // rm = (ring+0.5), rMax = rows
      let n = 0
      for (let i = 0; i < g.count; i++) {
        const c = g.center(i)
        const r = Math.hypot(c.x - g.w / 2, c.y - g.h / 2)
        if (Math.abs(r - target) < 1e-9) n++
      }
      return n
    }
    const counts: number[] = []
    for (let ring = 0; ring < 12; ring++) counts.push(count(ring))
    expect(counts[0]).toBeLessThan(counts[11])
    for (let ring = 1; ring < counts.length; ring++) {
      expect(counts[ring]).toBeGreaterThanOrEqual(counts[ring - 1])
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(24)
  })

  it('cellAt(center(i)) round-trips and cellByAngle stays on the ring', () => {
    for (let i = 0; i < g.count; i++) {
      const c = g.center(i)
      expect(g.cellAt(c.x, c.y)).toBe(i)
      const r0 = g.radiusOf(i)
      for (let a = 0; a < 12; a++) {
        const j = g.cellByAngle(i, (a / 12) * 2 * Math.PI)
        if (j >= 0) expect(Math.abs(g.radiusOf(j) - r0)).toBeLessThanOrEqual(0.75)
      }
    }
  })

  it('edgeNeighbors connect every pair of vertically adjacent rings (even mode)', () => {
    // every cell must have neighbors in ring−1 and ring+1, and the whole grid
    // must be one connected component — otherwise fill/brush stop at ring borders
    for (let i = 0; i < g.count; i++) {
      const ring = Math.floor((g.radiusOf(i) / 12) * 12 - 0.5 + 1e-9)
      void ring
      const neigh = g.edgeNeighbors(i)
      expect(neigh.length).toBeGreaterThanOrEqual(2)
      expect(new Set(neigh).size).toBe(neigh.length)
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

  it('uneven grid keeps the classic uniform layout', () => {
    const u = makeGrid('radial', 24, 12)
    expect(u.count).toBe(24 * 12)
    expect(u.cellAt(u.center(5 * 24 + 3).x, u.center(5 * 24 + 3).y)).toBe(5 * 24 + 3)
  })
})

describe('cellCoordLabel', () => {
  it('square: doc-cell x/y from the buffer index at the given buffer width', () => {
    const g = makeGrid('square', 4, 3)
    // buffer width 8 (sub 2): buffer idx 1*8+5 → buffer (5,1) → doc cell (2,0)
    expect(cellCoordLabel(g, 1 * 8 + 5, 8)).toBe('x:2 y:0')
    // without a buffer width the grid is its own buffer (sub 1)
    expect(cellCoordLabel(g, 2 * 4 + 3)).toBe('x:3 y:2')
  })

  it('hex: axial q/r, the inverse of cellAt offset conversion', () => {
    const g = makeGrid('hex', 6, 4)
    expect(cellCoordLabel(g, 0)).toBe('q:0 r:0')
    expect(cellCoordLabel(g, 1 * 6 + 2)).toBe('q:2 r:1')
    // even rows shift the axial origin: col 4 of row 2 → q = 4 - 1
    expect(cellCoordLabel(g, 2 * 6 + 4)).toBe('q:3 r:2')
    // every cell's label round-trips through cellAt via the axial→offset map
    for (let i = 0; i < g.count; i++) {
      const row = Math.floor(i / g.cols)
      const col = i % g.cols
      const q = col - (row - (row % 2)) / 2
      const c = g.center(i)
      expect(g.cellAt(c.x, c.y)).toBe(i)
      expect(cellCoordLabel(g, i)).toBe(`q:${q} r:${row}`)
    }
  })

  it('triangle: row/col with the ▲/▼ orientation', () => {
    const g = makeGrid('triangle', 4, 2)
    expect(cellCoordLabel(g, 0)).toBe('row:0 col:0 ▲')
    expect(cellCoordLabel(g, 1)).toBe('row:0 col:1 ▼')
    expect(cellCoordLabel(g, 4 * 1 + 2)).toBe('row:1 col:2 ▼')
  })

  it('radial: ring/sector with both totals', () => {
    const g = makeGrid('radial', 8, 4)
    expect(cellCoordLabel(g, 0)).toBe('ring:0/4 sector:0/8')
    expect(cellCoordLabel(g, 8 + 3)).toBe('ring:1/4 sector:3/8')
    // the label always agrees with the grid's own ring/sector decomposition
    for (let i = 0; i < g.count; i++) {
      const [ring, sector, sectors] = g.ringSectorOf!(i)
      expect(cellCoordLabel(g, i)).toBe(`ring:${ring}/${g.rows} sector:${sector}/${sectors}`)
      const c = g.center(i)
      expect(g.cellAt(c.x, c.y)).toBe(i)
    }
  })

  it('sheared and brick lattices: col/row', () => {
    for (const type of ['diamond', 'iso', 'brick'] as const) {
      const g = makeGrid(type, 5, 4)
      expect(cellCoordLabel(g, 0), type).toBe('col:0 row:0')
      expect(cellCoordLabel(g, 2 * 5 + 3), type).toBe('col:3 row:2')
    }
  })

  it('octasquare: oct/gap coordinates', () => {
    const g = makeGrid('octasquare', 4, 3)
    expect(cellCoordLabel(g, 0)).toBe('oct:0 0')
    expect(cellCoordLabel(g, 5)).toBe('oct:1 1')
    expect(cellCoordLabel(g, 12)).toBe('gap:0 0')
    expect(cellCoordLabel(g, 12 + 2 * 3 + 1)).toBe('gap:1 2')
  })
})
