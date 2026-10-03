import { describe, expect, it } from 'vitest'

import { oklabLightness, oklabToRgb, rgbToOklab } from './index.ts'

const close = (a: number, b: number, eps = 1e-3): boolean => Math.abs(a - b) < eps

describe('oklab round-trips', () => {
  it('round-trips white, black and primaries within one bit', () => {
    const colors = [
      { r: 1, g: 1, b: 1 },
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.9, g: 0.64, b: 0.2 },
    ]
    for (const c of colors) {
      const back = oklabToRgb(rgbToOklab(c))
      expect(close(back.r, c.r, 1 / 255)).toBe(true)
      expect(close(back.g, c.g, 1 / 255)).toBe(true)
      expect(close(back.b, c.b, 1 / 255)).toBe(true)
    }
  })

  it('keeps OKLab reference values for red (Ottosson table)', () => {
    const lab = rgbToOklab({ r: 1, g: 0, b: 0 })
    expect(close(lab.L, 0.627955, 1e-4)).toBe(true)
    expect(close(lab.a, 0.224863, 1e-4)).toBe(true)
    expect(close(lab.b, 0.125846, 1e-4)).toBe(true)
  })

  it('orders lightness monotonically along a gray ramp', () => {
    let prev = -1
    for (let i = 0; i <= 10; i++) {
      const v = i / 10
      const L = oklabLightness({ r: v, g: v, b: v })
      expect(L).toBeGreaterThan(prev)
      prev = L
    }
  })

  it('clamps out-of-gamut interpolations into sRGB', () => {
    const back = oklabToRgb({ L: 0.5, a: 0.4, b: -0.4 })
    expect(back.r).toBeGreaterThanOrEqual(0)
    expect(back.r).toBeLessThanOrEqual(1)
    expect(back.b).toBeGreaterThanOrEqual(0)
    expect(back.b).toBeLessThanOrEqual(1)
  })
})
