import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { buildGeometry } from '../geometry/index.ts'
import { gridMetaballField } from './geometry.ts'
import { makeGrid, type GridType } from './index.ts'

type GridKind = 'hex' | 'triangle' | 'radial' | 'diamond' | 'iso' | 'brick' | 'octasquare'

function gridDoc(gridType: GridKind, shape: 'square' | 'circle') {
  const doc = defaultDoc()
  doc.gridType = gridType
  doc.cols = 4
  doc.rows = 4
  doc.cells = new Uint16Array(makeGrid(gridType, 4, 4, doc.radialEven).count).fill(1)
  doc.style = { ...doc.style, shape }
  return doc
}

describe('cell forms on non-square grids', () => {
  it('hex grid: forms draw arc fragments, `square` keeps the native hexagon polygon', () => {
    const circle = buildGeometry(gridDoc('hex', 'circle'))
    expect(circle.paths).toHaveLength(1)
    expect(circle.paths[0].d).toContain('A')

    const native = buildGeometry(gridDoc('hex', 'square'))
    expect(native.paths).toHaveLength(1)
    // zero-radius native polygons are plain M/L paths
    expect(native.paths[0].d).not.toContain('A')
  })

  it('forms render on every non-square lattice', () => {
    for (const gridType of [
      'triangle',
      'radial',
      'diamond',
      'iso',
      'brick',
      'octasquare',
    ] as const) {
      const g = buildGeometry(gridDoc(gridType, 'circle'))
      expect(g.paths.length, gridType).toBeGreaterThan(0)
      expect(g.paths[0].d, gridType).toContain('A')
    }
  })

  it('tone sizing shrinks light-ink forms on the hex grid', () => {
    const doc = gridDoc('hex', 'circle')
    doc.palette = ['#000000', '#eeeeee']
    doc.cells.fill(0)
    doc.cells[0] = 1 // dark ink → full-size figure
    doc.cells[1] = 2 // light ink → shrunk toward the floor
    doc.style.toneSize = true
    doc.style.toneSizeMin = 0.2
    const paths = buildGeometry(doc).paths
    expect(paths).toHaveLength(2)
    // horizontal radius of the first arc = the circle figure's half width
    const rx = (d: string) => Number(d.match(/A([\d.]+)/)![1])
    expect(rx(paths[0].d)).toBeGreaterThan(rx(paths[1].d))
  })
})

describe('grid-aware rounding', () => {
  /** One painted cell on a fresh doc; `pick` chooses the flat index out of the grid count. */
  function cellDoc(
    gridType: GridType,
    cols: number,
    rows: number,
    pick: (count: number) => number,
  ) {
    const doc = defaultDoc()
    doc.gridType = gridType
    doc.cols = cols
    doc.rows = rows
    const grid = makeGrid(gridType, cols, rows, doc.radialEven)
    doc.cells = new Uint16Array(grid.count)
    doc.cells[pick(grid.count)] = 1
    return doc
  }

  const radiiOf = (d: string) => [...d.matchAll(/A([\d.]+)/g)].map((m) => m[1])

  // lattice, cols, rows, painted cell picker, true corners of the native polygon
  const cases: [GridType, number, number, (count: number) => number, number][] = [
    ['square', 4, 4, () => 0, 4],
    ['hex', 4, 4, () => 0, 6],
    ['hexFlat', 4, 4, () => 0, 6],
    ['triangle', 4, 4, () => 0, 3],
    ['rhombille', 2, 2, () => 0, 4],
    ['diamond', 3, 3, () => 0, 4],
    ['iso', 3, 3, () => 0, 4],
    ['brick', 3, 3, () => 0, 4],
    ['octasquare', 2, 2, () => 0, 8],
  ]

  it('rounding lands on every lattice with exactly the true corners', () => {
    for (const [type, cols, rows, pick, corners] of cases) {
      const doc = cellDoc(type, cols, rows, pick)
      doc.style = { ...doc.style, radius: 0.25 }
      const paths = buildGeometry(doc).paths
      expect(paths, type).toHaveLength(1)
      expect(radiiOf(paths[0].d), type).toHaveLength(corners)
    }
  })

  it('radius 0 keeps plain polygons on every lattice', () => {
    for (const [type, cols, rows, pick] of cases) {
      const doc = cellDoc(type, cols, rows, pick)
      const paths = buildGeometry(doc).paths
      expect(paths[0].d, type).not.toContain('A')
    }
  })

  it('radial wedge rounds by ring thickness, not by arc chords', () => {
    const doc = cellDoc('radial', 12, 4, (count) => count - 1) // outermost ring sector
    doc.style = { ...doc.style, radius: 0.25 }
    const radii = radiiOf(buildGeometry(doc).paths[0].d).map(Number)
    expect(radii).toHaveLength(4)
    for (const r of radii) {
      // the old min-edge scale starved this to ≈0.05 (tiny arc chords fed the clamp)
      expect(r).toBeGreaterThan(0.15)
      expect(r).toBeLessThan(0.35)
    }
  })

  it('hex at the Circle preset becomes a circle-like cell', () => {
    const doc = cellDoc('hex', 4, 4, () => 0)
    doc.style = { ...doc.style, radius: 0.5 }
    const d = buildGeometry(doc).paths[0].d
    expect(radiiOf(d)).toHaveLength(6)
    // R = t/tan(30°) = 0.866 for t = 0.5 — the six fillets meet at the edge midpoints
    expect(d).toContain('A0.866')
  })

  it('triangle outline: collinear base splits get no fillet bumps', () => {
    const doc = cellDoc('triangle', 4, 4, () => 0)
    doc.renderMode = 'outline'
    doc.style = { ...doc.style, convexRadius: 0.2, concaveRadius: 0.1 }
    const radii = radiiOf(buildGeometry(doc).paths[0].d)
    // exactly the 3 convex corners (0.2/tan(60°)); the old emitter bumped the base midpoint
    expect(radii).toEqual(['0.115', '0.115', '0.115'])
  })

  it('radial outline: only true wedge corners fillet, arc samples stay smooth', () => {
    const doc = cellDoc('radial', 12, 4, (count) => count - 1)
    doc.renderMode = 'outline'
    doc.style = { ...doc.style, convexRadius: 0.2, concaveRadius: 0.1 }
    const radii = radiiOf(buildGeometry(doc).paths[0].d).map(Number)
    expect(radii).toHaveLength(4)
    for (const r of radii) {
      expect(r).toBeGreaterThan(0.15)
      expect(r).toBeLessThan(0.25)
    }
  })

  it('hex pair outline: fillets land on true corners with convex and concave radii', () => {
    const doc = cellDoc('hex', 4, 4, () => 0)
    doc.cells[1] = 1 // edge-adjacent neighbor → decagon silhouette with 2 reflex joints
    doc.renderMode = 'outline'
    doc.style = { ...doc.style, convexRadius: 0.2, concaveRadius: 0.05 }
    const radii = radiiOf(buildGeometry(doc).paths[0].d)
    expect(radii).toHaveLength(10)
    expect(radii.filter((r) => r === '0.346')).toHaveLength(8) // convex: 0.2/tan(30°)
    expect(radii.filter((r) => r === '0.087')).toHaveLength(2) // reflex joints: 0.05/tan(30°)
  })

  it('metaball splats scale with the local cell size on radial grids', () => {
    const doc = cellDoc('radial', 12, 4, () => 0) // ring 0 apex cell — arc length ≪ pitch
    doc.metaball.strength = 40
    const grid = makeGrid('radial', 12, 4, doc.radialEven)
    const field = gridMetaballField(doc, grid, doc.cells, () => true)
    const c = grid.center(0)
    const sampleAt = (dx: number, dy: number) => {
      const fx = Math.round((c.x + dx) / field.scale)
      const fy = Math.round((c.y + dy) / field.scale)
      return field.f[fy * field.fw + fx] ?? 0
    }
    expect(sampleAt(0, 0)).toBeGreaterThan(0.5)
    // √-scaled kernel (r ≈ 0.72) is dead by 0.65; a unit kernel would still glow ≈0.19 here
    expect(sampleAt(0.65, 0)).toBeLessThan(0.01)
  })
})
