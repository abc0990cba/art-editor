import { describe, expect, it } from 'vitest'

import { buildGeometry } from '../geometry/index.ts'
import { defaultDoc, elementFromDoc, sameElementStyle, type Doc } from './doc.ts'

/**
 * Render-group splitting of the rarely-touched texture/metaball fields: these were once missing
 * from `elementStyleKey` / `sameElementStyle`, so a stroke drawn after changing such a setting
 * silently joined the previous stroke's render group and rendered with ITS frozen look.
 */

/** Simulate a stroke: paint cells and freeze the current drawing style as a new element. */
function paint(doc: Doc, cells: [number, number][], v: number): Doc {
  const el = elementFromDoc(doc)
  const elements = [...doc.elements]
  let id = elements.findIndex((e) => sameElementStyle(e, el)) + 1
  if (id === 0) {
    elements.push(el)
    id = elements.length
  }
  const bw = doc.cols * doc.sub
  const next = doc.cells.slice()
  const cellObj = (doc.cellObj ?? new Uint32Array(doc.cells.length)).slice()
  for (const [x, y] of cells) {
    const i = y * bw + x
    next[i] = v
    cellObj[i] = id
  }
  return { ...doc, cells: next, cellObj, elements }
}

const pathSignatures = (doc: Doc) =>
  buildGeometry(doc)
    .paths.map((p) => `${p.fill}|${p.d}`)
    .sort()

describe('element style grouping: render-relevant texture/metaball fields', () => {
  it('two strokes differing only in hatchStyle render as separate groups', () => {
    let doc: Doc = {
      ...defaultDoc(),
      texture: { ...defaultDoc().texture, effect: 'hatch' as const },
    }
    doc = { ...doc, texture: { ...doc.texture, hatchStyle: 'cross' as const } }
    doc = paint(
      doc,
      [
        [2, 2],
        [3, 2],
        [4, 2],
      ],
      1,
    )
    doc = { ...doc, texture: { ...doc.texture, hatchStyle: 'straight' as const } }
    doc = paint(
      doc,
      [
        [8, 2],
        [9, 2],
        [10, 2],
      ],
      1,
    )
    expect(doc.elements).toHaveLength(2)
    expect(pathSignatures(doc)).toHaveLength(2)
  })

  it('two strokes differing only in htLattice render as separate groups', () => {
    let doc: Doc = {
      ...defaultDoc(),
      texture: {
        ...defaultDoc().texture,
        effect: 'halftone' as const,
        htLattice: 'rings' as const,
      },
    }
    doc = paint(
      doc,
      [
        [2, 2],
        [3, 2],
        [4, 2],
      ],
      1,
    )
    doc = { ...doc, texture: { ...doc.texture, htLattice: 'hex' as const } }
    doc = paint(
      doc,
      [
        [8, 2],
        [9, 2],
        [10, 2],
      ],
      1,
    )
    expect(doc.elements).toHaveLength(2)
    expect(pathSignatures(doc)).toHaveLength(2)
  })

  it('two strokes differing only in metaball stroke width keep their own widths', () => {
    const contourSignatures = (d: Doc) =>
      buildGeometry(d)
        .paths.map((p) => `${p.stroke}|${p.strokeWidth}|${p.d}`)
        .sort()
    let doc: Doc = { ...defaultDoc(), renderMode: 'contour' as const }
    doc = { ...doc, metaball: { ...doc.metaball, strokeWidth: 0.2 } }
    doc = paint(
      doc,
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    doc = { ...doc, metaball: { ...doc.metaball, strokeWidth: 0.8 } }
    doc = paint(
      doc,
      [
        [8, 2],
        [9, 2],
      ],
      1,
    )
    expect(doc.elements).toHaveLength(2)
    expect(contourSignatures(doc)).toHaveLength(2)
  })
})
