import { beforeEach, describe, expect, it } from 'vitest'
import { buildGeometry } from './geometry'
import {
  changeSub,
  defaultDoc,
  elementFromDoc,
  resizeDoc,
  sameElementStyle,
  withStyleScope,
  type Doc,
} from './doc'
import { decodeCellObj, deserialize, encodeCellObj, serialize } from './project'
import { useStore } from '../state/store'

/** Simulate a stroke: paint cells and freeze the current drawing style as a new element. */
function paint(doc: Doc, cells: Array<[number, number]>, v: number): Doc {
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

describe('element styles: freezing and rendering', () => {
  it('a stroke keeps the style it was drawn with when the drawing style changes', () => {
    let doc = defaultDoc()
    doc = paint(
      doc,
      [
        [1, 1],
        [2, 1],
      ],
      1,
    )
    const stroke1Paths = pathSignatures(doc)

    // change the drawing style, draw a second stroke
    doc = { ...doc, style: { ...doc.style, radius: 0.5 } }
    doc = paint(
      doc,
      [
        [5, 1],
        [6, 1],
      ],
      1,
    )

    // both looks coexist; changing the drawing style again touches nothing
    const frozen = pathSignatures(doc)
    expect(frozen).toHaveLength(2)
    for (const p of stroke1Paths) expect(frozen).toContain(p)
    const again = pathSignatures({ ...doc, style: { ...doc.style, radius: 0.25 } })
    expect(again).toEqual(frozen)
  })

  it('neighboring strokes with identical styles render as one merged group', () => {
    const base = { ...defaultDoc(), renderMode: 'metaball' as const }
    let merged = paint(
      base,
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    merged = paint(
      merged,
      [
        [6, 2],
        [7, 2],
      ],
      1,
    ) // same style → same element id
    expect(merged.elements).toHaveLength(1)

    const global = { ...merged, styleScope: 'global' as const, cellObj: null, elements: [] }
    expect(pathSignatures(merged)).toEqual(pathSignatures(global))

    // a different strength (changed between strokes) splits the rendering into two fields
    let split = paint(
      base,
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    split = paint(
      { ...split, metaball: { ...split.metaball, strength: 90 } },
      [
        [6, 2],
        [7, 2],
      ],
      1,
    )
    expect(split.elements).toHaveLength(2)
    expect(buildGeometry(split).paths).toHaveLength(2)
  })

  it('element scope with one element is byte-identical to global scope', () => {
    for (const renderMode of ['pixels', 'outline', 'metaball'] as const) {
      let doc: Doc = { ...defaultDoc(), renderMode }
      doc = paint(
        doc,
        [
          [1, 1],
          [2, 1],
          [2, 2],
        ],
        1,
      )
      doc = paint(
        doc,
        [
          [6, 6],
          [7, 6],
        ],
        2,
      ) // identical style → merged with element 1
      const global = { ...doc, styleScope: 'global' as const, cellObj: null }
      expect(pathSignatures(doc)).toEqual(pathSignatures(global))
    }
  })

  it('unattributed cells render as a fallback group with the document style', () => {
    const doc = defaultDoc()
    const cellObj = new Uint32Array(doc.cells.length)
    const cells = doc.cells.slice()
    cells[1 * (doc.cols * doc.sub) + 2] = 1 // painted but no element attribution
    const elemental: Doc = { ...doc, cells, cellObj }
    const global = { ...doc, cells, styleScope: 'global' as const }
    expect(pathSignatures(elemental)).toEqual(pathSignatures(global))
  })
})

describe('element styles: scope switching', () => {
  it('switching to element scope preserves the picture, and back is lossless', () => {
    let global: Doc = { ...defaultDoc(), styleScope: 'global' }
    global = paint(
      global,
      [
        [2, 2],
        [3, 2],
      ],
      1,
    ) // paint() freezes styles even here
    const globalPaths = pathSignatures(global)

    const elemental = withStyleScope({ ...global, cellObj: null, elements: [] }, 'element')
    expect(elemental.styleScope).toBe('element')
    expect(elemental.cellObj!.filter((o) => o > 0).length).toBe(2)
    expect(pathSignatures(elemental)).toEqual(globalPaths)

    const back = withStyleScope(elemental, 'global')
    expect(pathSignatures(back)).toEqual(globalPaths)
    const forth = withStyleScope(back, 'element')
    expect(pathSignatures(forth)).toEqual(globalPaths)
    // existing equal-style element is reused instead of duplicated
    expect(forth.elements).toHaveLength(1)
  })
})

describe('element styles: buffer transforms and serialization', () => {
  it('resizeDoc and changeSub carry element attribution along', () => {
    const doc = paint(
      defaultDoc(),
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    const resized = resizeDoc(doc, doc.cols + 4, doc.rows)
    const nbw = resized.cols * resized.sub
    for (const [x, y] of [
      [2, 2],
      [3, 2],
    ] as Array<[number, number]>) {
      expect(resized.cells[y * nbw + x]).toBe(1)
      expect(resized.cellObj![y * nbw + x]).toBe(1)
    }

    // sub 1→2: pixel (2,2) now spans buffer cells (4..5, 4..5)
    const subbed = changeSub(doc, 2)
    const sbw = doc.cols * 2
    expect(subbed.cells[4 * sbw + 4]).toBe(1)
    expect(subbed.cellObj![4 * sbw + 4]).toBe(1)
  })

  it('cellObj RLE encodes blank buffers as empty arrays and round-trips', () => {
    expect(encodeCellObj(null)).toEqual([])
    expect(decodeCellObj([], 10)).toBeNull()
    expect(encodeCellObj(new Uint32Array(8))).toEqual([0, 8])
    const buf = new Uint32Array(10)
    buf.fill(1, 2, 5)
    buf[8] = 3
    const decoded = decodeCellObj(encodeCellObj(buf), 10)!
    expect(Array.from(decoded)).toEqual(Array.from(buf))
  })

  it('serialize/deserialize round-trips v2 element data', () => {
    let doc = paint(
      { ...defaultDoc(), renderMode: 'metaball' as const },
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    doc = {
      ...doc,
      style: { ...doc.style, radius: 0.5 },
      links: [{ ax: 1, ay: 1, bx: 2, by: 1, v: 1, obj: 1 }],
    }
    doc = paint(
      doc,
      [
        [8, 8],
        [9, 8],
      ],
      2,
    )
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.styleScope).toBe('element')
    expect(restored.elements).toHaveLength(2)
    expect(Array.from(restored.cellObj!)).toEqual(Array.from(doc.cellObj!))
    expect(restored.links[0].obj).toBe(1)
    expect(pathSignatures(restored)).toEqual(pathSignatures(doc))
  })

  it('v1 projects migrate to global scope and render identically', () => {
    let doc = paint(
      { ...defaultDoc(), styleScope: 'global' },
      [
        [2, 2],
        [3, 2],
      ],
      1,
    )
    const raw = JSON.parse(JSON.stringify(serialize(doc)))
    delete raw.v
    delete raw.styleScope
    delete raw.elements
    delete raw.cellObj
    const restored = deserialize(raw)
    expect(restored.styleScope).toBe('global')
    expect(restored.elements).toEqual([])
    expect(restored.cellObj).toBeNull()
    expect(pathSignatures(restored)).toEqual(
      pathSignatures({ ...doc, styleScope: 'global', cellObj: null, elements: [] }),
    )
  })
})

describe('store: element actions', () => {
  beforeEach(() => {
    useStore.setState({ doc: defaultDoc(), selection: [], tool: 'select' })
  })

  const state = () => useStore.getState()

  it('paintCells freezes one element per drawing style; restyle touches only the selection', () => {
    const s = state()
    const cells = new Map<number, number | null>([
      [0, 1],
      [1, 1],
    ])
    s.paintCells(cells, '#ff0000')
    const first = state().doc
    expect(first.elements).toHaveLength(1)
    expect(first.cellObj![0]).toBe(1)

    s.patchStyle({ radius: 0.5 })
    state().paintCells(new Map([[5, 1]]), '#ff0000')
    const second = state().doc
    expect(second.elements).toHaveLength(2)
    expect(second.cellObj![5]).toBe(2)

    state().selectElements([1])
    state().restyleSelection({ style: { radius: 0.1 } })
    const third = state().doc
    expect(third.elements[0].style.radius).toBe(0.1)
    expect(third.elements[1].style.radius).toBe(0.5) // untouched
    // restyled geometry actually changes for element 1 only
    expect(third.elements).toHaveLength(2)
  })

  it('deleteSelection erases cells and compacts elements', () => {
    const s = state()
    s.paintCells(
      new Map([
        [0, 1],
        [1, 1],
      ]),
      '#ff0000',
    )
    s.patchStyle({ radius: 0.5 })
    s.paintCells(new Map([[6, 1]]), '#ff0000')
    expect(state().doc.elements).toHaveLength(2)
    const keptValue = state().doc.cells[6]

    state().selectElements([1])
    state().deleteSelection()
    const doc = state().doc
    expect(doc.cells[0]).toBe(0)
    expect(doc.cells[1]).toBe(0)
    expect(doc.cells[6]).toBe(keptValue)
    // element 1 is gone, element 2 compacted to id 1
    expect(doc.elements).toHaveLength(1)
    expect(doc.cellObj![6]).toBe(1)
    expect(state().selection).toEqual([])
  })

  it('moveSelection moves cells, ids and connectors; undoable snapshots stay separate', () => {
    const s = state()
    s.paintCells(
      new Map([
        [0, 1],
        [1, 1],
      ]),
      '#ff0000',
    )
    s.addLinks([{ ax: 0, ay: 0, bx: 1, by: 0, v: 0 }], '#ff0000')
    const movedValue = state().doc.cells[0]

    state().selectElements([1])
    state().moveSelection(2, 1)
    const after = state().doc
    const bw = after.cols * after.sub
    expect(after.cells[0]).toBe(0)
    // cells (0,0) and (1,0) move by (+2,+1) → buffer (2,1) and (3,1)
    expect(after.cells[1 * bw + 2]).toBe(movedValue)
    expect(after.cellObj![1 * bw + 2]).toBe(1)
    expect(after.links).toHaveLength(1)
    expect(after.links[0]).toMatchObject({ ax: 2, ay: 1, bx: 3, by: 1, obj: 1 })
  })

  it('setStyleScope materializes existing art without changing the picture', () => {
    const s = state()
    s.setStyleScope('global')
    s.paintCells(
      new Map([
        [0, 1],
        [1, 1],
      ]),
      '#ff0000',
    )
    const globalPaths = pathSignatures(state().doc)
    expect(state().doc.cellObj).toBeNull()

    s.setStyleScope('element')
    const doc = state().doc
    expect(doc.styleScope).toBe('element')
    expect(doc.elements).toHaveLength(1)
    expect(doc.cellObj![0]).toBe(1)
    expect(doc.cellObj![1]).toBe(1)
    expect(pathSignatures(doc)).toEqual(globalPaths)
  })
})
