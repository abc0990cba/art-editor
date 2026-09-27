import { describe, expect, it } from 'vitest'

import { fitRegion } from './model-select.ts'
import {
  fieldToPixels,
  hsvField,
  linearField,
  mulberry32,
  quantize8,
  radialField,
  solidField,
  withNoise,
} from './synth.util.ts'
import { DEFAULT_FIT_OPTIONS, type GradStop } from './types.ts'

const STOPS: GradStop[] = [
  { offset: 0, color: { r: 0.9, g: 0.15, b: 0.1 } },
  { offset: 0.5, color: { r: 0.95, g: 0.85, b: 0.2 } },
  { offset: 1, color: { r: 0.15, g: 0.5, b: 0.8 } },
]

describe('fitRegion', () => {
  it('picks solid for a constant region', () => {
    const field = solidField(32, 32, { r: 0.3, g: 0.6, b: 0.9 })
    const result = fitRegion(fieldToPixels(field))
    expect(result.fit.kind).toBe('solid')
    expect(result.accepted).toBe(true)
    expect(result.smooth).toBe(true)
  })

  it('picks linear for a banded noisy linear ramp (radial is rejected as parallel)', () => {
    const size = 96
    const field = quantize8(
      withNoise(
        linearField(size, size, { x: 0, y: 0 }, { x: size * 0.8, y: size * 0.6 }, STOPS),
        2 / 255,
        mulberry32(3),
      ),
    )
    const result = fitRegion(fieldToPixels(field), DEFAULT_FIT_OPTIONS, field)
    expect(result.fit.kind).toBe('linear')
    expect(result.accepted).toBe(true)
  })

  it('picks radial for a radial ramp', () => {
    const size = 96
    const field = quantize8(radialField(size, size, { x: 44, y: 50 }, 80, STOPS))
    const result = fitRegion(fieldToPixels(field), DEFAULT_FIT_OPTIONS, field)
    expect(result.fit.kind).toBe('radial')
    expect(result.accepted).toBe(true)
  })

  it('rejects an angular rainbow: no model fits and the field is not smooth', () => {
    const size = 96
    const field = hsvField(size, size, (x, y) => (Math.atan2(y - 48, x - 48) * 180) / Math.PI)
    const result = fitRegion(fieldToPixels(field), DEFAULT_FIT_OPTIONS, field)
    expect(result.accepted).toBe(false)
    expect(result.smooth).toBe(false)
  })

  it('rejects pure noise', () => {
    const size = 64
    const base = solidField(size, size, { r: 0.5, g: 0.5, b: 0.5 })
    const field = withNoise(base, 0.15, mulberry32(5))
    const result = fitRegion(fieldToPixels(field), DEFAULT_FIT_OPTIONS, field)
    expect(result.accepted).toBe(false)
    expect(result.smooth).toBe(false)
  })
})
