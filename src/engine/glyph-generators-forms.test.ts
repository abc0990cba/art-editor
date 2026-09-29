import { describe, expect, it } from 'vitest'

import { glyphSetForm, glyphSetFormDuo, glyphSetFormMorph } from './glyph-generators-forms.ts'
import { glyphRampField, tileCoverage, type GlyphTileSet } from './glyph-tiles.ts'

const FORM_SETS: [string, GlyphTileSet][] = [
  ['form-circle', glyphSetForm('circle', 12, 17)],
  ['form-square', glyphSetForm('square', 12, 17)],
  ['form-cross', glyphSetForm('cross', 12, 17)],
  ['form-xcross', glyphSetForm('xCross', 12, 17)],
  ['form-ring', glyphSetForm('ring', 12, 17)],
  ['form-star', glyphSetForm('star', 12, 17)],
  ['form-heart', glyphSetForm('heart', 12, 17)],
  ['duo', glyphSetFormDuo('star', 'circle', 12, 17)],
  ['duo-pitch3', glyphSetFormDuo('heart', 'diamond', 12, 17, { name: 'Дуэт 3×3', pitch: 3 })],
  ['morph-star-heart', glyphSetFormMorph('star', 'heart', 12, 17)],
  ['morph-circle-cross', glyphSetFormMorph('circle', 'cross', 12, 17)],
  ['morph-triangle-hexagon', glyphSetFormMorph('triangle', 'hexagon', 12, 17)],
  ['morph-ring-diamond', glyphSetFormMorph('ring', 'diamond', 12, 17)],
]

describe('form glyph ramps', () => {
  for (const [name, set] of FORM_SETS) {
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
      const cells = glyphRampField(set, 48, set.h)
      expect(cells.some(Boolean)).toBe(true)
    })
  }

  it('morph passes through a genuine in-between silhouette', () => {
    const set = glyphSetFormMorph('circle', 'diamond', 12, 17)
    // at the light end the level matches the pure-A ramp, at the dark end the pure-B one
    const pureA = glyphSetForm('circle', 12, 17)
    const pureB = glyphSetForm('diamond', 12, 17)
    expect(set.levels[1]).toEqual(pureA.levels[1])
    expect(set.levels[set.levels.length - 2]).toEqual(pureB.levels[pureB.levels.length - 2])
  })

  it('duo lattice density changes the screen', () => {
    const coarse = glyphSetFormDuo('star', 'circle', 12, 17)
    const fine = glyphSetFormDuo('star', 'circle', 12, 17, { pitch: 3 })
    expect(fine.levels[8]).not.toEqual(coarse.levels[8])
  })
})
