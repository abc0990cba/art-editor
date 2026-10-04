import { describe, expect, it } from 'vitest'

import {
  blockifyInk,
  despeckleInk,
  dilateInk,
  erodeInk,
  longShadowInk,
  outlineOnlyInk,
  pixelOpInk,
  pixelPerfectInk,
  scanlinesInk,
  silhouetteInk,
  type PixelOpParams,
} from './morpho.ts'
import type { InkCell } from './selection-xform.ts'

/** Build an ink map from ASCII rows ('X' = ink of value `v`, '.' = empty). */
function ink(rows: string[], v = 1): Map<number, InkCell> {
  const m = new Map<number, InkCell>()
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') m.set(y * row.length + x, { v, o: 1 })
    }
  })
  return m
}

/** Render an ink map back to ASCII rows for assertions. */
function draw(m: Map<number, InkCell>, bw: number, bh: number): string {
  return Array.from({ length: bh }, (_, y) =>
    Array.from({ length: bw }, (_, x) => (m.has(y * bw + x) ? 'X' : '.')).join(''),
  ).join('\n')
}

const P: PixelOpParams = { size: 2, steps: 1, dx: 1, dy: 1 }

describe('blockify', () => {
  it('fills each painted 2×2 block with its majority value', () => {
    const src = ink(['XX..', 'X...', '..XX', '...X'])
    const out = blockifyInk(src, 2, 4, 4)
    expect(draw(out, 4, 4)).toBe('XX..\nXX..\n..XX\n..XX')
  })

  it('keeps unpainted blocks empty (blocks snap to the aligned grid)', () => {
    const src = ink(['..X.', '..X.', '....', '....'])
    const out = blockifyInk(src, 2, 4, 4)
    expect(draw(out, 4, 4)).toBe('..XX\n..XX\n....\n....')
  })

  it('breaks value ties toward the smaller palette value', () => {
    const src = new Map<number, InkCell>([
      [0, { v: 3, o: 1 }],
      [1, { v: 2, o: 1 }],
    ])
    const out = blockifyInk(src, 2, 4, 4)
    expect(out.get(0)!.v).toBe(2)
    expect(out.get(5)!.v).toBe(2)
  })
})

describe('dilate / erode', () => {
  it('dilate grows one cell in all 8 directions', () => {
    const out = dilateInk(ink(['....', '.X..', '....', '....']), 1, 4, 4)
    expect(draw(out, 4, 4)).toBe('XXX.\nXXX.\nXXX.\n....')
  })

  it('erode strips one border layer, leaving the core', () => {
    const out = erodeInk(ink(['XXX', 'XXX', 'XXX']), 1, 3, 3)
    expect(draw(out, 3, 3)).toBe('...\n.X.\n...')
  })

  it('erode can wipe small ink entirely', () => {
    expect(erodeInk(ink(['X.']), 1, 2, 1).size).toBe(0)
  })

  it('dilate passes accumulate', () => {
    const out = dilateInk(ink(['..', 'X.']), 2, 2, 2)
    expect(out.size).toBe(4)
  })
})

describe('pixel perfect', () => {
  it('removes the corner pixel of a stair and keeps the diagonal', () => {
    const out = pixelPerfectInk(ink(['XX', '.X']), 2, 2)
    expect(draw(out, 2, 2)).toBe('X.\n.X')
  })

  it('never touches solid rectangles', () => {
    const src = ink(['XXX', 'XXX', 'XXX'])
    expect(pixelPerfectInk(src, 3, 3).size).toBe(9)
  })
})

describe('despeckle', () => {
  it('removes small components and keeps big ones', () => {
    const src = ink(['X..X', '...X', '....', 'X..X'], 1)
    // components: (0,0) speck, (3,0)-(3,1)-(3,3)? (3,3) is separate — 2-cell blob, (0,3) speck
    const out = despeckleInk(src, 2, 4, 4)
    expect(draw(out, 4, 4)).toBe('...X\n...X\n....\n....')
  })
})

describe('outline only', () => {
  it('hollows a 3×3 square to its 8 border cells', () => {
    const out = outlineOnlyInk(ink(['XXX', 'XXX', 'XXX']), 3, 3)
    expect(draw(out, 3, 3)).toBe('XXX\nX.X\nXXX')
  })
})

describe('silhouette', () => {
  it('recolors every cell, keeping owners', () => {
    const src = new Map<number, InkCell>([
      [0, { v: 1, o: 7 }],
      [5, { v: 3, o: 9 }],
    ])
    const out = silhouetteInk(src, 2)
    expect(out.get(0)).toEqual({ v: 2, o: 7 })
    expect(out.get(5)).toEqual({ v: 2, o: 9 })
  })
})

describe('long shadow', () => {
  it('casts a diagonal ray to the bounds (shadow cells only)', () => {
    const out = longShadowInk(ink(['X...', '....', '....', '....']), 2, P, 4, 4)
    expect(draw(out, 4, 4)).toBe('....\n.X..\n..X.\n...X')
  })

  it('stops at other ink', () => {
    const out = longShadowInk(ink(['X.X.', '....', '....', '....']), 2, P, 4, 4)
    // the ray from (0,0) is blocked by the ink at (2,0)... diagonal misses it: cells (1,1),(2,2)
    expect(out.has(1 * 4 + 1)).toBe(true)
    expect(out.has(1)).toBe(false) // the cell right of the source stays empty
  })
})

describe('scanlines', () => {
  it('recolors every 2nd row of the ink', () => {
    const out = scanlinesInk(ink(['XX', 'XX', 'XX', 'XX'], 1), 2, 2, 2)
    const vs = [...out.entries()].map(([i, c]) => [i, c.v] as const)
    expect(vs).toContainEqual([0, 2])
    expect(vs).toContainEqual([2, 1])
    expect(vs).toContainEqual([4, 2])
    expect(vs).toContainEqual([6, 1])
  })
})

describe('pixelOpInk dispatch', () => {
  it('shrinking ops replace the ink wholesale', () => {
    const out = pixelOpInk('erode', ink(['XXX', 'XXX', 'XXX']), 2, P, { bw: 3, bh: 3 })
    expect(draw(out, 3, 3)).toBe('...\n.X.\n...')
  })

  it('additive ops merge over the source', () => {
    const out = pixelOpInk('longShadow', ink(['X...']), 2, P, { bw: 4, bh: 4 })
    expect(out.size).toBe(4)
    expect(out.get(0)!.v).toBe(1)
    expect(out.get(5)!.v).toBe(2)
  })
})
