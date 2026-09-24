import { describe, expect, it } from 'vitest'

import { BAYER2 } from './dither-matrices.ts'
import { patternAt } from './fillpatterns.ts'
import { glyphSetFromMatrix, glyphSetLines, type GlyphTileSet } from './glyph-tiles.ts'

const bayer2Set = glyphSetFromMatrix(BAYER2, 'b2')
const lineSet: GlyphTileSet = {
  name: 'lines',
  w: 2,
  h: 1,
  levels: [
    [false, false],
    [true, false],
    [true, true],
  ],
}

describe('glyph fill pattern', patternBasics)

function patternBasics() {
  it('tone 0..1 maps to the empty and full tiles', () => {
    expect(patternAt('glyph', 0, 0, 0, { glyph: bayer2Set })).toBe(false)
    expect(patternAt('glyph', 0, 0, 1, { glyph: bayer2Set })).toBe(true)
  })

  it('mid tone reads the repeating tile: cell (0,0) is inked in BAYER2 level 2', () => {
    // BAYER2 ranks: (0,0)=0 (0,1)=2 (1,0)=3 (1,1)=1; level 2 inks ranks < 1.5 → (0,0),(1,1)
    expect(patternAt('glyph', 0, 0, 0.5, { glyph: bayer2Set })).toBe(true)
    expect(patternAt('glyph', 1, 0, 0.5, { glyph: bayer2Set })).toBe(false)
  })

  it('line tiles alternate per column at mid tone', () => {
    const at = (x: number) => patternAt('glyph', x, 0, 0.5, { glyph: lineSet })
    expect(at(0)).toBe(true)
    expect(at(1)).toBe(false)
    expect(at(2)).toBe(true)
  })

  it('scale multiplies the tile step', () => {
    // scale 2: both x=0 and x=1 read tile cell 0
    const a = patternAt('glyph', 0, 0, 0.5, { glyph: lineSet, scale: 2 })
    const b = patternAt('glyph', 1, 0, 0.5, { glyph: lineSet, scale: 2 })
    expect(a).toBe(b)
  })

  it('null set falls back to a flat half threshold', () => {
    expect(patternAt('glyph', 0, 0, 0.75, { glyph: null })).toBe(true)
    expect(patternAt('glyph', 0, 0, 0.25, { glyph: null })).toBe(false)
  })

  it('glyphSetLines ramp is monotone in coverage', () => {
    const set = glyphSetLines('diag', 3, 7, 'd')
    let prev = -1
    for (const cells of set.levels) {
      let on = 0
      for (const v of cells) if (v) on++
      expect(on).toBeGreaterThanOrEqual(prev)
      prev = on
    }
  })
}
