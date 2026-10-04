import { beforeEach, describe, expect, it } from 'vitest'

import { useStore } from '../../state/editor.store'
import { defaultDoc, type Doc } from './doc.ts'
import { allObjs, ensureScene, findNode, syncDoc, type SceneObj } from './scene.ts'

/**
 * Overlap semantics within a layer (ADR-0010): covering ink hides instead of destroying — every
 * object keeps its own cells, the composite (bottom → top, last writer wins) decides visibility,
 * and moving/hiding/deleting the covering figure reveals the ones beneath intact.
 */

const RED = '#ff0000'
const GREEN = '#00ff00'
const BLUE = '#0000ff'

/** Paint through the store's paintCells; returns the palette value the cells received. */
function stroke(cells: [number, number][], color = RED): number {
  const s = useStore.getState()
  const v =
    s.doc.palette.findIndex((c) => c.toLowerCase() === color.toLowerCase()) + 1 ||
    s.doc.palette.length + 1
  const bw = s.doc.cols * s.doc.sub
  const map = new Map<number, number | null>()
  for (const [x, y] of cells) map.set(y * bw + x, v)
  s.paintCells(map, color)
  return v
}

const cell = (doc: Doc, x: number, y: number) => y * doc.cols * doc.sub + x
const objs = (): SceneObj[] => allObjs(useStore.getState().doc.layers!)
/** The composite owner of one cell (the topmost visible ink there). */
const ownerAt = (doc: Doc, x: number, y: number) => doc.cellObj![cell(doc, x, y)]

describe('scene: overlap hides instead of destroying', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
  })
  const state = () => useStore.getState()

  it('painting over ink keeps the covered object; hiding the cover reveals it', () => {
    const red = stroke([[2, 2]])
    const green = stroke([[2, 2]], GREEN)
    const doc = state().doc
    expect(objs()).toHaveLength(2)
    expect(doc.cells[cell(doc, 2, 2)]).toBe(green)
    expect(objs()[0]?.cells.get(cell(doc, 2, 2))).toBe(red)
    const revealed = syncDoc({
      ...doc,
      layers: doc.layers!.map((l) => ({
        ...l,
        children: l.children.map((c, ci) => (ci === 1 ? { ...c, visible: false } : c)),
      })),
    })
    expect(revealed.cells[cell(doc, 2, 2)]).toBe(red)
  })

  it('moving the covering figure away reveals the one beneath intact', () => {
    const red = stroke([
      [0, 0],
      [1, 0],
    ])
    const green = stroke(
      [
        [1, 0],
        [2, 0],
      ],
      GREEN,
    )
    // B covers A at (1,0): overlap hid A's cell there but did not destroy it
    state().selectElements([ownerAt(state().doc, 2, 0)])
    state().moveSelection(2, 0)
    const doc = state().doc
    expect(doc.cells[cell(doc, 0, 0)]).toBe(red)
    // the former intersection shows A again
    expect(doc.cells[cell(doc, 1, 0)]).toBe(red)
    expect(doc.cells[cell(doc, 3, 0)]).toBe(green)
    expect(doc.cells[cell(doc, 4, 0)]).toBe(green)
    expect(objs()[0]?.cells.get(cell(doc, 1, 0))).toBe(red)
    expect([...(objs()[1]?.cells.keys() ?? [])]).toEqual([cell(doc, 3, 0), cell(doc, 4, 0)])
  })

  it('moving a figure over another one never bites the covered figure', () => {
    stroke([
      [0, 0],
      [1, 0],
    ])
    const green = stroke(
      [
        [1, 0],
        [2, 0],
      ],
      GREEN,
    )
    const blue = stroke(
      [
        [3, 0],
        [4, 0],
      ],
      BLUE,
    )
    const bId = ownerAt(state().doc, 2, 0)
    state().selectElements([bId])
    // B (below C in tree order) lands exactly on C's cells: C keeps its ink, the composite
    // just keeps showing C on top
    state().moveSelection(2, 0)
    const doc = state().doc
    expect(doc.cells[cell(doc, 3, 0)]).toBe(blue)
    const b = objs().find((o) => o.id === bId)!
    expect(b.cells.get(cell(doc, 3, 0))).toBe(green)
    expect(objs()[2]?.cells.get(cell(doc, 3, 0))).toBe(blue)
    expect(objs()[2]?.cells.get(cell(doc, 4, 0))).toBe(blue)
    // moving B away reveals C intact
    state().selectElements([bId])
    state().moveSelection(3, 0)
    const after = state().doc
    expect(after.cells[cell(after, 3, 0)]).toBe(blue)
    expect(after.cells[cell(after, 4, 0)]).toBe(blue)
    expect(after.cells[cell(after, 6, 0)]).toBe(green)
  })

  it('deleting the covering figure reveals the one beneath', () => {
    const red = stroke([[2, 2]])
    stroke([[2, 2]], GREEN)
    state().selectElements([ownerAt(state().doc, 2, 2)])
    state().deleteSelection()
    const doc = state().doc
    expect(doc.cells[cell(doc, 2, 2)]).toBe(red)
    expect(objs()).toHaveLength(1)
    expect(findNode(doc.layers!, objs()[0]!.id)).not.toBeNull()
  })
})
