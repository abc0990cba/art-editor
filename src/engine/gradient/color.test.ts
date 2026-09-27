import { describe, expect, it } from 'vitest'

import { deltaE2000, labToSrgb, rgbToHex, srgbToLab } from './color.ts'
import type { RGB } from './types.ts'

describe('srgbToLab / labToSrgb', () => {
  it('round-trips colors within 8-bit precision', () => {
    const samples: RGB[] = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 1, g: 0, b: 0 },
      { r: 0.2, g: 0.65, b: 0.9 },
      { r: 0.5, g: 0.1, b: 0.33 },
    ]
    for (const c of samples) {
      const back = labToSrgb(srgbToLab(c))
      expect(Math.abs(back.r - c.r)).toBeLessThan(0.004)
      expect(Math.abs(back.g - c.g)).toBeLessThan(0.004)
      expect(Math.abs(back.b - c.b)).toBeLessThan(0.004)
    }
  })

  it('maps white and black to Lab anchors', () => {
    expect(srgbToLab({ r: 1, g: 1, b: 1 }).L).toBeCloseTo(100, 0)
    expect(srgbToLab({ r: 0, g: 0, b: 0 }).L).toBe(0)
  })
})

describe('deltaE2000', () => {
  it('matches the Sharma reference pair', () => {
    const de = deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })
    expect(de).toBeCloseTo(2.0425, 3)
  })

  it('is zero for identical colors and grows with distance', () => {
    const a = srgbToLab({ r: 0.3, g: 0.6, b: 0.2 })
    expect(deltaE2000(a, a)).toBe(0)
    const b = srgbToLab({ r: 0.9, g: 0.1, b: 0.1 })
    expect(deltaE2000(a, b)).toBeGreaterThan(20)
  })
})

describe('rgbToHex', () => {
  it('formats #rrggbb with clamping', () => {
    expect(rgbToHex({ r: 1, g: 0.5, b: 0 })).toBe('#ff8000')
    expect(rgbToHex({ r: -1, g: 2, b: 0.251 })).toBe('#00ff40')
  })
})
