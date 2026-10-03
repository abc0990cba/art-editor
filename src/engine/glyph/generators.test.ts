import { describe, expect, it } from 'vitest'

import { BUILT_IN_GLYPH_SETS, GLYPH_FAMILY_ORDER } from './builtins.ts'
import {
  glyphSetBricks,
  glyphSetGrain,
  glyphSetPinwheel,
  glyphSetRings,
  glyphSetScales,
  glyphSetShapeMorph,
  glyphSetStars,
  glyphSetWaves,
} from './generators.ts'
import { glyphRampField, tileCoverage, type GlyphTileSet } from './tiles.ts'

const NEW_SETS: [string, GlyphTileSet][] = [
  ['morph', glyphSetShapeMorph(8, 17)],
  ['stars', glyphSetStars(8, 17)],
  ['rings', glyphSetRings(8, 17)],
  ['scales', glyphSetScales(8, 17)],
  ['waves', glyphSetWaves(8, 17)],
  ['bricks', glyphSetBricks(8, 17)],
  ['grain', glyphSetGrain(8, 17)],
  ['pinwheel', glyphSetPinwheel(8, 17)],
]

describe('shape-family generators', shapes)

function shapes() {
  for (const [name, set] of NEW_SETS) {
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
  }

  for (const [name, set] of NEW_SETS.filter(([n]) => ['morph', 'stars', 'rings'].includes(n))) {
    it(`${name}: is 4-fold symmetric at mid tone`, () => {
      const mid = set.levels[Math.floor(set.levels.length / 2)]
      const n = set.w
      const at = (x: number, y: number) => mid[y * n + x]
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          expect(at(x, y)).toBe(at(n - 1 - x, y))
          expect(at(x, y)).toBe(at(x, n - 1 - y))
        }
      }
    })
  }

  it('morph: mid tone is round (corners wait), edge midpoints ink before corners', () => {
    const set = glyphSetShapeMorph(8, 17)
    const mid = set.levels[8]
    expect(mid[0]).toBe(false) // corner
    expect(mid[27]).toBe(true) // near-center cell
    const late = set.levels[14]
    expect(late[3]).toBe(true) // top edge midpoint — the diamond spike
    expect(late[0]).toBe(false) // the very corner only fills at the last level
  })

  it('stars spike along the axes: mid tone inks edge midpoints before corners', () => {
    const set = glyphSetStars(8, 17)
    const mid = set.levels[8]
    expect(mid[3]).toBe(true) // top edge midpoint on the center column
    expect(mid[0]).toBe(false) // corner waits for high tone
  })

  it('rings keep a hollow center at mid tone', () => {
    const set = glyphSetRings(8, 17)
    const mid = set.levels[8]
    expect(mid[27]).toBe(false) // center hole
    expect(mid.some(Boolean)).toBe(true)
  })

  it('grain is deterministic and per-cell monotone', () => {
    const a = glyphSetGrain(8, 17)
    const b = glyphSetGrain(8, 17)
    expect(a.levels).toEqual(b.levels)
    for (let t = 1; t < a.levels.length; t++) {
      for (let i = 0; i < a.levels[t].length; i++) {
        if (a.levels[t - 1][i]) expect(a.levels[t][i]).toBe(true)
      }
    }
  })

  it('bricks fade the vertical joints before the full tone', () => {
    const set = glyphSetBricks(8, 17)
    const full = set.levels[16]
    expect(full.every(Boolean)).toBe(true)
    const mid = set.levels[8]
    expect(mid.some((v) => !v)).toBe(true) // joints/mortar still visible
  })
}

describe('glyph ramp preview field', rampField)

function rampField() {
  it('runs full ink on the left to empty on the right', () => {
    const set = glyphSetShapeMorph(4, 9)
    const field = glyphRampField(set, 32, 8)
    expect(field.length).toBe(32 * 8)
    for (let y = 0; y < 8; y++) {
      expect(field[y * 32]).toBe(true)
      expect(field[y * 32 + 31]).toBe(false)
    }
  })
}

describe('built-in registry with families', registry)

function registry() {
  it('registers every family with at least one set', () => {
    for (const family of GLYPH_FAMILY_ORDER) {
      expect(BUILT_IN_GLYPH_SETS.some((b) => b.family === family)).toBe(true)
    }
  })

  it('has unique ids and square tiles', () => {
    const ids = new Set(BUILT_IN_GLYPH_SETS.map((b) => b.id))
    expect(ids.size).toBe(BUILT_IN_GLYPH_SETS.length)
    for (const b of BUILT_IN_GLYPH_SETS) {
      expect(b.set.w).toBe(b.set.h)
      expect(b.set.levels.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('includes the large 16×16 and new shape sets', () => {
    for (const id of [
      'glyph-dots16',
      'glyph-diamonds16',
      'glyph-morph16',
      'glyph-stars16',
      'glyph-rings16',
      'glyph-scales16',
      'glyph-waves16',
      'glyph-griddots16',
      'glyph-squares16',
      'glyph-bricks8',
      'glyph-grain8',
      'glyph-pinwheel8',
    ]) {
      expect(BUILT_IN_GLYPH_SETS.some((b) => b.id === id)).toBe(true)
    }
  })

  it('all built-in ramps are monotone', () => {
    for (const b of BUILT_IN_GLYPH_SETS) {
      let prev = -1
      for (const cells of b.set.levels) {
        const cov = tileCoverage(cells)
        expect(cov).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = cov
      }
    }
  })
}
