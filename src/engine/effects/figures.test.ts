import { describe, expect, it } from 'vitest'

import { figurefyInk, patternizeInk } from './figures.ts'
import type { CellBox, InkCell } from './selection-xform.ts'

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
    Array.from({ length: bw }, (_col, x) => (m.has(y * bw + x) ? 'X' : '.')).join(''),
  ).join('\n')
}

const BOX: CellBox = { x0: 0, y0: 0, x1: 1, y1: 1 }

describe('figurefy', () => {
  it('draws a 4×4 pixel circle inside every source cell (figure mode)', () => {
    const out = figurefyInk(
      ink(['X...']),
      { scale: 4, figure: 'circle', mode: 'figure' },
      BOX,
      4,
      4,
    )
    expect(draw(out, 4, 4)).toBe('.XX.\nXXXX\nXXXX\n.XX.')
  })

  it('cut mode keeps the block everywhere but the figure', () => {
    const out = figurefyInk(ink(['X...']), { scale: 4, figure: 'ring', mode: 'cut' }, BOX, 4, 4)
    expect(draw(out, 4, 4)).toBe('X..X\n.XX.\n.XX.\nX..X')
  })

  it('blocks anchor at the selection box origin and inherit value + owner per source cell', () => {
    const src = new Map<number, InkCell>([
      [0, { v: 3, o: 7 }], // (0, 0)
      [1, { v: 4, o: 9 }], // (1, 0)
    ])
    const out = figurefyInk(
      src,
      { scale: 2, figure: 'circle', mode: 'figure' },
      { x0: 0, y0: 0, x1: 2, y1: 1 },
      4,
      2,
    )
    expect(out.get(0)!.o).toBe(7)
    expect(out.get(2)!.v).toBe(4)
    expect(out.get(2)!.o).toBe(9)
    expect(out.size).toBe(8)
  })

  it('blocks reaching past the buffer edge clip', () => {
    const out = figurefyInk(
      ink(['..X.']),
      { scale: 4, figure: 'circle', mode: 'figure' },
      { x0: 0, y0: 0, x1: 3, y1: 1 },
      4,
      4,
    )
    expect(out.size).toBe(0)
  })
})

describe('patternize', () => {
  it('checker at 50% keeps one diagonal of each 2×2 tile', () => {
    const out = patternizeInk(
      ink(['XXXX', 'XXXX']),
      { pattern: 'checker', scale: 1, density: 0.5, invert: false },
      4,
    )
    expect(draw(out, 4, 2)).toBe('X.X.\n.X.X')
  })

  it('dots grow a disc per 4×4 tile', () => {
    const out = patternizeInk(
      ink(['XXXX', 'XXXX', 'XXXX', 'XXXX']),
      { pattern: 'dots', scale: 1, density: 0.5, invert: false },
      4,
    )
    expect(draw(out, 4, 4)).toBe('....\n.XX.\n.XX.\n....')
  })

  it('invert flips the keep mask', () => {
    const out = patternizeInk(
      ink(['XXXX', 'XXXX']),
      { pattern: 'checker', scale: 1, density: 0.5, invert: true },
      4,
    )
    expect(draw(out, 4, 2)).toBe('.X.X\nX.X.')
  })

  it('scale multiplies the tile period', () => {
    const out = patternizeInk(
      ink(['XXXX', 'XXXX']),
      { pattern: 'checker', scale: 2, density: 0.5, invert: false },
      4,
    )
    expect(draw(out, 4, 2)).toBe('XX..\nXX..')
  })
})
