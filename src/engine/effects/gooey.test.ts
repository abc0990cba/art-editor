import { describe, expect, it } from 'vitest'

import { blobifyInk, smoothenInk } from './gooey.ts'
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

describe('blobify', () => {
  it('rounds a lone dot into a plus at radius 2 (smooth falloff, iso 0.5)', () => {
    const out = blobifyInk(
      ink(['.....', '.....', '..X..', '.....', '.....']),
      {
        radius: 2,
        iso: 0.5,
        falloff: 'smooth',
      },
      5,
      5,
    )
    expect(draw(out, 5, 5)).toBe('.....\n..X..\n.XXX.\n..X..\n.....')
  })

  it('is a no-op at radius 1 (only the source kernel survives the iso)', () => {
    const src = ink(['.X.', '...'])
    const out = blobifyInk(src, { radius: 1, iso: 0.5, falloff: 'gooey' }, 3, 2)
    expect(out).toEqual(src)
  })

  it('fuses two nearby dots and attributes the neck to the strongest contributor', () => {
    const src = new Map<number, InkCell>([
      [8, { v: 1, o: 11 }], // (1, 1)
      [12, { v: 2, o: 12 }], // (5, 1)
    ])
    const out = blobifyInk(src, { radius: 3, iso: 0.5, falloff: 'smooth' }, 7, 3)
    expect(out.get(1 * 7 + 3)).toEqual({ v: 1, o: 11 }) // (3, 1): equal kernels, first source wins
    expect(out.get(1 * 7 + 4)!.v).toBe(2) // (4, 1): right dot dominates
  })

  it('keeps growth gated by iso: a high iso leaves a lone dot alone', () => {
    const src = ink(['.X.'])
    const out = blobifyInk(src, { radius: 3, iso: 0.9, falloff: 'gooey' }, 3, 1)
    expect(draw(out, 3, 1)).toBe('.X.')
  })
})

describe('smoothen', () => {
  it('fills the missing cell of a three-quarter 2×2 block', () => {
    const out = smoothenInk(ink(['XX.', 'X..']), 1, 3, 2)
    expect(draw(out, 3, 2)).toBe('XX.\nXX.')
  })

  it('passes accumulate down a concave edge', () => {
    const one = smoothenInk(ink(['XX.', 'X..', 'X..']), 1, 3, 3)
    expect(draw(one, 3, 3)).toBe('XX.\nXX.\nX..')
    const two = smoothenInk(ink(['XX.', 'X..', 'X..']), 2, 3, 3)
    expect(draw(two, 3, 3)).toBe('XX.\nXX.\nXX.')
  })

  it('leaves a pure diagonal staircase untouched (blocks hold two cells, not three)', () => {
    const src = ink(['..X', '.X.', 'X..'])
    expect(smoothenInk(src, 3, 3, 3)).toEqual(src)
  })

  it('fills inherit the diagonal cell value + owner', () => {
    const src = new Map<number, InkCell>([
      [0, { v: 4, o: 3 }], // (0, 0)
      [1, { v: 5, o: 4 }], // (1, 0)
      [3, { v: 6, o: 5 }], // (0, 1)
    ])
    const out = smoothenInk(src, 1, 3, 2)
    expect(out.get(4)).toEqual({ v: 4, o: 3 }) // (1, 1) completes onto the (0, 0) diagonal
  })
})
