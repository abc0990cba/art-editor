/**
 * Small dense linear algebra, hand-rolled to keep the engine dependency-free: Gaussian elimination
 * with partial pivoting, closed-form eigen-decomposition of a symmetric 2×2 (gradient direction,
 * radial center conditioning), and the Thomas algorithm for symmetric tridiagonal systems (exact
 * stop-color refitting).
 */

import type { Vec2 } from './types.ts'

/** Solve A·x = b for a row-major square `a` by Gaussian elimination with partial pivoting. */
export function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error('singular linear system')
    const tmp = m[col]
    m[col] = m[pivot]
    m[pivot] = tmp
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col]
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  const x = new Array<number>(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n]
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c]
    x[r] = s / m[r][r]
  }
  return x
}

export interface Eig2 {
  /** Larger eigenvalue */
  l1: number
  /** Smaller eigenvalue */
  l2: number
  /** Unit eigenvector for `l1` */
  v: Vec2
}

/** Closed-form eigendecomposition of the symmetric matrix [[m11, m12], [m12, m22]]. */
export function eig2x2Symmetric(m11: number, m12: number, m22: number): Eig2 {
  const theta = 0.5 * Math.atan2(2 * m12, m11 - m22)
  const mid = (m11 + m22) / 2
  const rad = Math.hypot((m11 - m22) / 2, m12)
  return { l1: mid + rad, l2: mid - rad, v: { x: Math.cos(theta), y: Math.sin(theta) } }
}

/**
 * Solve the symmetric tridiagonal system with diagonal `diag`, equal off-diagonals `off`, and
 * right-hand side `d` by the Thomas algorithm (O(n), used per color channel).
 */
export function thomasSym(off: number[], diag: number[], d: number[]): number[] {
  const n = d.length
  if (n === 1) return [d[0] / diag[0]]
  const cp = new Array<number>(n).fill(0)
  const dp = new Array<number>(n)
  let denom = diag[0]
  if (Math.abs(denom) < 1e-12) throw new Error('singular tridiagonal system')
  dp[0] = d[0] / denom
  cp[0] = off[0] / denom
  for (let i = 1; i < n; i++) {
    denom = diag[i] - off[i - 1] * cp[i - 1]
    if (Math.abs(denom) < 1e-12) throw new Error('singular tridiagonal system')
    dp[i] = (d[i] - off[i - 1] * dp[i - 1]) / denom
    if (i < n - 1) cp[i] = off[i] / denom
  }
  const x = new Array<number>(n)
  x[n - 1] = dp[n - 1]
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1]
  return x
}
