import { describe, expect, it } from 'vitest'

import { mustHex } from './index.ts'
import { rgbToOklab } from './index.ts'
import { mixColor, paintToCss, rampStops, sortStops, stopAlphaAt, stopColorAt } from './index.ts'
import type { GradStop } from './index.ts'

const ORANGE = mustHex('#ff8000')
const PURPLE = mustHex('#330099')

const STOPS: GradStop[] = [
  { offset: 0.2, color: ORANGE, alpha: 1 },
  { offset: 0.8, color: PURPLE, alpha: 0.5 },
]

describe('stop evaluation (pad semantics)', () => {
  it('pads outside the end stops', () => {
    expect(stopColorAt(STOPS, -1)).toEqual(ORANGE)
    expect(stopColorAt(STOPS, 1.5)).toEqual(PURPLE)
    expect(stopAlphaAt(STOPS, 0)).toBe(1)
    expect(stopAlphaAt(STOPS, 0.9)).toBe(0.5)
  })

  it('interpolates linearly between stops', () => {
    const mid = stopColorAt(STOPS, 0.5)
    expect(mid.r).toBeCloseTo((ORANGE.r + PURPLE.r) / 2, 5)
    expect(stopAlphaAt(STOPS, 0.5)).toBeCloseTo(0.75, 5)
  })

  it('sorts unsorted stops before evaluating', () => {
    const unsorted: GradStop[] = [...STOPS].reverse()
    expect(stopColorAt(unsorted, 0.21)).toEqual(stopColorAt(STOPS, 0.21))
    expect(sortStops(unsorted)[0]?.offset).toBe(0.2)
  })

  it('handles empty and single-stop lists', () => {
    expect(stopColorAt([], 0.5)).toEqual({ r: 0, g: 0, b: 0 })
    const single: GradStop[] = [{ offset: 0.4, color: ORANGE, alpha: 0.3 }]
    expect(stopColorAt(single, 0.9)).toEqual(ORANGE)
    expect(stopAlphaAt(single, 0.1)).toBe(0.3)
  })
})

describe('rampStops', () => {
  it('generates evenly spaced stops in both spaces', () => {
    for (const space of ['srgb', 'oklab'] as const) {
      const stops = rampStops(ORANGE, PURPLE, 5, space)
      expect(stops).toHaveLength(5)
      expect(stops[0]?.offset).toBe(0)
      expect(stops[4]?.offset).toBe(1)
      expect(stops[2]?.offset).toBe(0.5)
    }
  })

  it('keeps lightness linear along the ramp where sRGB dips (blue→red)', () => {
    const blue = mustHex('#0000ff')
    const red = mustHex('#ff0000')
    const lBlue = rgbToOklab(blue).L
    const lRed = rgbToOklab(red).L
    const midLinear = (lBlue + lRed) / 2
    const oklabL = rgbToOklab(mixColor(blue, red, 0.5, 'oklab')).L
    const srgbL = rgbToOklab(mixColor(blue, red, 0.5, 'srgb')).L
    expect(oklabL).toBeCloseTo(midLinear, 3)
    // The sRGB midpoint of blue→red is a visibly darker muddy purple.
    expect(srgbL).toBeLessThan(midLinear - 0.05)
  })

  it('interpolates endpoint alphas', () => {
    const stops = rampStops(ORANGE, PURPLE, 3, 'srgb', { from: 0, to: 1 })
    expect(stops[0]?.alpha).toBe(0)
    expect(stops[2]?.alpha).toBe(1)
  })
})

describe('paintToCss (editor stop bars)', () => {
  it('renders solid paints as hex or rgba', () => {
    expect(paintToCss({ kind: 'solid', color: ORANGE, alpha: 1 })).toBe('#ff8000')
    expect(paintToCss({ kind: 'solid', color: ORANGE, alpha: 0.25 })).toBe(
      'rgba(255, 128, 0, 0.25)',
    )
  })

  it('renders linear paints with percentage offsets', () => {
    const css = paintToCss({
      kind: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      stops: STOPS,
      alpha: 1,
    })
    expect(css).toContain('linear-gradient(90deg')
    expect(css).toContain('#ff8000 20.0%')
    expect(css).toContain('rgba(51, 0, 153, 0.5) 80.0%')
  })

  it('renders bbox radials in fractions and user radials via the shape bbox', () => {
    const bbox = { x: 0, y: 0, w: 200, h: 100 }
    const bboxPaint = {
      kind: 'radial',
      units: 'bbox',
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      fx: null,
      fy: null,
      stops: STOPS,
      alpha: 1,
    } as const
    expect(paintToCss(bboxPaint, bbox)).toContain('circle at 50.0% 50.0%')
    const userPaint = { ...bboxPaint, units: 'user', cx: 100, cy: 50 } as const
    expect(paintToCss(userPaint, bbox)).toContain('circle at 50.0% 50.0%')
  })
})
