import { describe, expect, it } from 'vitest'

import { normalizeLoop, simplifyLoop, simplifyOpen } from './simplify.ts'

function squareWithMidpoints(): number[] {
  // 4×4 lattice square with extra collinear vertices on every side
  const pts: number[] = []
  for (let x = 0; x <= 4; x++) pts.push(x, 0)
  for (let y = 1; y <= 4; y++) pts.push(4, y)
  for (let x = 3; x >= 0; x--) pts.push(x, 4)
  for (let y = 3; y >= 1; y--) pts.push(0, y)
  return pts
}

describe('normalizeLoop', () => {
  it('collapses collinear runs to the corner vertices', () => {
    const out = normalizeLoop(squareWithMidpoints())
    expect(out).toEqual([4, 0, 4, 4, 0, 4, 0, 0])
  })
})

describe('simplifyLoop', () => {
  it('keeps a square a square', () => {
    const out = simplifyLoop(squareWithMidpoints(), 0.5)
    expect(out).toHaveLength(8)
  })

  it('is stable under cyclic rotation of the input', () => {
    const base = squareWithMidpoints()
    const rotated = [...base.slice(6), ...base.slice(0, 6)] // start from a different vertex
    const a = simplifyLoop(base, 0.5)
    const b = simplifyLoop(rotated, 0.5)
    expect(a).toHaveLength(b.length)
    expect(a.map(Number).sort()).toEqual(b.map(Number).sort())
  })
})

describe('simplifyOpen', () => {
  it('reduces a noisy straight chain to near its endpoints', () => {
    const pts: number[] = []
    for (let x = 0; x <= 20; x++) pts.push(x, x % 3 === 0 ? 0.4 : 0)
    const out = simplifyOpen(pts, 0.6)
    expect(out.length).toBeLessThanOrEqual(8)
    expect(out[0]).toBe(0)
    expect(out[out.length - 2]).toBe(20)
  })

  it('always keeps the endpoints', () => {
    const pts = [0, 0, 5, 1, 10, 0]
    const out = simplifyOpen(pts, 10)
    expect(out).toEqual([0, 0, 10, 0])
  })
})
