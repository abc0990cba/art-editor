import { describe, expect, it } from 'vitest'

import { undo, useStore } from '../../state/editor.store.ts'
import { bufferWidth, defaultDoc } from '../core/doc.ts'
import { ensureScene } from '../core/scene.ts'
import { DEFAULT_FILTER_PARAMS, FILTER_PATTERNS, FILTER_POPOVER_OPS, filterInk } from './filters.ts'
import { blobifyInk } from './gooey.ts'
import type { CellBox, InkCell } from './selection-xform.ts'

function ink(rows: string[]): Map<number, InkCell> {
  const m = new Map<number, InkCell>()
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') m.set(y * row.length + x, { v: 1, o: 1 })
    }
  })
  return m
}

const SRC = ink(['.X.', 'X.X', '.X.'])
const SPACE = { box: { x0: 0, y0: 0, x1: 3, y1: 3 } as CellBox, bw: 3, bh: 3 }

describe('filterInk', () => {
  it('routes blobify to the gooey module', () => {
    expect(filterInk('blobify', SRC, { ...DEFAULT_FILTER_PARAMS, radius: 1 }, SPACE)).toEqual(
      blobifyInk(SRC, { radius: 1, iso: DEFAULT_FILTER_PARAMS.iso, falloff: 'smooth' }, 3, 3),
    )
  })

  it('smoothen merges fills over the source', () => {
    const out = filterInk('smoothen', SRC, { ...DEFAULT_FILTER_PARAMS, passes: 1 }, SPACE)
    expect(out.size).toBeGreaterThanOrEqual(SRC.size)
    for (const [i, cell] of SRC) expect(out.get(i)).toEqual(cell)
  })

  it('figurefy grows the ink by the block scale', () => {
    // plus centered at (3, 3) on an 8×8 canvas — room for five unclipped 2×2 blocks
    const plus = new Map<number, InkCell>()
    for (const [x, y] of [
      [3, 2],
      [2, 3],
      [3, 3],
      [4, 3],
      [3, 4],
    ] as const) {
      plus.set(y * 8 + x, { v: 1, o: 1 })
    }
    const out = filterInk(
      'figurefy',
      plus,
      { ...DEFAULT_FILTER_PARAMS, scale: 2, figure: 'circle', mode: 'figure' },
      { box: { x0: 2, y0: 2, x1: 5, y1: 5 }, bw: 8, bh: 8 },
    )
    expect(out.size).toBe(20)
  })

  it('patternize keeps a subset of the source', () => {
    const out = filterInk(
      'patternize',
      SRC,
      { ...DEFAULT_FILTER_PARAMS, pattern: 'checker', density: 0.5, scale: 1 },
      SPACE,
    )
    expect(out.size).toBeLessThan(SRC.size)
  })

  it('drip and dissolve run from the defaults without touching the palette', () => {
    const drip = filterInk('drip', SRC, DEFAULT_FILTER_PARAMS, SPACE)
    expect(drip.size).toBeGreaterThanOrEqual(SRC.size)
    const dissolve = filterInk('dissolve', SRC, DEFAULT_FILTER_PARAMS, SPACE)
    for (const [, cell] of dissolve) expect(cell.v).toBe(1)
  })

  it('exposes the UI chip lists', () => {
    expect(FILTER_POPOVER_OPS).toEqual(['blobify', 'figurefy', 'patternize'])
    expect(FILTER_PATTERNS.length).toBe(10)
  })
})

describe('filterSelection (store integration)', () => {
  it('applies a generative filter to the selection and undoes as one step', async () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    const st = useStore.getState()
    const bwd = bufferWidth(st.doc)
    const paint = new Map<number, number>()
    // an L of three cells: the missing concave corner is what smoothen fills
    for (const [x, y] of [
      [4, 7],
      [5, 7],
      [4, 8],
    ] as const) {
      paint.set(y * bwd + x, 1)
    }
    st.paintCells(paint, '#ff0000')
    const fresh = useStore.getState()
    useStore.getState().selectElements([fresh.doc.cellObj![7 * bwd + 4]])
    const before = useStore.getState().doc.cells.slice()
    useStore.getState().filterSelection('smoothen', { passes: 1 })
    const after = useStore.getState().doc.cells
    // exactly one cell appeared — the concave corner — in the ink's own palette value
    expect(after.filter((v) => v > 0).length).toBe(before.filter((v) => v > 0).length + 1)
    expect(after[8 * bwd + 5]).toBe(before[7 * bwd + 4])
    // zundo records doc history on a 350ms trailing throttle — let it flush, then undo
    await new Promise<void>((r) => {
      setTimeout(r, 400)
    })
    undo()
    expect([...useStore.getState().doc.cells]).toEqual([...before])
  })
})
