import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from '../core/doc.ts'
import { DEFAULT_FIELD, type FieldSettings } from '../core/field.ts'
import { gridBuildGeometry } from '../grids/geometry.ts'
import { buildGeometry, stagingPreview, type Staging } from './index.ts'

function fieldDoc(patch: (doc: Doc) => void): Doc {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(8 * 8)
  doc.cellObj = null
  doc.elements = []
  doc.styleScope = 'global'
  doc.palette = ['#888888']
  for (let x = 1; x < 7; x++) doc.cells[x] = 1
  patch?.(doc)
  return doc
}

const field = (patch: Partial<FieldSettings>): Partial<Doc['style']> => ({
  field: { ...DEFAULT_FIELD, ...patch },
})

describe('field geometry (square grid)', () => {
  it('keeps the run-merge fast path when every kind is none', () => {
    const geo = buildGeometry(fieldDoc(() => {}))
    expect(geo.paths.length).toBe(1)
    expect(geo.paths[0].d).toBe('M1 0L7 0L7 1L1 1L1 0Z')
  })

  it('a size field leaves the run-merge path and varies per-cell sizes', () => {
    const geo = buildGeometry(
      fieldDoc((doc) => Object.assign(doc.style, field({ size: 'funnel' }))),
    )
    expect(geo.paths.length).toBe(1)
    // six per-cell fragments instead of one merged run
    let n = 0
    for (const ch of geo.paths[0].d) if (ch === 'M') n++
    expect(n).toBe(6)
  })

  it('a rotation field breaks the plain-rect path for squares', () => {
    const plain = buildGeometry(
      fieldDoc((doc) => Object.assign(doc.style, field({ size: 'funnel' }))),
    )
    const swirl = buildGeometry(
      fieldDoc((doc) => Object.assign(doc.style, field({ align: 'swirl' }))),
    )
    expect(swirl.paths[0].d).not.toBe(plain.paths[0].d)
    // a rotated square fragment carries diagonal edges, not the axis-aligned run path
    expect(swirl.paths[0].d).not.toContain('L7 0L7 1L1 1')
  })

  it('offset fields displace the figures', () => {
    const geo = buildGeometry(
      fieldDoc((doc) =>
        Object.assign(doc.style, field({ size: 'funnel', offset: 'magnet', amount: 1 })),
      ),
    )
    expect(geo.paths[0].d).not.toBe(
      buildGeometry(fieldDoc((doc) => Object.assign(doc.style, field({ size: 'funnel' })))).paths[0]
        .d,
    )
  })

  it('fields compose with the inner-figure inlay', () => {
    const doc = fieldDoc((d) => {
      Object.assign(d.style, field({ size: 'funnel', amount: 1, min: 0.1 }))
      d.style.inlay = {
        ...d.style.inlay,
        shape: 'circle',
        colorMode: 'darken',
        depth: 0.5,
      }
    })
    const geo = buildGeometry(doc)
    expect(geo.paths.length).toBe(2)
    expect(geo.paths[1].d.length).toBeGreaterThan(0)
  })

  it('staged cells preview plain (the field lands on commit)', () => {
    const doc = fieldDoc((d) => Object.assign(d.style, field({ size: 'funnel' })))
    const staging: Staging = { cells: new Map([[1, 1]]) }
    const preview = stagingPreview(doc, staging)
    expect(preview).not.toBeNull()
    expect(preview!.paths[0].d).toBe('M1 0L2 0L2 1L1 1L1 0Z')
  })
})

describe('field geometry (non-square grid)', () => {
  it('scales native cells by the field', () => {
    const withField = fieldDoc((d) => {
      d.gridType = 'hex'
      Object.assign(d.style, field({ size: 'rings', period: 6 }))
    })
    const plain = fieldDoc((d) => {
      d.gridType = 'hex'
    })
    expect(gridBuildGeometry(withField, withField.cells, []).length).toBe(1)
    expect(gridBuildGeometry(withField, withField.cells, [])[0].d).not.toBe(
      gridBuildGeometry(plain, plain.cells, [])[0].d,
    )
  })
})
