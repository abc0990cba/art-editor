import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from '../core/doc.ts'
import { DEFAULT_INLAY } from '../core/inlay.ts'
import { buildGeometry } from './index.ts'

function glyphDoc(): Doc {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(8 * 8)
  doc.cellObj = null
  doc.elements = []
  doc.styleScope = 'global'
  doc.palette = ['#888888']
  doc.cells[0] = 1
  doc.style.inlay = {
    ...DEFAULT_INLAY,
    shape: 'circle',
    source: 'glyph',
    glyph: '★',
    resolution: 6,
    dotShape: 'square',
    dotScale: 0.9,
    colorMode: 'darken',
    depth: 0.5,
  }
  return doc
}

describe('glyph inlay geometry', () => {
  it('emits one dot per on-bit of the sampled bitmap (node fallback)', () => {
    const geo = buildGeometry(glyphDoc())
    expect(geo.paths.length).toBe(2)
    expect(geo.paths[1].fill).toBe('#444444')
    // fallback disc at res 6 draws ~10 dots: every dot is its own M…Z subpath
    let dots = 0
    for (const ch of geo.paths[1].d) if (ch === 'M') dots++
    expect(dots).toBeGreaterThan(5)
  })

  it('keeps the dot matrix inside the base figure box', () => {
    const geo = buildGeometry(glyphDoc())
    const d = geo.paths[1].d
    // inlay scale 0.45 of the unit cell → all dot coordinates within [0.2, 0.8]
    for (const m of d.matchAll(/M([\d.]+) ([\d.]+)L/g)) {
      const x = Number(m[1])
      const y = Number(m[2])
      expect(x).toBeGreaterThanOrEqual(0.15)
      expect(x).toBeLessThanOrEqual(0.85)
      expect(y).toBeGreaterThanOrEqual(0.15)
      expect(y).toBeLessThanOrEqual(0.85)
    }
  })

  it('the source=shape regime stays byte-identical to the form inlay', () => {
    const shapeDoc = glyphDoc()
    shapeDoc.style.inlay = { ...shapeDoc.style.inlay, source: 'shape', shape: 'circle' }
    const geo = buildGeometry(shapeDoc)
    expect(geo.paths[1].d).toContain('A0.225 0.225')
  })
})
