import { describe, expect, it } from 'vitest'

import {
  mapInk,
  selectionBox,
  type InkCell,
  xformMatrices,
  xformRegion,
} from './selection-xform.ts'

const bw = 10
const bh = 10

describe('selectionBox', () => {
  const cells = new Uint16Array(100)
  const cellObj = new Uint32Array(100)
  // object 1: cells (2,3) and (4,5); object 2: cell (8,8)
  for (const [x, y, o] of [
    [2, 3, 1],
    [4, 5, 1],
    [8, 8, 2],
  ] as const) {
    cells[y * bw + x] = 1
    cellObj[y * bw + x] = o
  }

  it('bounds only the ink of the requested ids', () => {
    expect(selectionBox(cells, cellObj, [1], bw, bh)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 6 })
    expect(selectionBox(cells, cellObj, [1, 2], bw, bh)).toEqual({ x0: 2, y0: 3, x1: 9, y1: 9 })
  })

  it('returns null without ink or without a cellObj buffer', () => {
    expect(selectionBox(cells, cellObj, [7], bw, bh)).toBeNull()
    expect(selectionBox(cells, null, [1], bw, bh)).toBeNull()
  })
})

describe('mapInk', () => {
  /** One 2×2 block of object 1 at (2,2) with per-cell values 1..4. */
  const src = new Map<number, InkCell>()
  for (const [x, y, v] of [
    [2, 2, 1],
    [3, 2, 2],
    [2, 3, 3],
    [3, 3, 4],
  ] as const) {
    src.set(y * bw + x, { v, o: 1 })
  }
  const box = { x0: 2, y0: 2, x1: 4, y1: 4 }
  const at = (x: number, y: number) => out.get(y * bw + x)?.v
  let out: Map<number, InkCell>

  it('2× upscale fills every target cell (no scatter holes)', () => {
    out = mapInk(
      src,
      xformMatrices({ kind: 'scale', sx: 2, sy: 2, ax: 3, ay: 3 }, box),
      box,
      bw,
      bh,
    )
    // 2× of a 2×2 block paints a solid 4×4 region
    expect(out.size).toBe(16)
    expect(at(1, 1)).toBe(1)
    expect(at(4, 2)).toBe(2)
    expect(at(4, 4)).toBe(4)
  })

  it('a flip mirrors around the box center and keeps every cell', () => {
    out = mapInk(src, xformMatrices({ kind: 'flip', axis: 'x' }, box), box, bw, bh)
    expect(out.size).toBe(4)
    expect(at(3, 2)).toBe(1)
    expect(at(3, 3)).toBe(3)
  })

  it('a 90° rotation is exact', () => {
    out = mapInk(src, xformMatrices({ kind: 'rotate', angle: Math.PI / 2 }, box), box, bw, bh)
    expect(out.size).toBe(4)
    // y-down +90°: source (2,2)→(3,2), (3,2)→(3,3), (2,3)→(2,2), (3,3)→(2,3)
    expect(at(3, 2)).toBe(1)
    expect(at(3, 3)).toBe(2)
    expect(at(2, 2)).toBe(3)
    expect(at(2, 3)).toBe(4)
  })

  it('mapped cells keep their owning object id', () => {
    out = mapInk(
      src,
      xformMatrices({ kind: 'scale', sx: 2, sy: 2, ax: 3, ay: 3 }, box),
      box,
      bw,
      bh,
    )
    for (const cell of out.values()) expect(cell.o).toBe(1)
  })

  it('the region clips to the buffer', () => {
    const edge = { x0: 8, y0: 8, x1: 10, y1: 10 }
    const m = xformMatrices({ kind: 'scale', sx: 3, sy: 3, ax: 9, ay: 9 }, edge)
    const region = xformRegion(edge, m, bw, bh)
    expect(region.x1).toBeLessThanOrEqual(bw)
    expect(region.y1).toBeLessThanOrEqual(bh)
  })
})
