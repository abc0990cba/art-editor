import { beforeEach, describe, expect, it } from 'vitest'

import { useStore } from '../../state/editor.store'
import { buildGeometry, PENDING_OBJ } from '../geometry/index.ts'
import { makeGrid } from '../grids/index.ts'
import { defaultDoc, type Doc } from './doc.ts'
import { ensureScene } from './scene.ts'

const RED = '#ff0000'

const latticeDoc = (gridType: Doc['gridType']): Doc => {
  const doc = defaultDoc()
  doc.gridType = gridType
  doc.cols = 4
  doc.rows = 4
  return doc
}

/** Paint raw buffer indices through the store's scene path; returns the palette value used. */
function strokeIdx(idxs: number[], color = RED): number {
  const s = useStore.getState()
  const v =
    s.doc.palette.findIndex((c) => c.toLowerCase() === color.toLowerCase()) + 1 ||
    s.doc.palette.length + 1
  s.paintCells(new Map(idxs.map((i) => [i, v] as const)), color)
  return v
}

describe('scene: compound-lattice composite buffers', () => {
  beforeEach(() => {
    useStore.setState({
      doc: ensureScene(latticeDoc('rhombille')),
      selection: [],
      activeLayerId: null,
    })
  })
  const state = () => useStore.getState()

  it('rhombille composite is sized by the grid count, not the square buffer', () => {
    const grid = makeGrid('rhombille', 4, 4)
    expect(grid.count).toBe(3 * 4 * 4)
    expect(state().doc.cells.length).toBe(grid.count)
  })

  it('ink two thirds of the way down survives the stroke commit', () => {
    const grid = makeGrid('rhombille', 4, 4)
    // last hex row, last face — far past the cols×rows square ceiling
    const idx = grid.count - 1
    const v = strokeIdx([idx])
    const doc = state().doc
    expect(doc.cells[idx]).toBe(v)
    expect(doc.cellObj![idx]).toBeGreaterThan(0)
  })

  it('committed bottom-row ink renders as geometry', () => {
    const grid = makeGrid('rhombille', 4, 4)
    strokeIdx([grid.count - 1, (2 * grid.cols + 1) * 3])
    const doc = state().doc
    expect(doc.cells.filter((v) => v > 0).length).toBe(2)
    expect(buildGeometry(doc).paths.length).toBeGreaterThan(0)
  })

  it('staged ink below the square ceiling previews during the stroke', () => {
    const grid = makeGrid('rhombille', 4, 4)
    const idx = grid.count - 1
    const paths = buildGeometry(state().doc, {
      cells: new Map([[idx, 1]]),
      objs: new Map([[idx, PENDING_OBJ]]),
    }).paths
    expect(paths.length).toBeGreaterThan(0)
  })

  it('octasquare gap cells survive the composite', () => {
    useStore.setState({
      doc: ensureScene(latticeDoc('octasquare')),
      selection: [],
      activeLayerId: null,
    })
    const grid = makeGrid('octasquare', 4, 4)
    expect(grid.count).toBeGreaterThan(4 * 4)
    const idx = grid.count - 1 // a gap square, past the square ceiling
    const v = strokeIdx([idx])
    const doc = state().doc
    expect(doc.cells.length).toBe(grid.count)
    expect(doc.cells[idx]).toBe(v)
  })
})
