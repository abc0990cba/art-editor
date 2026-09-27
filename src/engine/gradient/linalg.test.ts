import { describe, expect, it } from 'vitest'

import { eig2x2Symmetric, solveLinearSystem, thomasSym } from './linalg.ts'

function applyMatrix(a: number[][], x: number[]): number[] {
  return a.map((row) => row.reduce((s, v, i) => s + v * x[i], 0))
}

describe('solveLinearSystem', () => {
  it('solves a diagonal system exactly', () => {
    const x = solveLinearSystem(
      [
        [2, 0, 0],
        [0, 4, 0],
        [0, 0, 8],
      ],
      [2, 8, 24],
    )
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(2)
    expect(x[2]).toBeCloseTo(3)
  })

  it('solves a pivoting-requiring system (A·x ≈ b)', () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ]
    const x = solveLinearSystem(a, [1, 2, 3])
    const ax = applyMatrix(a, x)
    expect(ax[0]).toBeCloseTo(1, 9)
    expect(ax[1]).toBeCloseTo(2, 9)
    expect(ax[2]).toBeCloseTo(3, 9)
  })

  it('throws on a singular system', () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow()
  })
})

describe('eig2x2Symmetric', () => {
  it('handles a diagonal matrix', () => {
    const e = eig2x2Symmetric(2, 0, 1)
    expect(e.l1).toBeCloseTo(2)
    expect(e.l2).toBeCloseTo(1)
    expect(Math.abs(e.v.x)).toBeCloseTo(1)
  })

  it('satisfies A·v = l1·v for a degenerate matrix', () => {
    const e = eig2x2Symmetric(1, 1, 1)
    expect(e.l1).toBeCloseTo(2)
    expect(Math.abs(e.v.x)).toBeCloseTo(Math.SQRT1_2)
    expect(Math.abs(e.v.y)).toBeCloseTo(Math.SQRT1_2)
  })

  it('satisfies A·v = l1·v for a rotated case', () => {
    const m11 = 3
    const m12 = 1
    const m22 = 0.5
    const e = eig2x2Symmetric(m11, m12, m22)
    const av = { x: m11 * e.v.x + m12 * e.v.y, y: m12 * e.v.x + m22 * e.v.y }
    expect(av.x).toBeCloseTo(e.l1 * e.v.x, 9)
    expect(av.y).toBeCloseTo(e.l1 * e.v.y, 9)
  })
})

describe('thomasSym', () => {
  it('matches the dense solver on a tridiagonal system', () => {
    const diag = [3, 2, 3, 2, 4]
    const off = [1, 1, 0.5, 1]
    const d = [5, 4, 6, 5, 8]
    const n = d.length
    const dense: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < n; i++) {
      dense[i][i] = diag[i]
      if (i < n - 1) {
        dense[i][i + 1] = off[i]
        dense[i + 1][i] = off[i]
      }
    }
    const denseX = solveLinearSystem(dense, d)
    const thomasX = thomasSym(off, diag, d)
    for (let i = 0; i < n; i++) expect(thomasX[i]).toBeCloseTo(denseX[i], 9)
  })
})
