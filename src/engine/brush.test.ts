import { describe, expect, it } from 'vitest'
import {
  MAX_BRUSH,
  brushAnchor,
  brushOffsets,
  checkerBrush,
  circleBrush,
  diamondBrush,
  normalizeBrush,
  resizeBrush,
  squareBrush,
} from './brush'

describe('brush factories', () => {
  it('square brush fills the whole tip', () => {
    const b = squareBrush(5)
    expect(b.size).toBe(5)
    expect(b.pattern).toHaveLength(25)
    expect(b.pattern.every((v) => v)).toBe(true)
    expect(brushOffsets(b)).toHaveLength(25)
  })

  it('circle brush keeps the center and corners answer correctly', () => {
    const b = circleBrush(5)
    expect(b.size).toBe(5)
    const on = (x: number, y: number) => b.pattern[y * 5 + x]
    expect(on(2, 2)).toBe(true)
    expect(on(2, 0)).toBe(true)
    expect(on(0, 0)).toBe(false)
    expect(on(4, 4)).toBe(false)
    expect(brushOffsets(b).length).toBeGreaterThan(5)
    expect(brushOffsets(b).length).toBeLessThan(25)
  })

  it('diamond brush is a manhattan disc', () => {
    const b = diamondBrush(5)
    const on = (x: number, y: number) => b.pattern[y * 5 + x]
    expect(on(2, 2)).toBe(true)
    expect(on(2, 0)).toBe(true)
    // distance-2 cells belong to the radius-2 diamond…
    expect(on(1, 1)).toBe(true)
    // …distance-3 cells do not
    expect(on(0, 0)).toBe(false)
    expect(on(0, 1)).toBe(false)
    expect(brushOffsets(b).length).toBeGreaterThan(5)
    expect(brushOffsets(b).length).toBeLessThan(25)
  })

  it('checker brush alternates cells', () => {
    const b = checkerBrush(4)
    expect(b.pattern[0]).toBe(true)
    expect(b.pattern[1]).toBe(false)
    expect(b.pattern[4]).toBe(false)
  })

  it('circle/diamond of size 1 and 2 degenerate to a full tip', () => {
    for (const make of [circleBrush, diamondBrush]) {
      expect(make(1).pattern).toEqual([true])
      expect(make(2).pattern.every((v) => v)).toBe(true)
    }
  })
})

describe('normalizeBrush', () => {
  it('clamps size and truncates/extends the pattern', () => {
    expect(normalizeBrush({ size: 99, pattern: [] }).size).toBe(MAX_BRUSH)
    expect(normalizeBrush({ size: 0 }).size).toBe(1)
    expect(normalizeBrush({ size: 2 }).pattern).toEqual([true, true, true, true])
    // a short stored pattern is padded with "off" cells
    expect(normalizeBrush({ size: 2, pattern: [true, false] }).pattern).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('never returns an empty tip', () => {
    const empty = Array.from({ length: 9 }, () => false)
    expect(normalizeBrush({ size: 3, pattern: empty }).pattern.some((v) => v)).toBe(true)
  })

  it('handles missing input', () => {
    expect(normalizeBrush(null)).toEqual({ size: 1, pattern: [true] })
    expect(normalizeBrush(undefined)).toEqual({ size: 1, pattern: [true] })
  })
})

describe('resizeBrush', () => {
  it('grows by nearest-neighbor duplication', () => {
    const grown = resizeBrush(squareBrush(1), 2)
    expect(grown.size).toBe(2)
    expect(grown.pattern.every((v) => v)).toBe(true)
  })

  it('keeps a custom tip recognizable when shrinking', () => {
    const tip = squareBrush(4)
    tip.pattern = tip.pattern.map((_, i) => i % 8 === 0) // left column, rows 0 and 2
    const shrunk = resizeBrush(tip, 2)
    expect(shrunk.size).toBe(2)
    // source columns collapse onto output column 0; only source row 0 lands in output row 0
    expect(shrunk.pattern).toEqual([true, false, true, false])
  })

  it('is a no-op when the size is unchanged', () => {
    const b = circleBrush(7)
    expect(resizeBrush(b, 7)).toEqual(b)
  })
})

describe('brushAnchor', () => {
  it('snaps to the size grid anchored at the origin', () => {
    expect(brushAnchor(0, 0, 5, true)).toEqual([0, 0])
    expect(brushAnchor(4, 7, 5, true)).toEqual([0, 5])
    expect(brushAnchor(5, 10, 5, true)).toEqual([5, 10])
    expect(brushAnchor(12, 3, 8, true)).toEqual([8, 0])
  })

  it('centers the tip under the cursor when free', () => {
    expect(brushAnchor(10, 10, 1, false)).toEqual([10, 10])
    expect(brushAnchor(10, 10, 5, false)).toEqual([8, 8])
    expect(brushAnchor(10, 10, 4, false)).toEqual([9, 9])
  })
})
