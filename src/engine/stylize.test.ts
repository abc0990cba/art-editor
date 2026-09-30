import { describe, expect, it } from 'vitest'

import { useStore } from '../state/editor.store.ts'
import { bufferWidth, defaultDoc } from './doc.ts'
import { ensureScene } from './scene.ts'
import { DEFAULT_STYLIZE_PARAMS, stylizeInk } from './stylize.ts'

const bw = 16
const bh = 16

const cell = (x: number, y: number, v = 1, o = 7) => new Map([[y * bw + x, { v, o }]])

describe('stylize ops', () => {
  it('outline of empty ink is empty', () => {
    expect(stylizeInk('outline', new Map(), 2, DEFAULT_STYLIZE_PARAMS, { bw, bh }).size).toBe(0)
  })

  it('outline rings a single cell with all 8 neighbours', () => {
    const full = stylizeInk('outline', cell(5, 5, 1, 9), 2, DEFAULT_STYLIZE_PARAMS, { bw, bh })
    expect(full.size).toBe(9)
    expect(full.get(5 * bw + 5)).toEqual({ v: 1, o: 9 })
    for (let y = 4; y <= 6; y++) {
      for (let x = 4; x <= 6; x++) {
        if (x === 5 && y === 5) continue
        expect(full.get(y * bw + x)).toEqual({ v: 2, o: 9 })
      }
    }
  })

  it('outline never overwrites existing ink', () => {
    const src = cell(5, 5)
    src.set(5 * bw + 6, { v: 3, o: 7 })
    const full = stylizeInk('outline', src, 2, DEFAULT_STYLIZE_PARAMS, { bw, bh })
    expect(full.get(5 * bw + 6)).toEqual({ v: 3, o: 7 })
    for (const [i, c] of src) expect(full.get(i)).toEqual(c)
  })

  it('drop shadow offsets behind the ink without touching it', () => {
    const full = stylizeInk(
      'shadow',
      cell(5, 5, 1, 4),
      2,
      { ...DEFAULT_STYLIZE_PARAMS, dx: 2, dy: 1 },
      { bw, bh },
    )
    expect(full.size).toBe(2)
    expect(full.get(6 * bw + 7)).toEqual({ v: 2, o: 4 })
    expect(full.get(5 * bw + 5)).toEqual({ v: 1, o: 4 })
  })

  it('glow fades as a dithered halo inside the radius', () => {
    const src = cell(8, 8)
    const full = stylizeInk('glow', src, 2, { ...DEFAULT_STYLIZE_PARAMS, radius: 2 }, { bw, bh })
    const added = [...full.keys()].filter((i) => !src.has(i))
    expect(added.length).toBeGreaterThan(0)
    // dithered: strictly fewer dots than the full 5×5 square, never outside the reach
    expect(added.length).toBeLessThan(24)
    for (const i of added) {
      const x = i % bw
      const y = Math.floor(i / bw)
      expect(Math.max(Math.abs(x - 8), Math.abs(y - 8))).toBeLessThanOrEqual(2)
      expect(full.get(i)).toEqual({ v: 2, o: 7 })
    }
    // deterministic
    const again = stylizeInk('glow', src, 2, { ...DEFAULT_STYLIZE_PARAMS, radius: 2 }, { bw, bh })
    expect(again).toEqual(full)
  })
})

describe('stylizeSelection (store integration)', () => {
  it('outlines the selection in the current color as one undoable step', () => {
    useStore.setState({
      doc: ensureScene(defaultDoc()),
      selection: [],
      activeLayerId: null,
      color: '#00aa00',
    })
    const st = useStore.getState()
    const bwd = bufferWidth(st.doc)
    st.paintCells(
      new Map([
        [7 * bwd + 7, 1],
        [7 * bwd + 8, 1],
      ]),
      '#ff0000',
    )
    const fresh = useStore.getState()
    useStore.getState().selectElements([fresh.doc.cellObj![7 * bwd + 7]])
    const before = useStore.getState().doc.cells.slice()
    useStore.getState().stylizeSelection('outline')
    const doc = useStore.getState().doc
    const inkAfter = [...doc.cells].filter((v) => v > 0).length
    expect(inkAfter).toBeGreaterThan([...before].filter((v) => v > 0).length)
    // the outline carries the resolved current color
    const vi = doc.palette.indexOf('#00aa00')
    expect(vi).toBeGreaterThanOrEqual(0)
    expect(doc.cells[6 * bwd + 6]).toBe(vi + 1)
  })
})
