import { describe, expect, it } from 'vitest'

import {
  BAYER2,
  BAYER16,
  BLUE_NOISE8,
  CLUSTER4,
  HALFTONE4,
  PATTERN8,
  VOID_CLUSTER8,
  crosshatchAt,
  thresholdAt,
} from './dither-matrices'

describe('ordered matrices', () => {
  it('has the documented shapes', () => {
    expect(BAYER2).toHaveLength(2)
    expect(CLUSTER4).toHaveLength(4)
    expect(HALFTONE4).toHaveLength(4)
    expect(BLUE_NOISE8).toHaveLength(8)
    expect(VOID_CLUSTER8).toHaveLength(8)
    expect(PATTERN8).toHaveLength(8)
    expect(BAYER16).toHaveLength(16)
    for (const row of BLUE_NOISE8) expect(row).toHaveLength(8)
  })

  it('keeps every rank inside its level range', () => {
    const inRange = (m: number[][], levels: number) =>
      m.every((row) => row.every((v) => v >= 0 && v < levels))
    expect(inRange(CLUSTER4, 16)).toBe(true)
    expect(inRange(HALFTONE4, 16)).toBe(true)
    expect(inRange(BLUE_NOISE8, 16)).toBe(true)
    expect(inRange(VOID_CLUSTER8, 256)).toBe(true)
    expect(inRange(PATTERN8, 32)).toBe(true)
  })

  it('thresholdAt maps ranks into [0, 1) and tiles by matrix size', () => {
    expect(thresholdAt(CLUSTER4, 4, 16, 1, 1)).toBeCloseTo(0.5 / 16)
    // position 17 ≡ 1 (mod 4)
    expect(thresholdAt(CLUSTER4, 4, 16, 17, 1)).toBeCloseTo(thresholdAt(CLUSTER4, 4, 16, 1, 1))
    for (let x = 0; x < 8; x++) {
      const v = thresholdAt(BLUE_NOISE8, 8, 16, x, 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('crosshatchAt stays in [0, 1] with known extremes', () => {
    for (let i = 0; i < 64; i++) {
      const v = crosshatchAt(i * 3, i * 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    // at the origin both sines are 0 → v = 128 → 1 - 128/255
    expect(crosshatchAt(0, 0)).toBeCloseTo(1 - 128 / 255, 5)
    // x = π makes sin(x/2) = 1 → v = 192
    expect(crosshatchAt(Math.PI, 0)).toBeCloseTo(1 - 192 / 255, 5)
  })
})
