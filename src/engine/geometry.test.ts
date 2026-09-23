import { describe, expect, it } from 'vitest'
import { changeSub, defaultDoc, resizeDoc } from './doc'
import { buildGeometry, distanceToLinkSq } from './geometry'
import { buildSvg } from './svg'
import { deserialize, serialize } from './project'

function docWith(cells: Array<[number, number]>, cols = 8, rows = 8) {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.cells = new Uint16Array(cols * rows)
  for (const [x, y] of cells) doc.cells[y * cols + x] = 1
  return doc
}

describe('shape geometry', () => {
  it('emits one path per color containing each painted cell', () => {
    const doc = docWith([
      [1, 1],
      [4, 4],
    ])
    doc.cells[1 * 8 + 4] = 2 // second color
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(2)
    const d = g.paths[0].d
    // the default style is a plain full-size square: the path starts at the cell corner
    expect(d).toMatch(/^M1 1L2 1/)
  })

  it('radius 50% with square size renders circles (arcs)', () => {
    const doc = docWith([[2, 2]])
    doc.style.radius = 0.5
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    const g = buildGeometry(doc)
    expect(g.paths[0].d).toContain('A')
  })

  it('per-corner override rounds only one corner', () => {
    const doc = docWith([[2, 2]])
    doc.style.radius = 0
    doc.style.corners.tl = 0.5
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    const g = buildGeometry(doc)
    const d = g.paths[0].d
    expect(d).toMatch(/^M2\.5 2/) // path starts after the top-left arc (x + r)
    expect(d).toContain('A0.5') // radius 0.5 × box 1
  })

  it('connectors render as round-capped strokes', () => {
    const doc = defaultDoc()
    doc.links = [{ ax: 1, ay: 1, bx: 4, by: 3, v: 1 }]
    const g = buildGeometry(doc)
    expect(g.paths[0].stroke).toBeTruthy()
    expect(g.paths[0].strokeWidth).toBeCloseTo(doc.connectorWidth)
    expect(g.paths[0].d).toContain('M1.5 1.5L4.5 3.5')
  })
})

describe('metaball geometry', () => {
  it('merges two adjacent cells into a single blob path', () => {
    const doc = docWith([
      [2, 2],
      [3, 2],
    ])
    doc.renderMode = 'metaball'
    doc.metaball.strength = 60
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    expect(g.paths[0].d).toContain('Q')
    expect(g.paths[0].d).toContain('Z')
  })

  it('keeps isolated cells as separate paths', () => {
    const doc = docWith([
      [1, 1],
      [5, 5],
    ])
    doc.renderMode = 'metaball'
    doc.metaball.strength = 30
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    // two disjoint subpaths (two 'M' commands)
    expect(g.paths[0].d.match(/M/g)).toHaveLength(2)
  })

  it('per-color isolation produces separate colored paths', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
      [5, 5],
      [6, 5],
    ])
    doc.renderMode = 'metaball'
    doc.metaball.strength = 60
    doc.metaball.perColor = true
    doc.cells[1 * 8 + 1] = 2 // neighbor in another color
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(2)
    expect(g.paths[0].fill).not.toBe(g.paths[1].fill)
  })

  it('returns no paths for an empty document', () => {
    const doc = defaultDoc()
    doc.renderMode = 'metaball'
    expect(buildGeometry(doc).paths).toHaveLength(0)
  })

  it('merges connectors into the blob field', () => {
    const doc = docWith([[1, 1]])
    doc.renderMode = 'metaball'
    doc.metaball.strength = 40
    doc.links = [{ ax: 1, ay: 1, bx: 4, by: 1, v: 1 }]
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    // path spans toward the connector end
    expect(g.paths[0].d).toContain('4.5')
  })

  it('places metaball connectors correctly with sub-cells (×2)', () => {
    const doc = docWith([])
    doc.cols = 32
    doc.rows = 32
    doc.cells = new Uint16Array(32 * 2 * 32 * 2)
    doc.sub = 2
    doc.renderMode = 'metaball'
    doc.metaball.strength = 32
    doc.links = [{ ax: 5, ay: 22, bx: 20, by: 25, v: 3 }]
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    // extract all coordinates from the path; the blob must hug the true segment
    const nums = (g.paths[0].d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    const maxX = Math.max(...nums.filter((_, i) => i % 2 === 0))
    expect(maxX).toBeGreaterThan(19)
    expect(maxX).toBeLessThan(23)
  })
})

describe('doc transforms', () => {
  it('resize preserves top-left content and drops out links', () => {
    const doc = docWith([[3, 3]])
    doc.links = [
      { ax: 1, ay: 1, bx: 2, by: 2, v: 1 },
      { ax: 6, ay: 6, bx: 7, by: 7, v: 1 },
    ]
    const next = resizeDoc(doc, 5, 5)
    expect(next.cols).toBe(5)
    expect(next.cells[3 * 5 + 3]).toBe(1)
    expect(next.links).toHaveLength(1)
  })

  it('changeSub ×2 duplicates content 2×2', () => {
    const doc = docWith([[2, 2]], 4, 4)
    const up = changeSub(doc, 2)
    expect(up.cells).toHaveLength(64)
    expect(up.cells[4 * 8 + 4]).toBe(1)
    expect(up.cells[5 * 8 + 5]).toBe(1)
    const down = changeSub(up, 1)
    expect(down.cells[2 * 4 + 2]).toBe(1)
  })
})

describe('svg export', () => {
  it('produces a vector svg with paths and viewBox', () => {
    const doc = docWith([[1, 1]])
    const svg = buildSvg(doc, { includeBg: false })
    expect(svg).toContain('<svg xmlns')
    expect(svg).toContain('viewBox="0 0 8 8"')
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<image')
  })

  it('includes background rect when requested', () => {
    const doc = docWith([[1, 1]])
    doc.bg = '#101010'
    const svg = buildSvg(doc, { includeBg: true })
    expect(svg).toContain('<rect')
    expect(svg).toContain('#101010')
  })
})

describe('project round trip', () => {
  it('restores an identical document', () => {
    const doc = docWith([
      [1, 1],
      [2, 3],
    ])
    doc.links = [{ ax: 1, ay: 1, bx: 2, by: 3, v: 2 }]
    doc.bg = '#202020'
    doc.style.radius = 0.3
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.cols).toBe(doc.cols)
    expect(restored.links).toEqual(doc.links)
    expect(restored.style.radius).toBeCloseTo(0.3)
    expect(Array.from(restored.cells)).toEqual(Array.from(doc.cells))
    expect(restored.bg).toBe('#202020')
  })

  it('sanitizes garbage input', () => {
    const doc = deserialize({ cols: 'x', rows: -5, cells: 'no', palette: ['zzz', '#aabbcc'] })
    expect(doc.cols).toBeGreaterThanOrEqual(1)
    expect(doc.rows).toBeGreaterThanOrEqual(1)
    expect(doc.palette).toEqual(['#aabbcc'])
  })
})

describe('hit testing', () => {
  it('distanceToLinkSq finds the nearest point on the segment', () => {
    const l = { ax: 0, ay: 0, bx: 4, by: 0, v: 1 }
    expect(distanceToLinkSq(l, 2, 0)).toBeCloseTo(0)
    expect(distanceToLinkSq(l, 2, 1)).toBeCloseTo(1) // pixel center (2.5,1.5): 1 off the segment
    expect(distanceToLinkSq(l, 2, 3)).toBeCloseTo(9) // pixel center (2.5,3.5): 3 off the segment
  })
})

describe('grid metaball geometry', () => {
  it('renders hex blobs at cell scale, not shrunk to field units', () => {
    const doc = {
      ...defaultDoc(),
      gridType: 'hex' as const,
      cols: 10,
      rows: 10,
      renderMode: 'metaball' as const,
    }
    doc.cells = new Uint16Array(100)
    doc.cells[4 * 10 + 4] = 1
    const g = buildGeometry(doc)
    expect(g.paths.length).toBeGreaterThan(0)
    // a single-cell blob is ≈1 doc unit across; the old field-unit bug shrunk it to ~0.03
    const nums = g.paths[0].d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    const extent = Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys))
    expect(extent).toBeGreaterThan(0.5)
  })
})

describe('squareEdges (no rounding toward the canvas border)', () => {
  const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

  it('pixels: a 1×1 cell renders as a plain rect (all border corners square)', () => {
    const doc = docWith([[0, 0]], 1, 1)
    doc.style.radius = 0.42
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    doc.style.squareEdges = true
    const d = buildGeometry(doc).paths[0].d
    expect(d).not.toContain('A')
    const v = nums(d)
    expect(Math.min(...v)).toBe(0)
    expect(Math.max(...v)).toBe(1)
  })

  it('pixels: interior corners still round when squareEdges is on', () => {
    const doc = docWith([[1, 1]], 3, 3)
    doc.style.radius = 0.42
    doc.style.squareEdges = true
    const d = buildGeometry(doc).paths[0].d
    expect(d).toContain('A')
  })

  it('metaball: blobs meeting the border run straight along it (contour hits 0 and extent)', () => {
    const doc = docWith([[0, 0]], 1, 1)
    doc.renderMode = 'metaball'
    doc.metaball.strength = 80
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    const loose = nums(
      buildGeometry({ ...doc, metaball: { ...doc.metaball, squareEdges: false } }).paths[0].d,
    )
    expect(Math.min(...loose)).toBeGreaterThan(0)
    expect(Math.max(...loose)).toBeLessThan(1)
    const square = nums(
      buildGeometry({ ...doc, metaball: { ...doc.metaball, squareEdges: true } }).paths[0].d,
    )
    // the closing loop runs outside the visible edge by at most half a field node
    expect(Math.min(...square)).toBeGreaterThanOrEqual(-0.13)
    expect(Math.max(...square)).toBeLessThanOrEqual(1.13)
    // straight runs lie exactly on the canvas border lines
    expect(square.filter((v) => v === 0).length).toBeGreaterThanOrEqual(2)
    expect(square).toContain(1)
  })

  it('outline: border vertices keep their 90° corner', () => {
    const doc = docWith([[0, 0]], 1, 1)
    doc.renderMode = 'outline'
    doc.style.convexRadius = 0.42
    const loose = buildGeometry({ ...doc, style: { ...doc.style, squareEdges: false } }).paths[0].d
    expect(loose).toContain('A')
    const square = buildGeometry({ ...doc, style: { ...doc.style, squareEdges: true } }).paths[0].d
    expect(square).not.toContain('A')
    const v = nums(square)
    expect(Math.min(...v)).toBe(0)
    expect(Math.max(...v)).toBe(1)
  })
})
