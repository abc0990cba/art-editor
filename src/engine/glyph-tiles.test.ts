import { describe, expect, it } from 'vitest'

import { BAYER2, BAYER4 } from './dither-matrices.ts'
import {
  BUILT_IN_GLYPH_SETS,
  builtInGlyphSetById,
  emptyGlyphSet,
  glyphCellAt,
  glyphSetChecker,
  glyphSetDots,
  glyphSetFromMatrix,
  glyphSetLines,
  glyphSetToField,
  invertGlyphSet,
  normalizeGlyphTileSet,
  resizeGlyphSet,
  tileCoverage,
  tileIndexForTone,
} from './glyph-tiles.ts'

describe('glyph tile sets', basics)

function basics() {
  it('normalize fills missing levels with false and clamps sizes', () => {
    const set = normalizeGlyphTileSet({ name: 'T', w: 99, h: 1, levels: [] })
    expect(set.w).toBe(8)
    expect(set.h).toBe(1)
    expect(set.levels.length).toBe(9)
    for (const cells of set.levels) expect(cells.every((v) => v === false)).toBe(true)
  })

  it('emptyGlyphSet keeps level 0 empty and the last level full', () => {
    const set = emptyGlyphSet(2, 2, 5, 't')
    expect(set.levels[0].every((v) => !v)).toBe(true)
    expect(set.levels[4].every((v) => v)).toBe(true)
  })

  it('tileIndexForTone maps 0..1 across levels with clamping', () => {
    expect(tileIndexForTone(0, 9)).toBe(0)
    expect(tileIndexForTone(1, 9)).toBe(8)
    expect(tileIndexForTone(0.5, 9)).toBe(4)
    expect(tileIndexForTone(-1, 9)).toBe(0)
    expect(tileIndexForTone(2, 9)).toBe(8)
  })

  it('glyphCellAt repeats the tile grid and picks the level by tone', () => {
    const set = normalizeGlyphTileSet({
      name: 't',
      w: 2,
      h: 1,
      levels: [
        [false, false],
        [true, false],
        [true, true],
      ],
    })
    expect(glyphCellAt(set, 0, 0, 0)).toBe(false)
    expect(glyphCellAt(set, 0, 0, 0.5)).toBe(true)
    expect(glyphCellAt(set, 1, 0, 0.5)).toBe(false)
    // repetition: x=2 wraps to x=0
    expect(glyphCellAt(set, 2, 0, 0.5)).toBe(true)
    expect(glyphCellAt(set, 0, 0, 1)).toBe(true)
  })

  it('tileCoverage is the ink share', () => {
    expect(tileCoverage([true, true, false, false])).toBe(0.5)
    expect(tileCoverage([])).toBe(0)
  })
}

describe('glyph generators', generators)

function generators() {
  it('matrix ramp is monotone and matches matrix ranks', () => {
    const set = glyphSetFromMatrix(BAYER4, 'b4')
    expect(set.w).toBe(4)
    expect(set.h).toBe(4)
    expect(set.levels.length).toBe(17)
    // monotone: level t+1 has >= coverage than level t
    for (let t = 1; t < set.levels.length; t++) {
      expect(tileCoverage(set.levels[t])).toBeGreaterThanOrEqual(
        tileCoverage(set.levels[t - 1]) - 1e-9,
      )
    }
    // rank 0 of BAYER2 (value 0) inks first
    const first = glyphSetFromMatrix(BAYER2, 'b2')
    expect(first.levels[1].filter(Boolean).length).toBe(1)
  })

  it('dots ramp grows monotonically', () => {
    const set = glyphSetDots(4, 9)
    for (let t = 1; t < set.levels.length; t++) {
      for (let i = 0; i < set.levels[t].length; i++) {
        if (set.levels[t - 1][i]) expect(set.levels[t][i]).toBe(true)
      }
    }
    expect(set.levels[0].some(Boolean)).toBe(false)
  })

  it('line ramps fill rows/columns in tone order', () => {
    const h = glyphSetLines('h', 4, 5, 'h')
    // mid tone: 2 of 4 rows inked
    expect(h.levels[2].filter(Boolean).length).toBe(8)
    const v = glyphSetLines('v', 4, 5, 'v')
    expect(v.levels[2].filter(Boolean).length).toBe(8)
    const diag = glyphSetLines('diag', 4, 5, 'd')
    expect(diag.levels[4].every(Boolean)).toBe(true)
  })

  it('checker ramp stays inside 0..1 coverage', () => {
    const set = glyphSetChecker(4, 9)
    for (const cells of set.levels) {
      const cov = tileCoverage(cells)
      expect(cov).toBeGreaterThanOrEqual(0)
      expect(cov).toBeLessThanOrEqual(1)
    }
  })

  it('built-in registry resolves by id', () => {
    expect(BUILT_IN_GLYPH_SETS.length).toBeGreaterThanOrEqual(9)
    expect(builtInGlyphSetById('glyph-bayer4')?.w).toBe(4)
    expect(builtInGlyphSetById('nope')).toBeNull()
  })
}

describe('glyph transforms', transforms)

function transforms() {
  it('resize resamples nearest-neighbor and keeps levels', () => {
    const set = glyphSetDots(2, 5)
    const big = resizeGlyphSet(set, 4, 4)
    expect(big.w).toBe(4)
    expect(big.h).toBe(4)
    expect(big.levels.length).toBe(5)
    const small = resizeGlyphSet(big, 2, 2)
    expect(small.levels[4].every(Boolean)).toBe(true)
  })

  it('invert flips cells; double invert restores', () => {
    const set = glyphSetDots(2, 5)
    const inv = invertGlyphSet(set)
    for (let t = 0; t < set.levels.length; t++) {
      for (let i = 0; i < set.levels[t].length; i++) {
        expect(inv.levels[t][i]).toBe(!set.levels[t][i])
      }
    }
    expect(invertGlyphSet(inv).levels).toEqual(set.levels)
  })

  it('glyphSetToField gives thresholds consistent with glyphCellAt', () => {
    const set = glyphSetFromMatrix(BAYER2, 'b2')
    const field = glyphSetToField(set)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const f = field(x, y)
        const idx = tileIndexForTone(f, set.levels.length)
        expect(glyphCellAt(set, x, y, f)).toBe(set.levels[idx][(y % 2) * 2 + (x % 2)])
      }
    }
  })
}
