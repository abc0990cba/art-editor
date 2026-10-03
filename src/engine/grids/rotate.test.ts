import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { deserialize, serialize } from '../core/project.ts'
import { buildGeometry, stagingPreview } from '../geometry/index.ts'
import { makeGrid } from './index.ts'

describe('rotated grids', () => {
  it('cellAt(center(i)) round-trips for every cell at 45°', () => {
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
      const g = makeGrid(type, 10, 8, false, 45)
      for (let i = 0; i < g.count; i++) {
        const c = g.center(i)
        expect(g.cellAt(c.x, c.y), type).toBe(i)
      }
    }
  })

  it('rotates about the canvas center and fits the rotated bounding box', () => {
    const base = makeGrid('square', 8, 6)
    const rot = makeGrid('square', 8, 6, false, 90)
    // a 90° turn swaps the rect sides in the extent
    expect(rot.w).toBeCloseTo(base.h, 9)
    expect(rot.h).toBeCloseTo(base.w, 9)
    expect(rot.count).toBe(base.count)
    // every turned cell sits fully inside the new extent, centered in it
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < rot.count; i++) {
      for (const p of rot.polygon(i)) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9)
        expect(p.x).toBeLessThanOrEqual(rot.w + 1e-9)
        expect(p.y).toBeGreaterThanOrEqual(-1e-9)
        expect(p.y).toBeLessThanOrEqual(rot.h + 1e-9)
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    expect((minX + maxX) / 2).toBeCloseTo(rot.w / 2, 9)
    expect((minY + maxY) / 2).toBeCloseTo(rot.h / 2, 9)
    const c = { x: rot.w / 2, y: rot.h / 2 }
    for (let i = 0; i < 5; i++) {
      const p = base.center(i)
      const q = rot.center(i)
      expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeCloseTo(
        Math.hypot(p.x - base.w / 2, p.y - base.h / 2),
        9,
      )
    }
  })

  it('a 45° turn ends symmetrically: the diamond touches every edge midpoint', () => {
    const rot = makeGrid('square', 8, 8, false, 45)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < rot.count; i++) {
      for (const p of rot.polygon(i)) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    expect(minX).toBeCloseTo(0, 6)
    expect(minY).toBeCloseTo(0, 6)
    expect(maxX).toBeCloseTo(rot.w, 6)
    expect(maxY).toBeCloseTo(rot.h, 6)
    expect(rot.w).toBeCloseTo(rot.h, 9)
  })

  it('adjacent cells keep sharing edges after rotation (outline merge)', () => {
    const doc = defaultDoc()
    doc.gridRotation = 30
    doc.cols = 8
    doc.rows = 6
    doc.cells = new Uint16Array(makeGrid('square', 8, 6).count)
    doc.cells[3 * 8 + 3] = 1
    doc.cells[3 * 8 + 4] = 1
    doc.renderMode = 'outline'
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(1)
    expect((geo.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('angle symmetry stays on the rotated radius rings (cellByAngle)', () => {
    const g = makeGrid('square', 16, 16, false, 30)
    const i = 8 * 16 + 8
    const r0 = g.radiusOf(i)
    for (let a = 0; a < 12; a++) {
      const j = g.cellByAngle(i, (a / 12) * 2 * Math.PI)
      if (j >= 0) expect(Math.abs(g.radiusOf(j) - r0)).toBeLessThanOrEqual(0.75)
    }
  })

  it('distinct rotations get distinct cached grids, normalized angles share one', () => {
    expect(makeGrid('square', 4, 4, false, 0)).toBe(makeGrid('square', 4, 4))
    expect(makeGrid('square', 4, 4, false, 45)).not.toBe(makeGrid('square', 4, 4))
    expect(makeGrid('square', 4, 4, false, 45)).toBe(makeGrid('square', 4, 4, false, 405))
  })

  it('project round trip keeps gridRotation (and omits it when 0)', () => {
    const doc = defaultDoc()
    doc.gridRotation = 45
    doc.cells[5] = 1
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.gridRotation).toBe(45)
    expect(restored.cells[5]).toBe(1)
    const plain = deserialize(JSON.parse(JSON.stringify(serialize(defaultDoc()))))
    expect(plain.gridRotation).toBeUndefined()
  })

  it('a rotated square renders through the lattice path and declines the fast preview', () => {
    const doc = defaultDoc()
    doc.gridRotation = 20
    doc.cells[10] = 1
    expect(buildGeometry(doc).paths.length).toBeGreaterThan(0)
    expect(stagingPreview(doc, { cells: new Map([[11, 1]]) })).toBeNull()
  })
})
