import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from './doc.ts'
import { buildGeometry } from './geometry.ts'

/** A 32×32 pixels-mode doc with a run of `len` same-value cells at the top-left. */
function runDoc(len: number, patch?: (doc: Doc) => void): Doc {
  const doc = defaultDoc()
  doc.cols = 32
  doc.rows = 32
  doc.cells = new Uint16Array(32 * 32)
  doc.cellObj = null
  doc.elements = []
  doc.styleScope = 'global'
  for (let x = 0; x < len; x++) doc.cells[x] = 1
  patch?.(doc)
  return doc
}

/** Number of subpaths (fragments) across every path of the geometry. */
function fragmentCount(d: string): number {
  let n = 0
  for (const ch of d) if (ch === 'M') n++
  return n
}

describe('shapeGeometry run merging (zero-radius pixel ink)', () => {
  it('collapses a same-value run into one rect fragment with exact geometry', () => {
    const geo = buildGeometry(runDoc(3))
    expect(geo.paths.length).toBe(1)
    expect(geo.paths[0].d).toBe('M0 0L3 0L3 1L0 1L0 0Z')
  })

  it('keeps per-cell fragments when rounding is on', () => {
    const geo = buildGeometry(
      runDoc(3, (doc) => {
        doc.style.radius = 0.3
      }),
    )
    expect(fragmentCount(geo.paths[0].d)).toBe(3)
  })

  it('keeps per-cell fragments when sizeX/sizeY scale cells', () => {
    const geo = buildGeometry(
      runDoc(3, (doc) => {
        doc.style.sizeX = 1.4
      }),
    )
    expect(fragmentCount(geo.paths[0].d)).toBe(3)
  })

  it('merges across sub detail in buffer units', () => {
    const doc = runDoc(6)
    doc.sub = 2
    doc.cells = new Uint16Array(64 * 64)
    for (let x = 0; x < 12; x++) doc.cells[x] = 1
    const geo = buildGeometry(doc)
    // 12 buffer cells at sub 2 (cw = ch = 0.5): one run, 6 doc units wide, half a pixel tall
    expect(geo.paths[0].d).toBe('M0 0L6 0L6 0.5L0 0.5L0 0Z')
  })

  it('keeps separate colors as separate merged runs', () => {
    const doc = runDoc(4)
    doc.cells[3] = 2
    const geo = buildGeometry(doc)
    expect(geo.paths.length).toBe(2)
    expect(geo.paths[0].d).toBe('M0 0L3 0L3 1L0 1L0 0Z')
    expect(geo.paths[1].d).toBe('M3 0L4 0L4 1L3 1L3 0Z')
  })
})
