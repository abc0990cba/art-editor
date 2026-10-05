import { describe, expect, it } from 'vitest'

import { hash2 } from '../texture/core.ts'
import { dissolveInk, dripInk } from './organic.ts'
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
    Array.from({ length: bw }, (_col, x) => (m.has(y * bw + x) ? 'X' : '.')).join(''),
  ).join('\n')
}

const DOWN = { dx: 0, dy: 1, length: 3, variation: 0, seed: 0 } as const

describe('drip', () => {
  it('extends a lone cell downward by the full length at zero variation', () => {
    const out = dripInk(ink(['...', '.X.', '...', '...', '...']), DOWN, 3, 5)
    expect(draw(out, 3, 5)).toBe('...\n.X.\n.X.\n.X.\n.X.')
  })

  it('only run ends emit: interior cells of a run grow nothing', () => {
    const out = dripInk(ink(['.X.', '.X.', '.X.', '...', '...']), { ...DOWN, length: 2 }, 3, 5)
    expect(draw(out, 3, 5)).toBe('.X.\n.X.\n.X.\n.X.\n.X.')
  })

  it('trails stop at other source ink', () => {
    const out = dripInk(ink(['.X.', '...', '...', '.X.']), { ...DOWN, length: 4 }, 3, 4)
    expect(draw(out, 3, 4)).toBe('.X.\n.X.\n.X.\n.X.')
  })

  it('drips sideways from the run end only', () => {
    const out = dripInk(
      ink(['.XX.', '....']),
      { dx: 1, dy: 0, length: 1, variation: 0, seed: 0 },
      4,
      2,
    )
    expect(draw(out, 4, 2)).toBe('.XXX\n....')
  })

  it('is deterministic per seed and varies trail length with variation', () => {
    const p = { dx: 0, dy: 1, length: 10, variation: 1, seed: 42 } as const
    const rows = [
      '.X.',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
    ]
    const a = dripInk(ink(rows), p, 3, 12)
    const b = dripInk(ink(rows), p, 3, 12)
    expect(a).toEqual(b)
    // steps = round(10 · hash) for the run-end cell — always one column, never wider
    expect(a.size).toBeGreaterThanOrEqual(1)
    expect(a.size).toBeLessThanOrEqual(11)
    for (const [i] of a) expect(i % 3).toBe(1)
  })
})

describe('dissolve', () => {
  it('keeps everything at amount 0', () => {
    const src = ink(['XX', '.X'])
    expect(dissolveInk(src, { amount: 0, scale: 1, seed: 0 }, 2)).toEqual(src)
  })

  it('keeps exactly the cells whose hash passes the amount', () => {
    const src = ink(['XXXX'])
    const out = dissolveInk(src, { amount: 0.5, scale: 1, seed: 7 }, 4)
    const expected = new Map<number, InkCell>()
    for (const [i, cell] of src) {
      if (hash2(i % 4, 0, 7) / 4_294_967_296 > 0.5) expected.set(i, cell)
    }
    expect(out).toEqual(expected)
  })

  it('is deterministic and clumping scale stays a subset of the source', () => {
    const src = ink(['XXXX', 'XXXX', 'XXXX', 'XXXX'])
    const p = { amount: 0.4, scale: 3, seed: 1 } as const
    const a = dissolveInk(src, p, 4)
    const b = dissolveInk(src, p, 4)
    expect(a).toEqual(b)
    for (const [i] of a) expect(src.has(i)).toBe(true)
    expect(a.size).toBeLessThan(src.size)
  })
})
