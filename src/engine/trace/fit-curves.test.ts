import { describe, expect, it } from 'vitest'

import { fitChain, turnDeg } from './fit-curves.ts'

function cubicPoint(c: number[], t: number): [number, number] {
  const omt = 1 - t
  const x =
    omt * omt * omt * c[0] + 3 * omt * omt * t * c[2] + 3 * omt * t * t * c[4] + t * t * t * c[6]
  const y =
    omt * omt * omt * c[1] + 3 * omt * omt * t * c[3] + 3 * omt * t * t * c[5] + t * t * t * c[7]
  return [x, y]
}

function maxDeviation(chain: number[], cubics: number[]): number {
  let max = 0
  for (let i = 0; i < chain.length / 2; i++) {
    const [px, py] = [chain[i * 2], chain[i * 2 + 1]]
    let best = Number.POSITIVE_INFINITY
    for (let c = 0; c < cubics.length; c += 8) {
      for (let t = 0; t <= 1.0005; t += 0.0005) {
        const [qx, qy] = cubicPoint(cubics.slice(c, c + 8), t)
        best = Math.min(best, Math.hypot(px - qx, py - qy))
      }
    }
    max = Math.max(max, best)
  }
  return max
}

describe('fitChain', () => {
  it('fits a straight line with negligible error', () => {
    const chain: number[] = []
    for (let x = 0; x <= 32; x++) chain.push(x, 7)
    const cubics = fitChain(chain, 0.5, 10)
    expect(cubics.length).toBe(8) // one cubic
    expect(maxDeviation(chain, cubics)).toBeLessThan(0.01)
  })

  it('fits a semicircle within the error bound', () => {
    const chain: number[] = []
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI
      chain.push(20 + 15 * Math.cos(a), 20 + 15 * Math.sin(a))
    }
    const cubics = fitChain(chain, 0.5, 10)
    expect(cubics.length).toBeGreaterThanOrEqual(8)
    expect(maxDeviation(chain, cubics)).toBeLessThan(0.5)
  })

  it('passes through the chain endpoints', () => {
    const chain = [0, 0, 4, 5, 10, 3, 18, 8]
    const cubics = fitChain(chain, 0.5, 10)
    expect(cubics[0]).toBe(0)
    expect(cubics[1]).toBe(0)
    expect(cubics[cubics.length - 2]).toBe(18)
    expect(cubics[cubics.length - 1]).toBe(8)
  })

  it('produces continuous cubics across splits', () => {
    const chain: number[] = []
    for (let i = 0; i <= 30; i++) {
      const t = i / 30
      chain.push(t * 40, 10 * Math.sin(t * Math.PI * 2))
    }
    const cubics = fitChain(chain, 0.05, 10)
    for (let c = 8; c < cubics.length; c += 8) {
      expect(cubics[c]).toBeCloseTo(cubics[c - 2], 6)
      expect(cubics[c + 1]).toBeCloseTo(cubics[c - 1], 6)
    }
  })
})

describe('turnDeg', () => {
  it('is 0 on a straight run and 90 at a right angle', () => {
    expect(turnDeg([0, 0], [1, 0], [2, 0])).toBeCloseTo(0)
    expect(turnDeg([0, 0], [1, 0], [1, 1])).toBeCloseTo(90)
    expect(turnDeg([0, 0], [2, 0], [2, 1])).toBeCloseTo(90)
    expect(turnDeg([0, 0], [2, 0], [2, -1])).toBeCloseTo(90)
    expect(turnDeg([0, 0], [1, 0], [0, 0])).toBeCloseTo(180)
  })
})
