import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { buildGeometry } from '../geometry/index.ts'
import { makeGrid } from './index.ts'

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
