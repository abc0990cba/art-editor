import { describe, expect, it } from 'vitest'

import { fitLinear } from './fit-linear.ts'
import { fitRadial } from './fit-radial.ts'
import {
  fieldToPixels,
  linearField,
  mulberry32,
  quantize8,
  radialField,
  withNoise,
} from './synth.util.ts'
import { DEFAULT_FIT_OPTIONS, type GradStop } from './types.ts'

const STOPS: GradStop[] = [
  { offset: 0, color: { r: 0.95, g: 0.85, b: 0.2 } },
  { offset: 0.5, color: { r: 0.85, g: 0.3, b: 0.15 } },
  { offset: 1, color: { r: 0.2, g: 0.1, b: 0.4 } },
]

describe('fitRadial', () => {
  it('recovers the center of a banded noisy radial ramp', () => {
    const size = 96
    const center = { x: 40, y: 52 }
    const field = quantize8(
      withNoise(radialField(size, size, center, 78, STOPS), 2 / 255, mulberry32(11)),
    )
    const fit = fitRadial(fieldToPixels(field), field, DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit || fit.kind !== 'radial') return
    const centerErr = Math.hypot(fit.center.x - center.x, fit.center.y - center.y)
    expect(centerErr).toBeLessThan(1.5)
    expect(fit.stops.length).toBeGreaterThanOrEqual(2)
    expect(fit.stops.length).toBeLessThanOrEqual(4)
    expect(fit.error.mean).toBeLessThanOrEqual(2)
  })

  it('rejects a linear field: the normals are parallel', () => {
    const size = 64
    const field = linearField(
      size,
      size,
      { x: 0, y: 0 },
      { x: size * 0.85, y: 0 },
      STOPS.slice(0, 2),
    )
    const fit = fitRadial(fieldToPixels(field), field, DEFAULT_FIT_OPTIONS)
    expect(fit).toBeNull()
  })

  it('does not confuse fitLinear on the same radial field', () => {
    const size = 96
    const field = radialField(size, size, { x: 48, y: 48 }, 80, STOPS)
    const linear = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(linear).not.toBeNull()
    if (!linear) return
    // a linear approximation of a radial ramp must stay visibly worse than the tolerance
    expect(linear.error.mean).toBeGreaterThan(DEFAULT_FIT_OPTIONS.deltaETolerance)
  })
})
