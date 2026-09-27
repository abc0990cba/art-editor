/**
 * Exact stop colors for fixed stop positions: every sample votes into a symmetric tridiagonal
 * normal system with hat-function weights (each sample pulls its two neighbouring stops), solved by
 * the Thomas algorithm per channel. A coordinate-descent pass then nudges interior stop offsets,
 * refitting colors after every move and keeping changes that lower mean ΔE2000.
 */

import { clamp01, deltaE2000Rgb } from './color.ts'
import { thomasSym } from './linalg.ts'
import type { GradStop, RGB } from './types.ts'

/** Least-squares stop colors for fixed, strictly increasing offsets. */
export function fitStopColors(
  ts: Float32Array,
  colors: Float32Array,
  weights: Float32Array,
  offsets: number[],
): GradStop[] {
  const k = offsets.length
  const diag = new Array<number>(k).fill(0)
  const off = new Array<number>(Math.max(0, k - 1)).fill(0)
  const rhs = [
    new Array<number>(k).fill(0),
    new Array<number>(k).fill(0),
    new Array<number>(k).fill(0),
  ]
  for (let i = 0; i < ts.length; i++) {
    const t = clamp01(ts[i])
    const seg = segmentFor(offsets, t)
    const gap = offsets[seg + 1] - offsets[seg]
    if (gap < 1e-6) continue
    const u = (t - offsets[seg]) / gap
    const a = 1 - u
    const b = u
    const w = weights[i]
    diag[seg] += w * a * a
    diag[seg + 1] += w * b * b
    off[seg] += w * a * b
    for (let ch = 0; ch < 3; ch++) rhs[ch][seg] += w * a * colors[i * 3 + ch]
    for (let ch = 0; ch < 3; ch++) rhs[ch][seg + 1] += w * b * colors[i * 3 + ch]
  }
  // Tiny ridge: a trial offset set in refineStops may leave a segment without samples; the system
  // must stay solvable (the unconstrained stop collapses to black and the trial is then rejected
  // by the ΔE test).
  for (let j = 0; j < k; j++) diag[j] += 1e-6
  const solved = [0, 1, 2].map((ch) => thomasSym(off, diag, rhs[ch]))
  return offsets.map((o, j) => ({
    offset: o,
    color: { r: clamp01(solved[0][j]), g: clamp01(solved[1][j]), b: clamp01(solved[2][j]) },
  }))
}

/** Piecewise-linear ramp color at `t` with pad-clamped ends (matches SVG spreadMethod="pad"). */
export function stopColorAt(stops: GradStop[], t: number): RGB {
  const n = stops.length
  if (n === 0) return { r: 0, g: 0, b: 0 }
  const first = stops[0]
  const last = stops[n - 1]
  if (t <= first.offset) return first.color
  if (t >= last.offset) return last.color
  let lo = 0
  let hi = n - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (stops[mid].offset <= t) lo = mid
    else hi = mid - 1
  }
  const a = stops[lo]
  const b = stops[lo + 1]
  const u = (t - a.offset) / Math.max(1e-9, b.offset - a.offset)
  return {
    r: a.color.r + u * (b.color.r - a.color.r),
    g: a.color.g + u * (b.color.g - a.color.g),
    b: a.color.b + u * (b.color.b - a.color.b),
  }
}

/**
 * Coordinate descent on interior stop offsets (±1/3 of the local gap, `sweeps` passes); colors are
 * refit for every trial and a move is kept only when weighted mean ΔE2000 improves.
 */
export function refineStops(
  ts: Float32Array,
  colors: Float32Array,
  weights: Float32Array,
  stops: GradStop[],
  sweeps = 2,
): GradStop[] {
  let cur = stops
  let best = meanDE(ts, colors, weights, cur)
  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (let k = 1; k < cur.length - 1; k++) {
      const gap = Math.min(cur[k].offset - cur[k - 1].offset, cur[k + 1].offset - cur[k].offset)
      const delta = gap / 3
      if (delta < 1e-4) continue
      for (const dir of [-1, 1]) {
        const trial = cur.map((s) => s.offset)
        trial[k] += dir * delta
        const fitted = fitStopColors(ts, colors, weights, trial)
        const de = meanDE(ts, colors, weights, fitted)
        if (de < best - 1e-4) {
          best = de
          cur = fitted
        }
      }
    }
  }
  return cur
}

/** Weighted mean ΔE2000 between the samples and the stop ramp evaluated at their coordinates. */
export function meanDE(
  ts: Float32Array,
  colors: Float32Array,
  weights: Float32Array,
  stops: GradStop[],
): number {
  let sum = 0
  let wSum = 0
  for (let i = 0; i < ts.length; i++) {
    const c = stopColorAt(stops, clamp01(ts[i]))
    const de = deltaE2000Rgb({ r: colors[i * 3], g: colors[i * 3 + 1], b: colors[i * 3 + 2] }, c)
    sum += de * weights[i]
    wSum += weights[i]
  }
  return wSum > 0 ? sum / wSum : 0
}

/** Index of the ramp segment containing `t` (binary search over sorted offsets). */
function segmentFor(offsets: number[], t: number): number {
  let lo = 0
  let hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}
