import { describe, expect, it } from 'vitest'

import { defaultDoc } from './doc.ts'
import { buildGeometry, stagingPreview } from './geometry.ts'
import { deserialize, serialize } from './project.ts'

function docWith(cells: [number, number][], cols = 8, rows = 8) {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.cells = new Uint16Array(cols * rows)
  for (const [x, y] of cells) doc.cells[y * cols + x] = 1
  return doc
}

describe('tone-driven cell size (form halftone)', () => {
  const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

  it('darker colors draw a larger figure, lighter a smaller one', () => {
    // same cell position, different palette darkness — spans are directly comparable
    const spanAt = (color: string): number => {
      const doc = docWith([[2, 2]])
      doc.palette = [color]
      // square fragments are plain M/L coordinate pairs — arcs would skew the span
      doc.style.shape = 'square'
      doc.style.toneSize = true
      doc.style.toneSizeMin = 0.2
      const v = nums(buildGeometry(doc).paths[0].d)
      const xs = v.filter((_, i) => i % 2 === 0)
      const ys = v.filter((_, i) => i % 2 === 1)
      return Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys))
    }
    const dark = spanAt('#000000')
    const light = spanAt('#eeeeee')
    expect(dark).toBeCloseTo(2, 1) // full cell
    expect(light).toBeLessThan(1.4) // shrunk toward the 0.2 floor
    expect(light).toBeGreaterThan(0.2)
    expect(dark).toBeGreaterThan(light)
  })

  it('tone size disables run merging even for squares', () => {
    const doc = docWith([
      [1, 1],
      [2, 1],
    ])
    doc.palette = ['#000000', '#eeeeee']
    doc.style.toneSize = true
    doc.style.toneSizeMin = 0.3
    const d = buildGeometry(doc).paths[0].d
    // same color → one path; different colors at tone-scaled sizes → per-cell fragments
    expect(d.match(/M/g)!.length).toBeGreaterThanOrEqual(2)
  })

  it('staging preview matches the full rebuild with tone size on', () => {
    const doc = docWith([[3, 3]])
    doc.palette = ['#111111', '#eeeeee']
    doc.cells[3 * 8 + 3] = 1
    doc.style.shape = 'heart'
    doc.style.toneSize = true
    doc.style.toneSizeMin = 0.3
    const preview = stagingPreview(doc, { cells: new Map([[3 * 8 + 3, 1]]) })
    expect(preview).not.toBeNull()
    expect(preview!.paths[0].d).toBe(buildGeometry(doc).paths[0].d)
  })

  it('project round trip preserves tone size; legacy docs backfill it off', () => {
    const doc = docWith([[1, 1]])
    doc.style.toneSize = true
    doc.style.toneSizeMin = 0.4
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.style.toneSize).toBe(true)
    expect(restored.style.toneSizeMin).toBeCloseTo(0.4)
    const legacy = deserialize({ cols: 2, rows: 2, links: [], palette: ['#111111'] })
    expect(legacy.style.toneSize).toBe(false)
  })
})
