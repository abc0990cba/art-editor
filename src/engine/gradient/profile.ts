/**
 * Color profile along the gradient axis: binned weighted medians → Ramer–Douglas–Peucker
 * simplification with a perceptual segment metric (ΔE2000 against the stop-linear ramp) → candidate
 * stop offsets. This stage only chooses positions; colors are refined against the raw samples in
 * stop-colors.ts.
 */

import { deltaE2000Rgb } from './color.ts'
import type { RGB } from './types.ts'

export interface ProfilePoint {
  t: number
  color: RGB
}

/** Binned weighted-median color profile along the normalized gradient coordinate (0..1). */
export function buildProfile(
  ts: Float32Array,
  colors: Float32Array,
  weights: Float32Array,
  bins: number,
): ProfilePoint[] {
  const idx: number[][] = Array.from({ length: bins }, () => [])
  for (let i = 0; i < ts.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(ts[i] * bins)))
    idx[b].push(i)
  }
  const profile: ProfilePoint[] = []
  for (let b = 0; b < bins; b++) {
    if (idx[b].length === 0) continue
    const ch: number[][] = [[], [], []]
    const ws: number[] = []
    let tSum = 0
    for (const i of idx[b]) {
      tSum += ts[i]
      ch[0].push(colors[i * 3])
      ch[1].push(colors[i * 3 + 1])
      ch[2].push(colors[i * 3 + 2])
      ws.push(weights[i])
    }
    profile.push({
      t: tSum / idx[b].length,
      color: {
        r: weightedMedian(ch[0], ws),
        g: weightedMedian(ch[1], ws),
        b: weightedMedian(ch[2], ws),
      },
    })
  }
  return profile
}

/**
 * Stop offsets from the profile: vertices whose removal would bend the ramp more than `tolDE` are
 * kept. When the vertex count still exceeds `maxStops`, the tolerance is raised until it does.
 * Offsets are clamped to [0, 1] with exact 0/1 endpoints.
 */
export function simplifyProfile(points: ProfilePoint[], tolDE: number, maxStops: number): number[] {
  if (points.length === 0) return []
  if (points.length === 1) return [0]
  let kept = rdp(points, tolDE)
  let tol = tolDE
  while (kept.length > maxStops && tol < 300) {
    tol *= 2
    kept = rdp(points, tol)
  }
  const offsets = kept.map((p) => p.t)
  dedupe(offsets)
  if (offsets.length > 1) {
    offsets[0] = 0
    offsets[offsets.length - 1] = 1
  }
  return offsets.length > maxStops ? decimate(offsets, maxStops) : offsets
}

/** Classic RDP recursion; the "distance" is ΔE2000 between the point color and the ramp. */
function rdp(points: ProfilePoint[], tol: number): ProfilePoint[] {
  if (points.length <= 2) return points.slice()
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  splitRange(points, tol, 0, points.length - 1, keep)
  return points.filter((_, i) => keep[i])
}

function splitRange(
  points: ProfilePoint[],
  tol: number,
  a: number,
  b: number,
  keep: boolean[],
): void {
  let maxDE = -1
  let maxI = -1
  for (let i = a + 1; i < b; i++) {
    const de = segmentDE(points[i], points[a], points[b])
    if (de > maxDE) {
      maxDE = de
      maxI = i
    }
  }
  if (maxDE <= tol || maxI < 0) return
  keep[maxI] = true
  splitRange(points, tol, a, maxI, keep)
  splitRange(points, tol, maxI, b, keep)
}

/** ΔE2000 between the point color and the linear ramp between the segment endpoints. */
function segmentDE(p: ProfilePoint, a: ProfilePoint, b: ProfilePoint): number {
  const span = b.t - a.t
  const u = span < 1e-9 ? 0 : (p.t - a.t) / span
  return deltaE2000Rgb(p.color, {
    r: a.color.r + u * (b.color.r - a.color.r),
    g: a.color.g + u * (b.color.g - a.color.g),
    b: a.color.b + u * (b.color.b - a.color.b),
  })
}

/** Drop consecutive offsets closer than 1e-4 (bin means can coincide at plateaus). */
function dedupe(offsets: number[]): void {
  let w = 1
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] - offsets[w - 1] >= 1e-4) {
      offsets[w] = offsets[i]
      w++
    }
  }
  offsets.length = w
}

/** Last-resort even subsample keeping both endpoints (guarantees the maxStops contract). */
function decimate(offsets: number[], maxStops: number): number[] {
  const out: number[] = []
  for (let j = 0; j < maxStops; j++) {
    out.push(offsets[Math.round((j * (offsets.length - 1)) / (maxStops - 1))])
  }
  dedupe(out)
  if (out.length > 1) {
    out[0] = 0
    out[out.length - 1] = 1
  }
  return out
}

function weightedMedian(values: number[], weights: number[]): number {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  let total = 0
  for (const w of weights) total += w
  let acc = 0
  for (const i of order) {
    acc += weights[i]
    if (acc >= total / 2) return values[i]
  }
  return values[order[order.length - 1]]
}
