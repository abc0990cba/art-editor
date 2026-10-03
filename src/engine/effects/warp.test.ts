import { describe, expect, it } from 'vitest'

import { undo, useStore } from '../../state/editor.store.ts'
import { bufferWidth, defaultDoc, elementFromDoc } from '../core/doc.ts'
import { ensureScene } from '../core/scene.ts'
import { evalGraph, type EvalInput, type GraphNode } from '../nodes/index.ts'
import {
  DEFAULT_WARP_PARAMS,
  inkBox,
  isReversibleWarp,
  warpField,
  warpInk,
  WARP_KINDS,
} from './warp.ts'
import type { WarpParams } from './warp.ts'

const bw = 16
const bh = 16
const box = { x0: 2, y0: 2, x1: 14, y1: 14 }

const wp = (over: Partial<WarpParams> = {}): WarpParams => ({ ...DEFAULT_WARP_PARAMS, ...over })

/** Ring of ink filling the box border, one palette value. */
function ringInk(): Map<number, number> {
  const src = new Map<number, number>()
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (x === box.x0 || x === box.x1 - 1 || y === box.y0 || y === box.y1 - 1)
        src.set(y * bw + x, 3)
    }
  }
  return src
}

/** Solid block of ink. */
function blockInk(): Map<number, number> {
  const src = new Map<number, number>()
  for (let y = 5; y < 11; y++) {
    for (let x = 5; x < 11; x++) src.set(y * bw + x, 3)
  }
  return src
}

describe('warp fields', () => {
  it('amount 0 is identity for the reversible kinds', () => {
    const src = ringInk()
    for (const kind of WARP_KINDS) {
      if (!isReversibleWarp(kind)) continue
      expect(warpInk(src, kind, wp({ amount: 0 }), { box, bw, bh })).toEqual(src)
    }
  })

  it('every kind keeps values and stays inside the buffer', () => {
    const src = ringInk()
    for (const kind of WARP_KINDS) {
      const out = warpInk(src, kind, wp(), { box, bw, bh })
      expect(out.size, kind).toBeGreaterThan(0)
      for (const [i, v] of out) {
        expect(v, kind).toBe(3)
        expect(i, kind).toBeGreaterThanOrEqual(0)
        expect(i, kind).toBeLessThan(bw * bh)
      }
    }
  })

  it('positive bulge moves content outward from the center', () => {
    const src = new Map<number, number>([[8 * bw + 12, 3]])
    const out = warpInk(src, 'bulge', wp({ amount: 60 }), { box, bw, bh })
    expect(out.size).toBeGreaterThanOrEqual(1)
    for (const [i] of out) {
      const x = i % bw
      const y = Math.floor(i / bw)
      expect(Math.hypot(x + 0.5 - 8, y + 0.5 - 8)).toBeGreaterThan(4.5)
    }
  })

  it('polar and unpolar fields are inverse walks of each other', () => {
    const toRect = warpField('polar', box, wp())
    const toPolar = warpField('unpolar', box, wp())
    for (const [tx, ty] of [
      [5.5, 5.5],
      [8.5, 11.5],
      [12.5, 4.5],
    ]) {
      const [mx, my] = toRect(...toPolar(tx, ty))
      expect(Math.abs(mx - tx)).toBeLessThan(1e-9)
      expect(Math.abs(my - ty)).toBeLessThan(1e-9)
    }
  })

  it('polar wraps a thick stripe into a ring around the center', () => {
    const stripe = new Map<number, number>()
    for (let y = 6; y <= 8; y++) {
      for (let x = box.x0; x < box.x1; x++) stripe.set(y * bw + x, 3)
    }
    const out = warpInk(stripe, 'polar', wp(), { box, bw, bh })
    expect(out.size).toBeGreaterThan(4)
    let quadrants = 0
    for (const qx of [false, true]) {
      for (const qy of [false, true]) {
        for (const i of out.keys()) {
          const x = i % bw
          const y = Math.floor(i / bw)
          if (x + 0.5 > 8 === qx && y + 0.5 > 8 === qy) {
            quadrants++
            break
          }
        }
      }
    }
    expect(quadrants).toBe(4)
  })

  it('roughen keeps the block interior and is seed-deterministic', () => {
    const src = blockInk()
    const a = warpInk(src, 'roughen', wp({ amount: 80, seed: 7 }), { box, bw, bh })
    const b = warpInk(src, 'roughen', wp({ amount: 80, seed: 7 }), { box, bw, bh })
    const c = warpInk(src, 'roughen', wp({ amount: 80, seed: 8 }), { box, bw, bh })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    // interior cells never move: the body holds while the rim roughens
    for (let y = 7; y < 9; y++) {
      for (let x = 7; x < 9; x++) expect(a.get(y * bw + x)).toBe(3)
    }
  })

  it('inkBox bounds the map', () => {
    expect(inkBox(new Map(), bw)).toBeNull()
    expect(inkBox(blockInk(), bw)).toEqual({ x0: 5, y0: 5, x1: 11, y1: 11 })
  })

  it('polar and roughen are not reversible fields', () => {
    expect(isReversibleWarp('polar')).toBe(false)
    expect(isReversibleWarp('roughen')).toBe(false)
    expect(isReversibleWarp('bulge')).toBe(true)
  })
})

const evalCtx: EvalInput = {
  bw,
  bh,
  paletteLen: 12,
  hexValue: () => 1,
  luma: () => 1,
  baseStyle: elementFromDoc(defaultDoc()),
}

describe('mod.warp node', () => {
  it('bulges a rect through the graph evaluator', () => {
    const graph = {
      graphVersion: 1 as const,
      nodes: [
        { id: 'r', op: 'source.rect', params: { x: 4, y: 4, w: 8, h: 8 } },
        { id: 'w', op: 'mod.warp', params: { kind: 'bulge', amount: 60 } },
      ] as GraphNode[],
    }
    const cells = evalGraph(graph, evalCtx).cells
    expect(cells.size).toBeGreaterThan(0)
    for (const i of cells.keys()) expect(i).toBeGreaterThanOrEqual(0)
    // empty input stays empty (registry conformance path)
    const empty = evalGraph(
      {
        graphVersion: 1 as const,
        nodes: [{ id: 'w', op: 'mod.warp', params: {} }] as GraphNode[],
      },
      evalCtx,
    ).cells
    expect(empty.size).toBe(0)
  })
})

describe('warpSelection (store integration)', () => {
  it('warps the selected ink and undoes as one step', async () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    const st = useStore.getState()
    const bwd = bufferWidth(st.doc)
    const ink = new Map<number, number>()
    for (let x = 4; x < 12; x++) ink.set(7 * bwd + x, 1)
    st.paintCells(ink, '#ff0000')
    const fresh = useStore.getState()
    useStore.getState().selectElements([fresh.doc.cellObj![7 * bwd + 4]])
    const before = useStore.getState().doc.cells.slice()
    useStore
      .getState()
      .warpSelection('twirl', { amount: 90, radiusPct: 100, wavelength: 12, seed: 7 })
    const after = useStore.getState().doc.cells
    expect([...after]).not.toEqual([...before])
    // the twirl's displacement margin keeps the stripe inside the buffer: no clipped cells
    expect([...after].filter((v) => v > 0).length).toBe([...before].filter((v) => v > 0).length)
    // zundo records doc history on a 350ms trailing throttle — let it flush, then undo
    await new Promise<void>((r) => {
      setTimeout(r, 400)
    })
    undo()
    expect([...useStore.getState().doc.cells]).toEqual([...before])
  })
})
