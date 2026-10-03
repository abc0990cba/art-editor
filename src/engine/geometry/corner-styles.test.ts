import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from '../core/doc.ts'
import { buildGeometry } from './index.ts'

function docWith(cells: [number, number][], cols = 8, rows = 8): Doc {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.cells = new Uint16Array(cols * rows)
  for (const [x, y] of cells) doc.cells[y * cols + x] = 1
  return doc
}

/** End points of every path segment (arc inner params skipped; fillet arcs are inscribed) */
function pathPoints(d: string): [number, number][] {
  const pts: [number, number][] = []
  const re = /([MLAZ])([^MLAZ]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (m[1] === 'A') {
      if (nums.length >= 6) pts.push([nums[5], nums[6]])
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
    }
  }
  return pts
}

function bbox(d: string) {
  const pts = pathPoints(d)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function arcRadii(d: string): number[] {
  return [...d.matchAll(/A([\d.]+) /g)].map((mm) => Number(mm[1])).sort((a, b) => a - b)
}

describe('chamfer corner style', () => {
  it('pixels mode: radius 50% + chamfer renders diamonds without arcs', () => {
    const doc = docWith([[2, 2]])
    doc.renderMode = 'pixels'
    doc.style.radius = 0.5
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    doc.style.cornerStyle = 'chamfer'
    const g = buildGeometry(doc)
    expect(g.paths[0].d).not.toContain('A')
    expect(g.paths[0].d).toContain('L')
  })

  it('outline mode: chamfer replaces silhouette arcs with straight cuts', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
    ])
    doc.renderMode = 'outline'
    doc.style.convexRadius = 0.4
    doc.style.cornerStyle = 'chamfer'
    const g = buildGeometry(doc)
    expect(g.paths[0].d).not.toContain('A')
  })

  it('arc style keeps arcs', () => {
    const doc = docWith([[2, 2]])
    doc.renderMode = 'pixels'
    doc.style.radius = 0.5
    doc.style.sizeX = 1
    doc.style.sizeY = 1
    const g = buildGeometry(doc)
    expect(g.paths[0].d).toContain('A')
  })
})

describe('convex / concave outline radii', () => {
  it('concave radius 0 keeps the inner corner sharp on an L-shape', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
      [1, 2],
    ])
    doc.renderMode = 'outline'
    doc.style.convexRadius = 0.4
    doc.style.concaveRadius = 0
    const g = buildGeometry(doc)
    // 5 convex corners filleted, the single concave corner left sharp
    expect((g.paths[0].d.match(/A/g) ?? []).length).toBe(5)
  })

  it('convex and concave radii both apply on a diagonal junction', () => {
    const doc = docWith([
      [1, 1],
      [2, 2],
    ])
    doc.renderMode = 'outline'
    doc.connectivity = 'corner'
    doc.style.convexRadius = 0.4
    doc.style.concaveRadius = 0.3
    const g = buildGeometry(doc)
    const radii = [...g.paths[0].d.matchAll(/A([\d.]+) /g)].map((mm) => Number(mm[1]))
    expect(new Set(radii).size).toBe(2)
  })
})

describe('direction invariance', () => {
  for (const mode of ['outline', 'metaball'] as const) {
    it(`${mode}: horizontal and vertical pairs have mirrored bounding boxes`, () => {
      const mk = (cs: string[][]) => {
        const doc = docWith(cs.map(([x, y]) => [Number(x), Number(y)]))
        doc.renderMode = mode
        doc.connectivity = 'corner'
        return bbox(
          buildGeometry(doc)
            .paths.map((p) => p.d)
            .join(','),
        )
      }
      const h = mk([
        ['2', '2'],
        ['3', '2'],
      ])
      const v = mk([
        ['2', '2'],
        ['2', '3'],
      ])
      // same size swapped, same origin
      expect([h.maxX - h.minX, h.maxY - h.minY]).toEqual([v.maxY - v.minY, v.maxX - v.minX])
      expect(h.minX).toBe(v.minX)
      expect(h.minY).toBe(v.minY)
    })

    it(`${mode}: diagonal pair is symmetric across both axes`, () => {
      const doc = docWith([
        [2, 2],
        [3, 3],
      ])
      doc.renderMode = mode
      doc.connectivity = 'corner'
      const b = bbox(
        buildGeometry(doc)
          .paths.map((p) => p.d)
          .join(','),
      )
      expect(b.maxX - b.minX).toBeCloseTo(b.maxY - b.minY, 1)
    })
  }

  it('outline: arc radii multisets match between horizontal and vertical pairs', () => {
    const mk = (cs: string[][]) => {
      const doc = docWith(cs.map(([x, y]) => [Number(x), Number(y)]))
      doc.renderMode = 'outline'
      doc.style.convexRadius = 0.4
      doc.style.concaveRadius = 0.2
      return arcRadii(
        buildGeometry(doc)
          .paths.map((p) => p.d)
          .join(','),
      )
    }
    expect(
      mk([
        ['2', '2'],
        ['3', '2'],
      ]),
    ).toEqual(
      mk([
        ['2', '2'],
        ['2', '3'],
      ]),
    )
  })

  it('short edges clamp fillets and still produce closed paths', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
    doc.renderMode = 'outline'
    doc.style.convexRadius = 0.5
    const g = buildGeometry(doc)
    expect(g.paths[0].d).toContain('Z')
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })
})
