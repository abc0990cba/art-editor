import { beforeEach, describe, expect, it } from 'vitest'

import { defaultDoc } from '../engine/core/doc.ts'
import { allObjs, ensureScene } from '../engine/core/scene.ts'
import { useStore } from './editor.store'

const state = () => useStore.getState()
const W = 32 // defaultDoc width

/** Paint a 2×2 block of one fresh object at (x,y) with per-cell values 1..4. */
function paintBlock(x: number, y: number) {
  const cells = new Map<number, number>([
    [(y + 0) * W + x + 0, 1],
    [(y + 0) * W + x + 1, 2],
    [(y + 1) * W + x + 0, 3],
    [(y + 1) * W + x + 1, 4],
  ])
  state().paintCellsValues(cells, state().doc)
}

describe('transform slice', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [] })
  })

  it('2× scale grows the object fourfold and keeps it one object', () => {
    paintBlock(3, 3)
    const objId = state().doc.cellObj?.[3 * W + 3] ?? 0
    state().selectElements([objId])
    state().transformSelection({ kind: 'scale', sx: 2, sy: 2, ax: 4, ay: 4 })
    const doc = state().doc
    const painted = [...doc.cells].filter((v) => v > 0).length
    expect(painted).toBe(16)
    const owners = new Set<number>()
    for (let i = 0; i < doc.cellObj!.length; i++) if (doc.cells[i] > 0) owners.add(doc.cellObj![i])
    expect(owners.size).toBe(1)
  })

  it('a flip mirrors the ink inside the selection box', () => {
    paintBlock(3, 3)
    const objId = state().doc.cellObj?.[3 * W + 3] ?? 0
    state().selectElements([objId])
    state().transformSelection({ kind: 'flip', axis: 'x' })
    // the box (3,3)-(5,5) mirrors onto itself: values swap left/right
    expect(state().doc.cells[3 * W + 3]).toBe(2)
    expect(state().doc.cells[3 * W + 4]).toBe(1)
    expect(state().doc.cells[4 * W + 3]).toBe(4)
  })

  it('a 90° rotation is exact on square ink', () => {
    paintBlock(3, 3)
    const objId = state().doc.cellObj?.[3 * W + 3] ?? 0
    state().selectElements([objId])
    state().transformSelection({ kind: 'rotate', angle: Math.PI / 2 })
    // source (3,3) lands at (4,3), source (4,3) at (4,4), source (3,4) at (3,3)
    expect(state().doc.cells[3 * W + 4]).toBe(1)
    expect(state().doc.cells[3 * W + 3]).toBe(3)
    expect(state().doc.cells[4 * W + 3]).toBe(4)
    expect(state().doc.cells[4 * W + 4]).toBe(2)
  })

  it('no selection or non-square grids are no-ops', () => {
    expect(state().transformSelection({ kind: 'flip', axis: 'x' })).toBeUndefined()
    expect([...state().doc.cells].filter((v) => v > 0).length).toBe(0)
    useStore.setState({ doc: { ...state().doc, gridType: 'hex' } })
    state().selectElements([1])
    state().transformSelection({ kind: 'flip', axis: 'x' })
  })

  it('duplicate clones the object one cell down-right and selects the clone', () => {
    paintBlock(3, 3)
    const objId = state().doc.cellObj?.[3 * W + 3] ?? 0
    state().selectElements([objId])
    state().duplicateSelection()
    const doc = state().doc
    expect(state().selection).not.toContain(objId)
    expect(state().selection.length).toBe(1)
    expect(doc.cells[3 * W + 3]).toBe(1) // original intact
    expect(doc.cells[4 * W + 4]).toBe(1) // clone at +1,+1
    expect(allObjs(doc.layers!).length).toBe(2)
  })
})
