/**
 * Generated blue-noise threshold matrices: greedy farthest-point sampling on a torus gives an
 * aperiodic, evenly dispersed rank order (best-candidate blue noise) without shipping large
 * hand-measured tables. Deterministic; masks are computed once and memoized. Pure.
 */

import { mulberry32 } from '../texture/core.ts'
import type { OrderedMatrix } from './matrices.ts'

const toroid = (n: number, d: number): number => {
  const m = ((d % n) + n) % n
  return Math.min(m, n - m)
}

/**
 * Rank every cell by repeated farthest-point placement: rank 0 is the seeded first cell, every next
 * rank goes to the cell with the largest squared toroidal distance to all placed ranks (lowest
 * index breaks ties). The result is a permutation of 0..n²-1.
 */
export function blueNoiseMatrix(n: number, seed: number): OrderedMatrix {
  const total = n * n
  const minDist = new Float64Array(total).fill(Infinity)
  const rankOf = new Int32Array(total)
  const first = Math.floor(mulberry32(seed)() * total)
  for (let rank = 0; rank < total; rank++) {
    let best = first
    let bestDist = -1
    for (let i = 0; i < total; i++) {
      if (minDist[i] > bestDist) {
        bestDist = minDist[i]
        best = i
      }
    }
    rankOf[best] = rank
    minDist[best] = -1
    const bx = best % n
    const by = (best - bx) / n
    for (let i = 0; i < total; i++) {
      if (minDist[i] < 0) continue
      const x = i % n
      const y = (i - x) / n
      const dx = toroid(n, x - bx)
      const dy = toroid(n, y - by)
      const d = dx * dx + dy * dy
      if (d < minDist[i]) minDist[i] = d
    }
  }
  const out: number[][] = []
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) row.push(rankOf[y * n + x])
    out.push(row)
  }
  return out
}

let blue16: OrderedMatrix | null = null

/** The 16×16 blue-noise mask, generated on first use and memoized. */
export function blueNoise16(): OrderedMatrix {
  if (!blue16) blue16 = blueNoiseMatrix(16, 0x9e_37_79_b9)
  return blue16
}
