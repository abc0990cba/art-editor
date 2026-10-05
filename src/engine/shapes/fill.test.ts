import { describe, expect, it } from 'vitest'

import { pointInPolys, regionCells } from './fill.ts'
import { ellipsePoints, linePoints } from './lines.ts'

describe('regionCells', () => {
  it('classifies a closed rect outline on a square buffer', () => {
    // 10x10 buffer, rect outline from (2,2) to (6,5)
    const outline = new Set<number>()
    for (let x = 2; x <= 6; x++) {
      outline.add(2 * 10 + x)
      outline.add(5 * 10 + x)
    }
    for (let y = 2; y <= 5; y++) {
      outline.add(y * 10 + 2)
      outline.add(y * 10 + 6)
    }
    const { inside, outside } = regionCells(outline, 10, 10)
    expect(inside.has(3 * 10 + 4)).toBe(true)
    expect(inside.has(4 * 10 + 5)).toBe(true)
    expect(inside.size).toBe(3 * 2) // x 3..5, y 3..4
    // outside covers the inflated bounding window (minX-1..maxX+1), not the whole buffer
    expect(outside.has(1 * 10 + 1)).toBe(true)
    expect(outside.has(6 * 10 + 7)).toBe(true)
    expect(outside.has(3 * 10 + 4)).toBe(false)
    for (const i of outline) {
      expect(inside.has(i)).toBe(false)
      expect(outside.has(i)).toBe(false)
    }
  })

  it('fills a shape touching the canvas border', () => {
    // outline along three edges of the buffer: the "interior" is the whole canvas
    const bw = 5
    const bh = 4
    const outline = new Set<number>()
    for (let x = 0; x < bw; x++) {
      outline.add(x)
      outline.add((bh - 1) * bw + x)
    }
    for (let y = 0; y < bh; y++) {
      outline.add(y * bw)
      outline.add(y * bw + bw - 1)
    }
    const { inside } = regionCells(outline, bw, bh)
    expect(inside.size).toBe(3 * 2)
    expect(inside.has(1 * bw + 2)).toBe(true)
  })

  it('returns nothing for an empty outline', () => {
    const { inside, outside } = regionCells(new Set(), 4, 4)
    expect(inside.size).toBe(0)
    expect(outside.size).toBe(0)
  })

  // production pin: the exterior flood is 4-connected while Bresenham outlines are
  // 8-connected, but discrete Jordan duality keeps every closed rasterized shape watertight —
  // the fill of a dragged ellipse/line shape must never leak past the outline
  it('holds the flood inside for every rasterized ellipse (shape-fill sweep)', () => {
    for (let w = 3; w <= 40; w++) {
      for (let h = 3; h <= 40; h++) {
        const bw = w + 8
        const bh = h + 8
        const outline = new Set(ellipsePoints(2, 2, 2 + w, 2 + h, {}).map(([x, y]) => y * bw + x))
        const { inside } = regionCells(outline, bw, bh)
        // the flood may not escape: interior stays within the outline's bounding ring
        let escaped = false
        for (const i of inside) {
          const x = i % bw
          const y = (i - x) / bw
          if (x <= 1 || y <= 1 || x >= w + 3 || y >= h + 3) escaped = true
        }
        expect(escaped, `ellipse ${w}x${h} leaked`).toBe(false)
      }
    }
  }, 20_000)

  it('holds the flood inside for closed diagonal-heavy loops (45° diamond sweep)', () => {
    for (let r = 2; r <= 30; r++) {
      const bw = 2 * r + 10
      const bh = bw
      const c = r + 3
      const pts = [
        ...linePoints(c, c - r, c + r, c),
        ...linePoints(c + r, c, c, c + r),
        ...linePoints(c, c + r, c - r, c),
        ...linePoints(c - r, c, c, c - r),
      ]
      const outline = new Set(pts.map(([x, y]) => y * bw + x))
      const { inside } = regionCells(outline, bw, bh)
      let bad = inside.size < 2 * r * r - 2 * r
      for (const i of inside) {
        const x = i % bw
        const y = (i - x) / bw
        // diamond interior: |x-c| + |y-c| < r
        if (Math.abs(x - c) + Math.abs(y - c) >= r + 0.5) bad = true
      }
      expect(bad, `diamond r=${r} misclassified`).toBe(false)
    }
  })
})

describe('pointInPolys', () => {
  const square = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ] as const

  it('uses the even-odd rule', () => {
    expect(pointInPolys(square, 5, 5)).toBe(true)
    expect(pointInPolys(square, 15, 5)).toBe(false)
    expect(pointInPolys(square, 5, 0)).toBe(true) // on the edge counts as inside
  })

  it('unions separate loops (a sun core plus its rays)', () => {
    const core = [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1],
      ],
    ] as const
    const ray = [
      [
        [5, 1],
        [8, 1],
        [8, 2],
        [5, 2],
        [5, 1],
      ],
    ] as const
    const polys = [...core, ...ray]
    expect(pointInPolys(polys, 2, 2)).toBe(true)
    expect(pointInPolys(polys, 6, 1.5)).toBe(true)
    expect(pointInPolys(polys, 4, 2)).toBe(false)
  })
})
