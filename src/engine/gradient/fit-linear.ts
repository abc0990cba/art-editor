/**
 * Linear gradient fit: weighted affine regression of each channel over (x, y) gives a color
 * Jacobian; the principal eigenvector of JᵀJ is the gradient direction (λ2/λ1 says how 1-D the
 * field is). Samples are projected onto that direction and the 1-D color profile is reduced to
 * stops (profile.ts) whose colors are refined against the raw samples (stop-colors.ts).
 */

import { eig2x2Symmetric, solveLinearSystem } from './linalg.ts'
import { buildProfile, simplifyProfile } from './profile.ts'
import { evaluateFit } from './render.ts'
import { fitStopColors, refineStops } from './stop-colors.ts'
import type { FitOptions, GradFit, RegionPixels } from './types.ts'

const MIN_SAMPLES = 8
/** Below this projection span the field is flat — solid handles it. */
const MIN_SPAN = 1e-3

export function fitLinear(pixels: RegionPixels, opts: FitOptions): GradFit | null {
  if (pixels.count < MIN_SAMPLES) return null
  let jacobian: number[][]
  try {
    jacobian = affineChannels(pixels)
  } catch {
    return null
  }
  let s11 = 0
  let s12 = 0
  let s22 = 0
  for (const c of jacobian) {
    s11 += c[1] * c[1]
    s12 += c[1] * c[2]
    s22 += c[2] * c[2]
  }
  const eig = eig2x2Symmetric(s11, s12, s22)
  if (eig.l1 < 1e-9) return null
  // Orient the axis toward increasing color (sum of channel slopes along the eigenvector).
  let rise = 0
  for (const c of jacobian) rise += c[1] * eig.v.x + c[2] * eig.v.y
  const dx = rise >= 0 ? eig.v.x : -eig.v.x
  const dy = rise >= 0 ? eig.v.y : -eig.v.y

  let tMin = Infinity
  let tMax = -Infinity
  let cx = 0
  let cy = 0
  let wSum = 0
  const ts = new Float32Array(pixels.count)
  for (let i = 0; i < pixels.count; i++) {
    const t = pixels.xs[i] * dx + pixels.ys[i] * dy
    ts[i] = t
    if (t < tMin) tMin = t
    if (t > tMax) tMax = t
    const w = pixels.weights[i]
    cx += w * pixels.xs[i]
    cy += w * pixels.ys[i]
    wSum += w
  }
  const span = tMax - tMin
  if (span < MIN_SPAN || wSum <= 0) return null
  cx /= wSum
  cy /= wSum

  const us = new Float32Array(pixels.count)
  for (let i = 0; i < pixels.count; i++) us[i] = (ts[i] - tMin) / span
  const profile = buildProfile(us, pixels.rgb, pixels.weights, opts.bins)
  if (profile.length < 2) return null
  const offsets = simplifyProfile(profile, opts.deltaETolerance, opts.maxStops)
  const stops = refineStops(
    us,
    pixels.rgb,
    pixels.weights,
    fitStopColors(us, pixels.rgb, pixels.weights, offsets),
  )

  // Anchor the axis so p1·d = tMin and p2·d = tMax: fitCoordinate projects onto (p2−p1), so the
  // centroid's own projection must cancel out of the anchor, keeping stop offsets and SVG
  // geometry in the same coordinate system.
  const anchor = cx * dx + cy * dy
  const ox = cx - anchor * dx
  const oy = cy - anchor * dy
  const fit: GradFit = {
    kind: 'linear',
    p1: { x: ox + tMin * dx, y: oy + tMin * dy },
    p2: { x: ox + tMax * dx, y: oy + tMax * dy },
    stops,
    error: { mean: 0, p95: 0 },
  }
  fit.error = evaluateFit(fit, pixels)
  return fit
}

/** Weighted affine fit per channel: [c0, jx, jy] — rows of the color Jacobian over (x, y). */
function affineChannels(pixels: RegionPixels): number[][] {
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const rhs = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < pixels.count; i++) {
    const v = [1, pixels.xs[i], pixels.ys[i]]
    const w = pixels.weights[i]
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) m[a][b] += w * v[a] * v[b]
      for (let ch = 0; ch < 3; ch++) rhs[ch][a] += w * v[a] * pixels.rgb[i * 3 + ch]
    }
  }
  return [0, 1, 2].map((ch) => solveLinearSystem(m, rhs[ch]))
}
