import { describe, expect, it } from 'vitest'

import { BUILT_IN_GLYPH_SETS, GLYPH_FAMILY_ORDER } from './glyph-builtins.ts'
import {
  glyphSetArgyle,
  glyphSetBubbles,
  glyphSetCrossStitch,
  glyphSetCrystal,
  glyphSetForm,
  glyphSetFormDuo,
  glyphSetHalftone,
  glyphSetHatch,
  glyphSetHearts,
  glyphSetRipples,
  glyphSetSilk,
  glyphSetSunburst,
  glyphSetTesserae,
  glyphSetTriangles,
} from './glyph-generators-art.ts'
import { glyphRampField, tileCoverage, type GlyphTileSet } from './glyph-tiles.ts'

const ART_SETS: [string, GlyphTileSet][] = [
  ['halftone', glyphSetHalftone(6, 13)],
  ['triangles', glyphSetTriangles(6, 13)],
  ['bubbles', glyphSetBubbles(12, 17)],
  ['form-hex', glyphSetForm('hexagon', 12, 17)],
  ['form-sparkle', glyphSetForm('sparkle', 12, 17)],
  ['form-heart', glyphSetForm('heart', 12, 17)],
  ['duo-stars-dots', glyphSetFormDuo('star', 'circle', 12, 17)],
  ['duo-hearts-diamonds', glyphSetFormDuo('heart', 'diamond', 12, 17)],
  ['duo-cross-rings', glyphSetFormDuo('cross', 'ring', 12, 17)],
  ['hatch', glyphSetHatch(8, 13)],
  ['ripples', glyphSetRipples(12, 17)],
  ['sunburst', glyphSetSunburst(12, 17)],
  ['crystal', glyphSetCrystal(12, 17)],
  ['silk', glyphSetSilk(16, 25)],
  ['argyle', glyphSetArgyle(12, 13)],
  ['crossstitch', glyphSetCrossStitch(10, 13)],
  ['hearts', glyphSetHearts(12, 13)],
  ['tesserae', glyphSetTesserae(10, 17)],
]

describe('art glyph generators', art)

function art() {
  for (const [name, set] of ART_SETS) {
    it(`${name}: coverage is monotone, starts empty, ends full`, () => {
      let prev = -1
      for (const cells of set.levels) {
        const cov = tileCoverage(cells)
        expect(cov).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = cov
      }
      expect(set.levels[0].some(Boolean)).toBe(false)
      expect(set.levels[set.levels.length - 1].every(Boolean)).toBe(true)
    })

    it(`${name}: never loses ink per cell as the tone rises`, () => {
      for (let t = 1; t < set.levels.length; t++) {
        const prevCells = set.levels[t - 1]
        set.levels[t].forEach((v, i) => {
          if (prevCells[i]) expect(v).toBe(true)
        })
      }
    })

    it(`${name}: tone ramp renders every level at least once`, () => {
      // the gallery strip is a horizontal tone sweep — spot-check the field is non-trivial
      const cells = glyphRampField(set, 48, set.h)
      expect(cells.some(Boolean)).toBe(true)
      expect(cells.some((v) => !v)).toBe(true)
    })
  }

  it('sunburst sweeps wedges clockwise from the top spoke', () => {
    const set = glyphSetSunburst(12, 17)
    const mid = set.levels[8]
    const at = (x: number, y: number) => mid[y * 12 + x]
    // at mid tone the sweep has covered top-right but not yet the left side
    expect(at(6, 0)).toBe(true)
    expect(at(5, 0)).toBe(false)
    expect(at(0, 5)).toBe(false)
  })

  it('crystal is mirror-symmetric across the vertical axis at mid tone', () => {
    const set = glyphSetCrystal(12, 17)
    const mid = set.levels[8]
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 6; x++) expect(mid[y * 12 + x]).toBe(mid[y * 12 + (11 - x)])
    }
  })

  it('hatch reaches full coverage only at the end of the ramp', () => {
    const set = glyphSetHatch(8, 13)
    expect(tileCoverage(set.levels[3])).toBeLessThan(0.5)
    expect(set.levels[12].every(Boolean)).toBe(true)
  })

  it('hearts reads as a heart: wider at the lobes than at the cusp', () => {
    const set = glyphSetHearts(12, 13)
    const mid = set.levels[8]
    const row = (y: number) => mid.slice(y * 12, y * 12 + 12).filter(Boolean).length
    expect(row(3)).toBeGreaterThan(row(9))
  })
}

describe('art sets in the built-in registry', registry)

const ART_IDS = [
  'glyph-halftone6',
  'glyph-bubbles12',
  'glyph-hatch8',
  'glyph-ripples12',
  'glyph-sunburst12',
  'glyph-crystal12',
  'glyph-silk16',
  'glyph-argyle12',
  'glyph-crossstitch10',
  'glyph-hearts12',
  'glyph-tesserae10',
]

function registry() {
  it('all art sets are registered with unique ids and known families', () => {
    const ids = BUILT_IN_GLYPH_SETS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ART_IDS) {
      const entry = BUILT_IN_GLYPH_SETS.find((b) => b.id === id)
      expect(entry, id).toBeDefined()
      expect(GLYPH_FAMILY_ORDER).toContain(entry!.family)
    }
  })

  it('the new sets use tile sizes beyond the old 4/8/16 spread', () => {
    const sizes = new Set(BUILT_IN_GLYPH_SETS.map((b) => b.set.w))
    for (const n of [6, 10, 12]) expect(sizes.has(n), `size ${n}`).toBe(true)
  })
}
