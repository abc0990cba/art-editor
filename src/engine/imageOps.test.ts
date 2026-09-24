import { describe, expect, it } from 'vitest'

import {
  chromaticAberrationRGBA,
  gaussianBlurRGBA,
  glowScreenRGBA,
  hueRotateRGBA,
  medianDenoiseRGBA,
  sharpenRGBA,
} from './imageOps'

const buf = (
  w: number,
  h: number,
  px: (x: number, y: number) => [number, number, number, number],
): Float64Array => {
  const out = new Float64Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      const o = (y * w + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  }
  return out
}

const at = (b: Float64Array, w: number, x: number, y: number): number[] => {
  const o = (y * w + x) * 4
  return [b[o], b[o + 1], b[o + 2], b[o + 3]]
}

describe('gaussianBlurRGBA', () => {
  it('keeps a solid buffer identical', () => {
    const b = buf(6, 6, () => [100, 120, 140, 255])
    gaussianBlurRGBA(b, 6, 6, 2)
    for (let i = 0; i < b.length; i += 4) {
      expect(b[i]).toBeCloseTo(100)
      expect(b[i + 1]).toBeCloseTo(120)
      expect(b[i + 2]).toBeCloseTo(140)
      expect(b[i + 3]).toBeCloseTo(255)
    }
  })

  it('spreads an impulse into the neighborhood deterministically', () => {
    const make = () =>
      buf(9, 9, (x, y) => (x === 4 && y === 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    const a = make()
    const b = make()
    expect(Array.from(a)).toEqual(Array.from(b))
    gaussianBlurRGBA(a, 9, 9, 1.5)
    expect(at(a, 9, 4, 4)[0]).toBeLessThan(255)
    expect(at(a, 9, 3, 4)[0]).toBeGreaterThan(0)
    expect(at(a, 9, 0, 0)[0]).toBe(0)
  })

  it('ignores non-positive radii', () => {
    const b = buf(4, 4, (x) => [x * 60, 0, 0, 255])
    const before = Array.from(b)
    gaussianBlurRGBA(b, 4, 4, 0)
    expect(Array.from(b)).toEqual(before)
  })
})

describe('sharpenRGBA', () => {
  it('increases contrast across a soft edge', () => {
    const b = buf(8, 4, (x) => [80 + x * 12, 80 + x * 12, 80 + x * 12, 255])
    const flat = Array.from(b)
    sharpenRGBA(b, 8, 4, 1)
    const spread = (arr: number[]) =>
      arr.filter((_, i) => i % 4 === 0).reduce((a, v) => Math.max(a, v)) -
      arr.filter((_, i) => i % 4 === 0).reduce((a, v) => Math.min(a, v))
    expect(spread(Array.from(b))).toBeGreaterThanOrEqual(spread(flat))
  })

  it('leaves the buffer unchanged at amount 0', () => {
    const b = buf(4, 4, () => [50, 60, 70, 255])
    const before = Array.from(b)
    sharpenRGBA(b, 4, 4, 0)
    expect(Array.from(b)).toEqual(before)
  })
})

describe('hueRotateRGBA', () => {
  it('rotates pure red to green at +120°', () => {
    const b = buf(2, 2, () => [255, 0, 0, 255])
    hueRotateRGBA(b, 120)
    const [r, g, bl] = at(b, 2, 0, 0)
    expect(r).toBeLessThan(10)
    expect(g).toBeGreaterThan(245)
    expect(bl).toBeLessThan(10)
  })

  it('keeps grays and transparent pixels intact', () => {
    const b = buf(2, 2, (x, y) => (x === 0 && y === 0 ? [128, 128, 128, 255] : [0, 0, 0, 0]))
    const before = Array.from(b)
    hueRotateRGBA(b, 90)
    expect(Array.from(b)).toEqual(before)
  })
})

describe('medianDenoiseRGBA', () => {
  it('removes a salt-pepper speck from a dark field', () => {
    const b = buf(7, 7, (x, y) => (x === 3 && y === 3 ? [255, 255, 255, 255] : [10, 10, 10, 255]))
    medianDenoiseRGBA(b, 7, 7, 1)
    expect(at(b, 7, 3, 3)[0]).toBe(10)
  })

  it('keeps a uniform field identical', () => {
    const b = buf(5, 5, () => [42, 43, 44, 255])
    medianDenoiseRGBA(b, 5, 5, 2)
    for (let i = 0; i < b.length; i += 4) {
      expect(b[i]).toBe(42)
      expect(b[i + 1]).toBe(43)
      expect(b[i + 2]).toBe(44)
    }
  })
})

describe('glowScreenRGBA', () => {
  it('brightens dark cells next to a bright area', () => {
    const b = buf(11, 5, (x) => (x < 5 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    glowScreenRGBA(b, 11, 5, 2, 100)
    expect(at(b, 11, 7, 2)[0]).toBeGreaterThan(0)
    expect(at(b, 11, 10, 2)[0]).toBeLessThan(at(b, 11, 7, 2)[0])
  })

  it('never pushes channels out of range', () => {
    const b = buf(6, 6, () => [255, 255, 255, 255])
    glowScreenRGBA(b, 6, 6, 3, 100)
    for (let i = 0; i < b.length; i++) expect(b[i]).toBeLessThanOrEqual(255)
  })
})

describe('chromaticAberrationRGBA', () => {
  it('shifts red left and blue right', () => {
    const b = buf(8, 3, (x) =>
      x === 4 ? [255, 0, 0, 255] : x === 3 ? [0, 0, 255, 255] : [0, 0, 0, 255],
    )
    chromaticAberrationRGBA(b, 8, 3, 2)
    // red at x=4 appears at x=2; blue at x=3 appears at x=5
    expect(at(b, 8, 2, 1)[0]).toBe(255)
    expect(at(b, 8, 4, 1)[0]).toBe(0)
    expect(at(b, 8, 5, 1)[2]).toBe(255)
    expect(at(b, 8, 3, 1)[2]).toBe(0)
  })

  it('is a no-op at shift 0', () => {
    const b = buf(4, 4, () => [9, 8, 7, 255])
    const before = Array.from(b)
    chromaticAberrationRGBA(b, 4, 4, 0)
    expect(Array.from(b)).toEqual(before)
  })
})
