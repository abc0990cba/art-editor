import { describe, expect, it } from 'vitest'

import { DEFAULT_FIELD, type FieldSettings } from '../core/field.ts'
import { fieldAt } from './fields.ts'

const field = (patch: Partial<FieldSettings>): FieldSettings => ({ ...DEFAULT_FIELD, ...patch })

describe('fieldAt — size kinds', () => {
  it('is the identity when every kind is none', () => {
    expect(fieldAt(DEFAULT_FIELD, 3, 3, 9, 9)).toEqual({ scale: 1, angle: 0, dx: 0, dy: 0 })
  })

  it('funnel: full figure at the center, floor at the corners', () => {
    const f = field({ size: 'funnel', amount: 1, min: 0.1 })
    expect(fieldAt(f, 4, 4, 9, 9).scale).toBe(1)
    expect(fieldAt(f, 0, 0, 9, 9).scale).toBeCloseTo(0.1, 10)
  })

  it('fountain is the inverted funnel; invert flips any kind', () => {
    const fountain = field({ size: 'fountain', amount: 1, min: 0.1 })
    const funnel = field({ size: 'funnel', amount: 1, min: 0.1, invert: true })
    expect(fieldAt(fountain, 0, 0, 9, 9).scale).toBeCloseTo(fieldAt(funnel, 0, 0, 9, 9).scale, 10)
  })

  it('amount 0 collapses to the unfaded figure', () => {
    const f = field({ size: 'funnel', amount: 0, min: 0.1 })
    expect(fieldAt(f, 0, 0, 9, 9).scale).toBe(1)
  })

  it('checker alternates 1 and min on a period lattice', () => {
    const f = field({ size: 'checker', amount: 1, min: 0.2, period: 4 })
    expect(fieldAt(f, 0, 0, 16, 16).scale).toBeCloseTo(0.2, 10)
    expect(fieldAt(f, 4, 0, 16, 16).scale).toBe(1)
  })

  it('waves are periodic in cells and deterministic', () => {
    const f = field({ size: 'waveX', amount: 1, min: 0.1, period: 8 })
    expect(fieldAt(f, 0, 3, 64, 9).scale).toBeCloseTo(fieldAt(f, 8, 3, 64, 9).scale, 10)
    expect(fieldAt(f, 2, 3, 64, 9).scale).not.toBeCloseTo(fieldAt(f, 8, 3, 64, 9).scale, 2)
  })
})

describe('fieldAt — align kinds', () => {
  it('center points toward the grid center (west for a cell right of center)', () => {
    const f = field({ align: 'center' })
    // cell at the center row, right half: the direction to the center is 180° (−x in y-down coords)
    expect(fieldAt(f, 7, 4, 9, 9).angle).toBe(180)
  })

  it('truchet yields seeded multiples of 90°, reproducible', () => {
    const f = field({ align: 'truchet', seed: 7 })
    for (let x = 0; x < 12; x++) {
      const a = fieldAt(f, x, x % 5, 16, 16).angle
      expect(a % 90).toBe(0)
      expect(fieldAt(f, x, x % 5, 16, 16).angle).toBe(a)
    }
    expect(fieldAt(field({ align: 'truchet', seed: 8 }), 3, 3, 16, 16).angle).not.toBe(
      fieldAt(f, 3, 3, 16, 16).angle,
    )
  })

  it('outward opposes center', () => {
    const c = fieldAt(field({ align: 'center' }), 0, 0, 9, 9).angle
    expect(fieldAt(field({ align: 'outward' }), 0, 0, 9, 9).angle).toBe((c + 180) % 360)
  })
})

describe('fieldAt — offset kinds', () => {
  it('scatter is seeded, deterministic and bounded', () => {
    const f = field({ offset: 'scatter', seed: 3 })
    for (let x = 0; x < 20; x++) {
      const s = fieldAt(f, x, x % 7, 32, 32)
      expect(s.dx).toBe(Math.max(-0.25, Math.min(0.25, s.dx)))
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(0.25)
      expect(fieldAt(f, x, x % 7, 32, 32).dx).toBe(s.dx)
    }
  })

  it('shrunk figures may move further than full-size ones', () => {
    const shrunk = field({ offset: 'scatter', seed: 1, size: 'funnel', amount: 1, min: 0.1 })
    let maxFull = 0
    let maxShrunk = 0
    for (let x = 0; x < 24; x++) {
      maxFull = Math.max(
        maxFull,
        Math.abs(fieldAt(field({ offset: 'scatter', seed: 1 }), x, 5, 32, 32).dx),
      )
      maxShrunk = Math.max(maxShrunk, Math.abs(fieldAt(shrunk, x, 5, 32, 32).dx))
    }
    expect(maxShrunk).toBeGreaterThan(maxFull)
  })

  it('magnet pulls corner cells toward the center', () => {
    const f = field({ offset: 'magnet' })
    expect(fieldAt(f, 0, 0, 9, 9).dx).toBeGreaterThan(0)
    expect(fieldAt(f, 8, 8, 9, 9).dx).toBeLessThan(0)
  })
})
