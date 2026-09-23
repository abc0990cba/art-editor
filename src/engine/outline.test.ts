import { describe, expect, it } from 'vitest'
import { defaultDoc, type Doc } from './doc'
import { buildGeometry } from './geometry'
import { deserialize } from './project'

function docWith(cells: Array<[number, number]>, cols = 8, rows = 8): Doc {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.cells = new Uint16Array(cols * rows)
  for (const [x, y] of cells) doc.cells[y * cols + x] = 1
  doc.renderMode = 'outline'
  doc.style.convexRadius = 0.25
  doc.style.concaveRadius = 0.15
  return doc
}

function arcs(d: string): number {
  return (d.match(/A/g) ?? []).length
}

describe('outline geometry', () => {
  it('merges two adjacent cells into one silhouette without a seam notch', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
    ])
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    // rectangle 2×1 → 4 corners after collinear merge → 4 fillet arcs
    expect(arcs(g.paths[0].d)).toBe(4)
    // outline spans the union: x from 1 to 3, y from 1 to 2
    expect(g.paths[0].d).toMatch(/^M/) // single compound path
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('keeps corner-touching cells as separate silhouettes', () => {
    const doc = docWith([
      [1, 1],
      [2, 2],
    ])
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1) // same color → one compound path…
    // …with two disjoint subpaths
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(2)
  })

  it('rounds five convex and one concave corner of an L-shape', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
      [1, 2],
    ])
    const g = buildGeometry(doc)
    expect(arcs(g.paths[0].d)).toBe(6)
  })

  it('isolated cell at radius 50% becomes a circle made of 4 arcs', () => {
    const doc = docWith([[2, 2]])
    doc.style.convexRadius = 0.5
    const g = buildGeometry(doc)
    expect(arcs(g.paths[0].d)).toBe(4)
  })

  it('radius 0 emits sharp corners with no arcs', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
    ])
    doc.style.convexRadius = 0
    doc.style.concaveRadius = 0
    const g = buildGeometry(doc)
    expect(arcs(g.paths[0].d)).toBe(0)
    expect(g.paths[0].d).toContain('L3 2') // straight union edge, no seam notch
  })

  it('merges adjacent sub-cells at ×2 into one outline', () => {
    const doc = docWith([], 4, 4)
    doc.sub = 2
    doc.cells = new Uint16Array(8 * 8)
    doc.cells[2 * 8 + 2] = 1
    doc.cells[2 * 8 + 3] = 1 // horizontally adjacent sub-cell
    const g = buildGeometry(doc)
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
    expect(arcs(g.paths[0].d)).toBe(4)
  })

  it('renders connectors as capsule strokes', () => {
    const doc = defaultDoc()
    doc.renderMode = 'outline'
    doc.links = [{ ax: 1, ay: 1, bx: 4, by: 3, v: 1 }]
    const g = buildGeometry(doc)
    expect(g.paths[0].stroke).toBeTruthy()
    expect(g.paths[0].d).toContain('M1.5 1.5L4.5 3.5')
  })

  it('separates colors into their own outlines', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
    ])
    doc.cells[1 * 8 + 2] = 2 // neighbor in another color
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(2)
  })
})

describe('render mode migration', () => {
  it('maps legacy metaball.enabled to renderMode', () => {
    const legacy = {
      v: 1,
      cols: 4,
      rows: 4,
      sub: 1,
      cells: Array.from({ length: 16 }, () => 0),
      links: [],
      palette: ['#111111'],
      style: { radius: 0.3, corners: {}, sizeX: 1, sizeY: 1 },
      metaball: { enabled: true, strength: 50, perColor: true, quality: 4 },
      bg: '',
      connectorWidth: 0.3,
    }
    expect(deserialize(legacy).renderMode).toBe('metaball')
    expect(
      deserialize({ ...legacy, metaball: { ...legacy.metaball, enabled: false } }).renderMode,
    ).toBe('pixels')
    expect(deserialize({ ...legacy, renderMode: 'outline', metaball: undefined }).renderMode).toBe(
      'outline',
    )
  })
})
