/**
 * Radial gradient fit. Iso-color lines of a radial gradient are circles, so the image gradient at a
 * sample points at (or away from) the center; the weighted least-squares intersection of those
 * lines (normals ⊥ gradient, weights |g| with Huber reweighting) yields the center. The coordinate
 * is then t = |p − c| / r and the 1-D pipeline (profile → stops → refine) is shared with
 * fit-linear. Parallel normals (a linear field) are detected and rejected.
 */

import { eig2x2Symmetric } from './linalg.ts'
import { buildProfile, simplifyProfile } from './profile.ts'
import { evaluateFit } from './render.ts'
import { fitStopColors, refineStops } from './stop-colors.ts'
import type { FitOptions, GradFit, RgbField, RegionPixels, Vec2 } from './types.ts'

const MIN_SAMPLES = 16
/** Minimal region radius in pixels */
const MIN_RADIUS = 2
/** Below this λ2/λ1 of the normal-intersection system the lines are parallel (linear field) */
const PARALLEL_RATIO = 0.05
/** Skip samples whose image gradient vanishes */
const GRADIENT_EPS = 1e-4

export function fitRadial(pixels: RegionPixels, field: RgbField, opts: FitOptions): GradFit | null {
  const lines = gradientNormals(pixels, field)
  if (lines.length < MIN_SAMPLES) return null
  const center = intersectNormals(lines)
  if (!center) return null

  let rMax = 0
  const ts = new Float32Array(pixels.count)
  for (let i = 0; i < pixels.count; i++) {
    const r = Math.hypot(pixels.xs[i] - center.x, pixels.ys[i] - center.y)
    ts[i] = r
    if (r > rMax) rMax = r
  }
  if (rMax < MIN_RADIUS) return null
  for (let i = 0; i < ts.length; i++) ts[i] /= rMax

  const profile = buildProfile(ts, pixels.rgb, pixels.weights, opts.bins)
  if (profile.length < 2) return null
  const offsets = simplifyProfile(profile, opts.deltaETolerance, opts.maxStops)
  const stops = refineStops(
    ts,
    pixels.rgb,
    pixels.weights,
    fitStopColors(ts, pixels.rgb, pixels.weights, offsets),
  )

  const fit: GradFit = {
    kind: 'radial',
    center,
    radius: rMax,
    stops,
    error: { mean: 0, p95: 0 },
  }
  fit.error = evaluateFit(fit, pixels)
  return fit
}

/** A line the center must lie on: point p, unit normal n ⊥ gradient, weight |g|. */
interface CenterLine {
  px: number
  py: number
  nx: number
  ny: number
  w: number
}

/** Sobel normals of the blurred luminance at every in-bounds region sample. */
function gradientNormals(pixels: RegionPixels, field: RgbField): CenterLine[] {
  const lum = boxBlur(luminance(field), field.width, field.height)
  const out: CenterLine[] = []
  for (let i = 0; i < pixels.count; i++) {
    const x = pixels.xs[i]
    const y = pixels.ys[i]
    if (x < 1 || y < 1 || x > field.width - 2 || y > field.height - 2) continue
    const gx =
      lumAt(lum, field.width, x + 1, y - 1) +
      2 * lumAt(lum, field.width, x + 1, y) +
      lumAt(lum, field.width, x + 1, y + 1) -
      (lumAt(lum, field.width, x - 1, y - 1) +
        2 * lumAt(lum, field.width, x - 1, y) +
        lumAt(lum, field.width, x - 1, y + 1))
    const gy =
      lumAt(lum, field.width, x - 1, y + 1) +
      2 * lumAt(lum, field.width, x, y + 1) +
      lumAt(lum, field.width, x + 1, y + 1) -
      (lumAt(lum, field.width, x - 1, y - 1) +
        2 * lumAt(lum, field.width, x, y - 1) +
        lumAt(lum, field.width, x + 1, y - 1))
    const g = Math.hypot(gx, gy)
    if (g < GRADIENT_EPS) continue
    out.push({ px: x, py: y, nx: -gy / g, ny: gx / g, w: g })
  }
  return out
}

/** Weighted least-squares intersection of the lines with two Huber-IRLS reweighting passes. */
function intersectNormals(lines: CenterLine[]): Vec2 | null {
  let cx = 0
  let cy = 0
  let wSum = 0
  for (const l of lines) {
    cx += l.w * l.px
    cy += l.w * l.py
    wSum += l.w
  }
  if (wSum <= 0) return null
  let guess: Vec2 = { x: cx / wSum, y: cy / wSum }
  for (let it = 0; it < 3; it++) {
    const next = solveOnce(lines, guess)
    if (!next) return null
    guess = next
  }
  return guess
}

function solveOnce(lines: CenterLine[], guess: Vec2): Vec2 | null {
  // Huber weights from the current residual |n·(p − c)|: far outliers stop dominating.
  const residuals = lines.map((l) => Math.abs(l.nx * (l.px - guess.x) + l.ny * (l.py - guess.y)))
  const sorted = [...residuals].sort((a, b) => a - b)
  const delta = Math.max(1e-6, 1.5 * sorted[Math.floor(sorted.length / 2)])
  let m11 = 0
  let m12 = 0
  let m22 = 0
  let r1 = 0
  let r2 = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const w = l.w / Math.max(1, residuals[i] / delta)
    m11 += w * l.nx * l.nx
    m12 += w * l.nx * l.ny
    m22 += w * l.ny * l.ny
    const q = l.nx * l.px + l.ny * l.py
    r1 += w * l.nx * q
    r2 += w * l.ny * q
  }
  const eig = eig2x2Symmetric(m11, m12, m22)
  if (eig.l1 < 1e-9 || eig.l2 / eig.l1 < PARALLEL_RATIO) return null
  const det = m11 * m22 - m12 * m12
  if (Math.abs(det) < 1e-12) return null
  return { x: (m22 * r1 - m12 * r2) / det, y: (m11 * r2 - m12 * r1) / det }
}

function luminance(field: RgbField): Float32Array {
  const n = field.width * field.height
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = 0.299 * field.rgb[i * 3] + 0.587 * field.rgb[i * 3 + 1] + 0.114 * field.rgb[i * 3 + 2]
  }
  return out
}

/** Two separable [1, 2, 1]/4 passes — enough smoothing for Sobel on banded/noisy ramps. */
function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
  let cur = src
  for (let pass = 0; pass < 2; pass++) {
    cur = blurAxis(cur, w, h, true)
    cur = blurAxis(cur, w, h, false)
  }
  return cur
}

function blurAxis(src: Float32Array, w: number, h: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length)
  const n1 = horizontal ? w : h
  const n2 = horizontal ? h : w
  for (let a = 0; a < n1; a++) {
    const am = Math.max(0, a - 1)
    const ap = Math.min(n1 - 1, a + 1)
    for (let b = 0; b < n2; b++) {
      const i = horizontal ? b * w + a : a * w + b
      const im = horizontal ? b * w + am : am * w + b
      const ip = horizontal ? b * w + ap : ap * w + b
      out[i] = (src[im] + 2 * src[i] + src[ip]) / 4
    }
  }
  return out
}

function lumAt(lum: Float32Array, w: number, x: number, y: number): number {
  return lum[y * w + x]
}
