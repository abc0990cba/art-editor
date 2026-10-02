import { describe, expect, it } from 'vitest'

import { sameElementStyle } from './doc-style.ts'
import { defaultDoc, type Doc } from './doc.ts'
import { buildGeometry } from './geometry.ts'
import { gridBuildGeometry } from './grid-geometry.ts'
import { normalizePresetConfig } from './presets.ts'
import { deserialize, serialize } from './project.ts'

function singleCell(): Doc {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(64)
  doc.cells[2 * 8 + 3] = 1
  return doc
}

function twoRuns(): Doc {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(64)
  // two horizontal runs of the same color
  doc.cells[3 * 8 + 1] = 1
  doc.cells[3 * 8 + 2] = 1
  doc.cells[3 * 8 + 3] = 1
  doc.cells[6 * 8 + 1] = 1
  doc.cells[6 * 8 + 2] = 1
  return doc
}

/** Largest x coordinate mentioned by a path (figure reach). */
function pathMaxX(d: string): number {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  let max = -Infinity
  for (let i = 0; i < nums.length; i += 2) max = Math.max(max, nums[i])
  return max
}

describe('cell form jitter', () => {
  it('is deterministic for a fixed seed and changes with the seed', () => {
    const a = singleCell()
    a.style.sizeJitter = 0.5
    const b = singleCell()
    b.style.sizeJitter = 0.5
    expect(buildGeometry(a).paths[0].d).toBe(buildGeometry(b).paths[0].d)
    b.style.jitterSeed = 42
    expect(buildGeometry(b).paths[0].d).not.toBe(buildGeometry(a).paths[0].d)
  })

  it('keeps the RLE run merge (and byte-identical rects) at zero spread', () => {
    const doc = twoRuns()
    const g = buildGeometry(doc)
    // two runs → two rect fragments, no per-cell splitting
    expect(g.paths[0].d.match(/M/g)).toHaveLength(2)
    expect(g.paths[0].d).toMatch(/^M1 3L4 3/)
  })

  it('splits runs and shrinks figures as the size spread grows', () => {
    const doc = twoRuns()
    doc.style.sizeJitter = 0.6
    const g = buildGeometry(doc)
    // per-cell fragments: 3 + 2 cells, each its own subpath
    expect(g.paths[0].d.match(/M/g)).toHaveLength(5)

    const tight = singleCell()
    tight.style.sizeJitter = 0.2
    const wide = singleCell()
    wide.style.sizeJitter = 0.9
    const tightMax = pathMaxX(buildGeometry(tight).paths[0].d)
    const wideMax = pathMaxX(buildGeometry(wide).paths[0].d)
    expect(wideMax).toBeLessThan(tightMax)
    expect(wideMax).toBeGreaterThan(3) // still inside the cell
  })

  it('rotates per cell with angle spread; curved forms are unaffected', () => {
    const square = singleCell()
    square.style.shape = 'square'
    const d0 = buildGeometry(square).paths[0].d
    square.style.angleJitter = 90
    const d1 = buildGeometry(square).paths[0].d
    expect(d1).not.toBe(d0)

    const circle = singleCell()
    circle.style.shape = 'circle'
    const c0 = buildGeometry(circle).paths[0].d
    circle.style.angleJitter = 120
    expect(buildGeometry(circle).paths[0].d).toBe(c0)
  })

  it('varies non-square grids the same deterministic way', () => {
    const doc = defaultDoc()
    doc.gridType = 'hex'
    doc.renderMode = 'pixels'
    doc.style.shape = 'circle'
    doc.style.sizeJitter = 0.5
    const cells = new Uint16Array(64)
    cells[3 * 8 + 3] = 1
    cells[3 * 8 + 4] = 1
    const a = gridBuildGeometry(doc, cells, [])
    const b = gridBuildGeometry(doc, cells, [])
    expect(a[0].d).toBe(b[0].d)
    doc.style.jitterSeed = 777
    expect(gridBuildGeometry(doc, cells, [])[0].d).not.toBe(a[0].d)
  })

  it('round-trips through project JSON and clamps preset values', () => {
    const doc = singleCell()
    doc.style.sizeJitter = 0.4
    doc.style.angleJitter = 33
    doc.style.jitterSeed = 1234
    const back = deserialize(serialize(doc)) as Doc
    expect(back.style.sizeJitter).toBeCloseTo(0.4)
    expect(back.style.angleJitter).toBe(33)
    expect(back.style.jitterSeed).toBe(1234)

    const config = normalizePresetConfig({
      style: { sizeJitter: 5, angleJitter: -3, jitterSeed: 1e6 } as Partial<Doc['style']>,
    })
    expect(config.style.sizeJitter).toBe(1)
    expect(config.style.angleJitter).toBe(0)
    expect(config.style.jitterSeed).toBe(9999)
  })

  it('invalidates element grouping when the jitter fields change', () => {
    const a = singleCell()
    const elA = {
      style: {
        ...a.style,
        corners: { ...a.style.corners },
        shapeParams: { ...a.style.shapeParams },
      },
      renderMode: a.renderMode,
      connectivity: a.connectivity,
      metaball: { ...a.metaball },
      texture: { ...a.texture },
    } as const
    const elB = { ...elA, style: { ...elA.style, jitterSeed: elA.style.jitterSeed + 1 } }
    expect(sameElementStyle(elA, elB)).toBe(false)
    const elC = { ...elA, style: { ...elA.style, sizeJitter: 0.5 } }
    expect(sameElementStyle(elA, elC)).toBe(false)
  })
})
