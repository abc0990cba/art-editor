import { describe, expect, it } from 'vitest'

import { solveLinearSystem } from './linalg.ts'
import { fitStopColors, meanDE, refineStops, stopColorAt } from './stop-colors.ts'
import { mulberry32 } from './synth.util.ts'
import type { GradStop } from './types.ts'

describe('stopColorAt', () => {
  const stops: GradStop[] = [
    { offset: 0, color: { r: 1, g: 0, b: 0 } },
    { offset: 0.5, color: { r: 0, g: 1, b: 0 } },
    { offset: 1, color: { r: 0, g: 0, b: 1 } },
  ]

  it('interpolates piecewise-linearly and pads the ends', () => {
    const mid = stopColorAt(stops, 0.25)
    expect(mid.r).toBeCloseTo(0.5)
    expect(mid.g).toBeCloseTo(0.5)
    expect(stopColorAt(stops, -0.3).r).toBe(1)
    expect(stopColorAt(stops, 1.4).b).toBe(1)
  })
})

describe('fitStopColors', () => {
  it('equals the dense normal-equation solution', () => {
    const rand = mulberry32(42)
    const offsets = [0, 0.3, 0.7, 1]
    const n = 200
    const ts = new Float32Array(n)
    const colors = new Float32Array(n * 3)
    const weights = new Float32Array(n).fill(1)
    for (let i = 0; i < n; i++) {
      ts[i] = rand()
      for (let ch = 0; ch < 3; ch++) colors[i * 3 + ch] = rand()
    }
    // dense reference: normal equations with the same hat-function basis
    const k = offsets.length
    const m: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    const rhs: number[][] = Array.from({ length: 3 }, () => new Array<number>(k).fill(0))
    for (let i = 0; i < n; i++) {
      const t = ts[i]
      let seg = 0
      while (seg < k - 2 && t > offsets[seg + 1]) seg++
      const u = (t - offsets[seg]) / (offsets[seg + 1] - offsets[seg])
      const a = 1 - u
      const b = u
      m[seg][seg] += a * a
      m[seg][seg + 1] += a * b
      m[seg + 1][seg] += a * b
      m[seg + 1][seg + 1] += b * b
      for (let ch = 0; ch < 3; ch++) {
        rhs[ch][seg] += a * colors[i * 3 + ch]
        rhs[ch][seg + 1] += b * colors[i * 3 + ch]
      }
    }
    const fitted = fitStopColors(ts, colors, weights, offsets)
    for (let ch = 0; ch < 3; ch++) {
      const dense = solveLinearSystem(m, rhs[ch])
      for (let j = 0; j < k; j++) {
        const channel =
          ch === 0 ? fitted[j].color.r : ch === 1 ? fitted[j].color.g : fitted[j].color.b
        // the fitted system carries a 1e-6 ridge, so allow a small deviation from the dense solve
        expect(channel).toBeCloseTo(dense[j], 4)
      }
    }
  })

  it('keeps colors within the device gamut', () => {
    const rand = mulberry32(1)
    const n = 50
    const ts = new Float32Array(n)
    const colors = new Float32Array(n * 3).fill(3)
    const weights = new Float32Array(n).fill(1)
    for (let i = 0; i < n; i++) ts[i] = rand()
    const fitted = fitStopColors(ts, colors, weights, [0, 1])
    for (const s of fitted) {
      expect(s.color.r).toBeLessThanOrEqual(1)
      expect(s.color.g).toBeLessThanOrEqual(1)
      expect(s.color.b).toBeLessThanOrEqual(1)
    }
  })
})

describe('refineStops', () => {
  it('moves a mispositioned interior stop toward lower error', () => {
    const rand = mulberry32(9)
    const n = 400
    const ts = new Float32Array(n)
    const colors = new Float32Array(n * 3)
    const weights = new Float32Array(n).fill(1)
    const truth: GradStop[] = [
      { offset: 0, color: { r: 0.9, g: 0.1, b: 0.1 } },
      { offset: 0.45, color: { r: 0.95, g: 0.9, b: 0.2 } },
      { offset: 1, color: { r: 0.1, g: 0.7, b: 0.8 } },
    ]
    for (let i = 0; i < n; i++) {
      ts[i] = rand()
      const u = ts[i]
      const j = u < 0.45 ? 0 : 1
      const local = j === 0 ? u / 0.45 : (u - 0.45) / 0.55
      for (let ch = 0; ch < 3; ch++) {
        const c0 = [truth[0].color.r, truth[0].color.g, truth[0].color.b][ch]
        const c1 = [truth[1].color.r, truth[1].color.g, truth[1].color.b][ch]
        const c2 = [truth[2].color.r, truth[2].color.g, truth[2].color.b][ch]
        colors[i * 3 + ch] = j === 0 ? c0 + local * (c1 - c0) : c1 + local * (c2 - c1)
      }
    }
    const mispositioned: GradStop[] = [
      { offset: 0, color: truth[0].color },
      { offset: 0.75, color: truth[1].color },
      { offset: 1, color: truth[2].color },
    ]
    const before = meanDE(ts, colors, weights, mispositioned)
    const refined = refineStops(ts, colors, weights, mispositioned)
    const after = meanDE(ts, colors, weights, refined)
    expect(after).toBeLessThan(before)
    expect(refined[1].offset).toBeLessThan(0.7)
  })
})

describe('meanDE', () => {
  it('scores an exact ramp at zero', () => {
    const ts = new Float32Array([0, 0.5, 1])
    const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    const weights = new Float32Array([1, 1, 1])
    const stops: GradStop[] = [
      { offset: 0, color: { r: 1, g: 0, b: 0 } },
      { offset: 0.5, color: { r: 0, g: 1, b: 0 } },
      { offset: 1, color: { r: 0, g: 0, b: 1 } },
    ]
    expect(meanDE(ts, colors, weights, stops)).toBeCloseTo(0, 6)
  })
})
