import { describe, expect, it } from 'vitest'

import { MAX_SIZE } from './doc.ts'
import { SIZE_GROUPS, allSizeOptions } from './sizes.ts'

describe('canvas size presets', () => {
  it('keeps every preset inside the 1..MAX_SIZE grid bounds', () => {
    for (const s of allSizeOptions()) {
      expect(s.cols).toBeGreaterThanOrEqual(1)
      expect(s.cols).toBeLessThanOrEqual(MAX_SIZE)
      expect(s.rows).toBeGreaterThanOrEqual(1)
      expect(s.rows).toBeLessThanOrEqual(MAX_SIZE)
    }
  })

  it('pairs every base size with an odd sibling (center row/column for symmetry)', () => {
    for (const s of allSizeOptions()) {
      expect(s.cols % 2 === 0).toBe(!s.odd)
      expect(s.rows % 2 === 0).toBe(!s.odd)
    }
  })

  it('stays close to the group aspect ratio', () => {
    for (const g of SIZE_GROUPS) {
      const [w, h] = g.ratio.split(':').map(Number)
      const target = w / h
      for (const s of g.sizes) {
        expect(Math.abs(s.cols / s.rows - target)).toBeLessThanOrEqual(0.06)
      }
    }
  })

  it('has no duplicate sizes across groups', () => {
    const keys = allSizeOptions().map((s) => `${s.cols}×${s.rows}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
