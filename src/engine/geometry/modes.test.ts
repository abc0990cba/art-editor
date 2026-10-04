import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { buildSvg } from '../output/svg.ts'
import { buildGeometry } from './index.ts'
import { contourGeometry, metaballGeometry } from './metaball.ts'

function singleCellDoc() {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(64)
  doc.cells[2 * 8 + 2] = 1
  return doc
}

describe('contour render mode', () => {
  it('emits the field loops as stroked, unfilled paths', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'contour'
    doc.metaball = { ...doc.metaball, strokeWidth: 0.25 }
    const { paths } = contourGeometry(doc, doc.cells, doc.links)
    expect(paths).toHaveLength(1)
    expect(paths[0].stroke).toBe(defaultDoc().palette[0])
    expect(paths[0].strokeWidth).toBe(0.25)
    expect(paths[0].fill).toBeUndefined()
    expect(paths[0].d).toMatch(/^M/)
  })

  it('keeps the fill path filled in metaball mode', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'metaball'
    const { paths } = metaballGeometry(doc, doc.cells, doc.links)
    expect(paths[0].fill).toBe(defaultDoc().palette[0])
    expect(paths[0].stroke).toBeUndefined()
  })

  it('reaches the SVG output as stroke attributes', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'contour'
    doc.metaball = { ...doc.metaball, strokeWidth: 0.3 }
    const svg = buildSvg(doc, { includeBg: false })
    expect(svg).toContain('stroke="#')
    expect(svg).toContain('stroke-width="0.3"')
  })

  it('dispatches through buildGeometry like the other modes', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'contour'
    expect(buildGeometry(doc).paths[0].stroke).toBeTruthy()
  })
})

describe('extrude render mode', () => {
  it('draws a depth-2 body along the diagonal before the fill', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'extrude'
    doc.extrude = { depth: 2, dx: 1, dy: 1, color: 2 }
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(2)
    const [body, fill] = geo.paths
    expect(body.fill).toBe(defaultDoc().palette[1])
    expect(body.d).toContain('M3 3') // first body cell
    expect(body.d).toContain('M4 4') // second body cell (diagonal, so no run merging)
    expect(fill.d.length).toBeGreaterThan(0)
  })

  it('stops the body ray at painted cells', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'extrude'
    doc.extrude = { depth: 4, dx: 1, dy: 0, color: 2 }
    // a full painted row: every ray is immediately blocked, so no body at all
    for (let x = 0; x < 8; x++) doc.cells[2 * 8 + x] = x === 2 ? 1 : 2
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(2) // per-color fills only, no body path
    expect(geo.paths.map((p) => p.fill)).toEqual([defaultDoc().palette[1], defaultDoc().palette[0]])
  })

  it('auto color picks the darkest palette entry', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'extrude'
    doc.extrude = { depth: 1, dx: 1, dy: 1, color: 0 }
    const geo = buildGeometry(doc)
    // CLASSIC_12 starts with the dark navy — the darkest of the default palette
    expect(geo.paths[0].fill).toBe(defaultDoc().palette[0])
  })

  it('degenerate (0,0) direction produces no body', () => {
    const doc = singleCellDoc()
    doc.renderMode = 'extrude'
    doc.extrude = { depth: 3, dx: 0, dy: 0, color: 1 }
    const geo = buildGeometry(doc)
    expect(geo.paths).toHaveLength(1)
  })
})
