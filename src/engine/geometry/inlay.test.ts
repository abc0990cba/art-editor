import { describe, expect, it } from 'vitest'

import { shadeHex } from '../color/shade.ts'
import { defaultDoc, type Doc } from '../core/doc.ts'
import { DEFAULT_INLAY } from '../core/inlay.ts'
import { gridBuildGeometry } from '../grids/geometry.ts'
import { buildGeometry, stagingPreview, type Staging } from './index.ts'

function inlayDoc(patch?: (doc: Doc) => void): Doc {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(8 * 8)
  doc.cellObj = null
  doc.elements = []
  doc.styleScope = 'global'
  doc.palette = ['#888888', '#222222']
  doc.cells[0] = 1
  patch?.(doc)
  return doc
}

const onInlay = {
  ...DEFAULT_INLAY,
  shape: 'circle',
  scale: 0.45,
  colorMode: 'darken',
  depth: 0.5,
} as const

describe('inlay geometry (square grid)', () => {
  it('keeps the run-merge fast path when the inlay is none', () => {
    const geo = buildGeometry(inlayDoc())
    expect(geo.paths.length).toBe(1)
    expect(geo.paths[0].d).toBe('M0 0L1 0L1 1L0 1L0 0Z')
  })

  it('emits the inlay as a second path painted after the base figure', () => {
    const geo = buildGeometry(
      inlayDoc((doc) => {
        doc.style.inlay = { ...onInlay }
      }),
    )
    expect(geo.paths.length).toBe(2)
    expect(geo.paths[0].fill).toBe('#888888')
    expect(geo.paths[1].fill).toBe(shadeHex('#888888', 0.5))
    // circle of scale 0.45 inside the unit cell: radius 0.225 about the center
    expect(geo.paths[1].d).toContain('A0.225 0.225')
  })

  it('groups inlay fragments after every base color group', () => {
    const geo = buildGeometry(
      inlayDoc((doc) => {
        doc.cells[1] = 2
        doc.style.inlay = { ...onInlay }
      }),
    )
    expect(geo.paths.map((p) => p.fill)).toEqual([
      '#888888',
      '#222222',
      shadeHex('#888888', 0.5),
      shadeHex('#222222', 0.5),
    ])
  })

  it('follows tone sizing of the base figure', () => {
    const geo = buildGeometry(
      inlayDoc((doc) => {
        doc.style.toneSize = true
        doc.style.toneSizeMin = 0.15
        doc.style.inlay = { ...onInlay }
      }),
    )
    expect(geo.paths.length).toBe(2)
    // #888888 shrinks the figure to ≈0.547 of the cell; the inlay shrinks with it
    expect(geo.paths[1].d).toContain('A0.123 0.123')
  })

  it('inherits the per-cell angle spread of the base figure', () => {
    const plain = buildGeometry(
      inlayDoc((doc) => {
        doc.style.inlay = { ...onInlay, shape: 'square' }
      }),
    )
    const spread = buildGeometry(
      inlayDoc((doc) => {
        doc.style.inlay = { ...onInlay, shape: 'square' }
        doc.style.angleJitter = 90
        doc.style.jitterSeed = 7
      }),
    )
    expect(spread.paths.length).toBe(2)
    expect(spread.paths[1].d).not.toBe(plain.paths[1].d)
  })

  it('resolves fixed palette slots and tone extremes', () => {
    const geo = buildGeometry(
      inlayDoc((doc) => {
        doc.style.inlay = { ...onInlay, colorMode: 'slot', slot: 2 }
      }),
    )
    expect(geo.paths[1].fill).toBe('#222222')
    const tone = buildGeometry(
      inlayDoc((doc) => {
        doc.style.inlay = { ...onInlay, colorMode: 'toneLight' }
      }),
    )
    expect(tone.paths[1].fill).toBe('#888888')
  })

  it('shows the inlay in the staged-cell preview', () => {
    const doc = inlayDoc((d) => {
      d.style.inlay = { ...onInlay }
    })
    const staging: Staging = { cells: new Map([[0, 1]]) }
    const preview = stagingPreview(doc, staging)
    expect(preview).not.toBeNull()
    expect(preview!.paths.length).toBe(2)
    expect(preview!.paths[1].fill).toBe(shadeHex('#888888', 0.5))
  })
})

describe('inlay geometry (non-square grid)', () => {
  it('draws the inlay inside each native cell figure', () => {
    const doc = inlayDoc((d) => {
      d.gridType = 'hex'
      d.style.inlay = { ...onInlay, colorMode: 'slot', slot: 1 }
    })
    const paths = gridBuildGeometry(doc, doc.cells, [])
    expect(paths.length).toBe(2)
    expect(paths[1].fill).toBe('#888888')
    expect(paths[1].d.length).toBeGreaterThan(0)
  })
})
