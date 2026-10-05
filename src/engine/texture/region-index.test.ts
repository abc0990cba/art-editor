import { describe, expect, it } from 'vitest'

import { hashCells } from './region-index.ts'
import type { TextureCell } from './region.ts'

/** One 1×1 tile cell with an inset 0.8×0.8 fill rect, overridden by `over`. */
const cell = (over: Partial<TextureCell> = {}): TextureCell => ({
  x: 0.1,
  y: 0.1,
  w: 0.8,
  h: 0.8,
  radii: [0, 0, 0, 0],
  chamfer: false,
  cx0: 0,
  cy0: 0,
  cx1: 1,
  cy1: 1,
  connectedL: false,
  connectedT: false,
  connectedR: false,
  connectedB: false,
  ...over,
})

describe('hashCells (fragment cache digest)', () => {
  it('identical cell lists share a digest', () => {
    const a = [cell(), cell({ cy0: 1, cy1: 2, y: 1.1 })]
    const b = [cell(), cell({ cy0: 1, cy1: 2, y: 1.1 })]
    expect(hashCells(a, 1)).toBe(hashCells(b, 1))
  })

  it('fill rect height changes the digest (sizeY scales h independently of w/sub)', () => {
    // regression: h was never mixed in, so a sizeY change reused stale fragments
    const a = [cell()]
    const b = [cell({ h: 0.5, y: 0.25 })]
    expect(hashCells(a, 1)).not.toBe(hashCells(b, 1))
  })

  it('every other scan-read field changes the digest', () => {
    const base = hashCells([cell()], 1)
    expect(hashCells([cell({ w: 0.6, x: 0.2 })], 1)).not.toBe(base)
    expect(hashCells([cell({ cx0: 2, cx1: 3, x: 2.1 })], 1)).not.toBe(base)
    expect(hashCells([cell({ radii: [0.4, 0, 0, 0] })], 1)).not.toBe(base)
    expect(hashCells([cell({ chamfer: true })], 1)).not.toBe(base)
    expect(hashCells([cell({ connectedR: true })], 1)).not.toBe(base)
    expect(hashCells([cell()], 2)).not.toBe(base)
    expect(hashCells([cell(), cell({ cx0: 3, cx1: 4, x: 3.1 })], 1)).not.toBe(base)
  })
})
