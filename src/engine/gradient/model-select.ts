/**
 * Model selection per region: fit solid → linear → radial and keep the simplest model whose mean ΔE
 * stays within tolerance; if none fits, return the closest one with accepted=false (the caller
 * should split the region or hand it to the layered stage). A quadratic color-surface regression
 * acts as the smoothness gate: on non-smooth fields gradient models are meaningless.
 */

import { deltaE2000Rgb } from './color.ts'
import { fitLinear } from './fit-linear.ts'
import { fitRadial } from './fit-radial.ts'
import { solveLinearSystem } from './linalg.ts'
import { evaluateFit } from './render.ts'
import {
  DEFAULT_FIT_OPTIONS,
  type FitOptions,
  type FitResult,
  type GradFit,
  type RGB,
  type RegionPixels,
  type RgbField,
} from './types.ts'

/** Fit the region with the simplest acceptable paint model (solid → linear → radial). */
export function fitRegion(
  pixels: RegionPixels,
  opts?: Partial<FitOptions>,
  field?: RgbField,
): FitResult {
  const o: FitOptions = { ...DEFAULT_FIT_OPTIONS, ...opts }
  const candidates: GradFit[] = [solidFit(pixels)]
  const linear = fitLinear(pixels, o)
  if (linear) candidates.push(linear)
  if (field) {
    const radial = fitRadial(pixels, field, o)
    if (radial) candidates.push(radial)
  }
  let best = candidates[0]
  for (const c of candidates) {
    if (c.error.mean <= o.deltaETolerance) {
      best = c
      break
    }
    if (c.error.mean < best.error.mean) best = c
  }
  return {
    fit: best,
    accepted: best.error.mean <= o.deltaETolerance,
    smooth: quadResidualDE(pixels) <= o.smoothnessDE,
  }
}

/** Weighted mean sRGB color of the samples as the degenerate solid model. */
function solidFit(pixels: RegionPixels): GradFit {
  let r = 0
  let g = 0
  let b = 0
  let wSum = 0
  for (let i = 0; i < pixels.count; i++) {
    const w = pixels.weights[i]
    r += w * pixels.rgb[i * 3]
    g += w * pixels.rgb[i * 3 + 1]
    b += w * pixels.rgb[i * 3 + 2]
    wSum += w
  }
  const color = wSum > 0 ? { r: r / wSum, g: g / wSum, b: b / wSum } : { r: 0, g: 0, b: 0 }
  const fit: GradFit = { kind: 'solid', color, error: { mean: 0, p95: 0 } }
  fit.error = evaluateFit(fit, pixels)
  return fit
}

/**
 * Mean ΔE2000 left by the best quadratic color surface c(x, y) — the smoothness gate. Coordinates
 * are centered and scaled by the region extent so the 6×6 normal equations stay well-conditioned.
 */
export function quadResidualDE(pixels: RegionPixels): number {
  if (pixels.count < 8) return Infinity
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < pixels.count; i++) {
    minX = Math.min(minX, pixels.xs[i])
    maxX = Math.max(maxX, pixels.xs[i])
    minY = Math.min(minY, pixels.ys[i])
    maxY = Math.max(maxY, pixels.ys[i])
  }
  const extent = Math.max(1e-6, Math.max(maxX - minX, maxY - minY))
  const stride = Math.max(1, Math.ceil(pixels.count / 4096))
  const m: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
  const rhs: number[][] = Array.from({ length: 3 }, () => new Array<number>(6).fill(0))
  let used = 0
  for (let i = 0; i < pixels.count; i += stride) {
    const xn = (pixels.xs[i] - minX) / extent
    const yn = (pixels.ys[i] - minY) / extent
    const v = [1, xn, yn, xn * xn, xn * yn, yn * yn]
    const w = pixels.weights[i]
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) m[a][b] += w * v[a] * v[b]
      for (let ch = 0; ch < 3; ch++) rhs[ch][a] += w * v[a] * pixels.rgb[i * 3 + ch]
    }
    used++
  }
  if (used < 8) return Infinity
  let sum = 0
  let wSum = 0
  try {
    const coef = [0, 1, 2].map((ch) => solveLinearSystem(m, rhs[ch]))
    for (let i = 0; i < pixels.count; i += stride) {
      const xn = (pixels.xs[i] - minX) / extent
      const yn = (pixels.ys[i] - minY) / extent
      const v = [1, xn, yn, xn * xn, xn * yn, yn * yn]
      const pred0 = [0, 0, 0]
      for (let a = 0; a < 6; a++) {
        for (let ch = 0; ch < 3; ch++) pred0[ch] += coef[ch][a] * v[a]
      }
      const pred: RGB = { r: pred0[0], g: pred0[1], b: pred0[2] }
      const de = deltaE2000Rgb(pred, {
        r: pixels.rgb[i * 3],
        g: pixels.rgb[i * 3 + 1],
        b: pixels.rgb[i * 3 + 2],
      })
      sum += de * pixels.weights[i]
      wSum += pixels.weights[i]
    }
  } catch {
    return Infinity
  }
  return wSum > 0 ? sum / wSum : Infinity
}
