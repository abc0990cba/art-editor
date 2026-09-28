/**
 * Layered refinement ("stacked" mode): after the base per-region fit, the remaining error is
 * absorbed by soft radial spot layers — a constant color with an alpha ramp over the radius. This
 * is the AI-safe SVG equivalent of 2-D Gaussian splats (the GaussianImage idea), fitted greedily on
 * the residual peak; layers composite with plain source-over, so Illustrator imports them
 * untouched. The alpha ramp reuses the 1-D stop pipeline by fitting it as a gray ramp.
 */

import { clamp01, deltaE2000Rgb } from './color.ts'
import { buildProfile, simplifyProfile } from './profile.ts'
import { evalFitColor } from './render.ts'
import { fitStopColors, refineStops, stopColorAt } from './stop-colors.ts'
import type { FitError, FitOptions, GradFit, GradStop, RegionPixels, RGB } from './types.ts'

/** One soft spot: constant color + alpha stops over the radius (last stop fades to 0). */
export interface SpotLayer {
  center: { x: number; y: number }
  radius: number
  /** Alpha ramp stored as gray stops: `color.r` is the alpha at `offset` */
  alpha: GradStop[]
  color: RGB
}

export interface LayeredFit {
  base: GradFit
  layers: SpotLayer[]
  /** Composite error of base + layers against the region samples */
  error: FitError
}

/** A spot covering more than this fraction of the region is not a spot — stop splitting. */
const MAX_BLOB_FRACTION = 0.25
/** Minimal improvement (mean ΔE) for a layer to be kept */
const MIN_IMPROVEMENT = 0.05
/** Per-channel denominator below which a pixel says nothing about the layer alpha */
const CONTRAST_EPS = 0.04
/** Blob pixels needed for a trustworthy alpha ramp */
const MIN_BLOB_PIXELS = 8

export function fitRegionLayers(
  pixels: RegionPixels,
  base: GradFit,
  opts: FitOptions & { maxLayers: number },
): LayeredFit {
  let cur = renderBase(pixels, base)
  let des = residualOf(pixels, cur)
  let bestMean = meanOf(des, pixels.weights)
  const layers: SpotLayer[] = []
  const blobCap = Math.max(16, Math.floor(pixels.count * MAX_BLOB_FRACTION))

  for (let li = 0; li < opts.maxLayers; li++) {
    const blob = peakBlob(pixels, des, blobCap)
    if (!blob) break
    const candidate = fitSpot(pixels, cur, blob, opts)
    if (!candidate) break
    const trial = cur.slice()
    applySpot(trial, pixels, candidate)
    const trialDes = residualOf(pixels, trial)
    const trialMean = meanOf(trialDes, pixels.weights)
    if (bestMean - trialMean < MIN_IMPROVEMENT) break
    cur = trial
    des = trialDes
    bestMean = trialMean
    layers.push(candidate)
  }

  return { base, layers, error: { mean: bestMean, p95: percentile95(des) } }
}

/** Composite color of the fit at a point: base, then every spot painted source-over. */
export function compositeColor(base: GradFit, layers: SpotLayer[], x: number, y: number): RGB {
  const c = evalFitColor(base, x, y)
  let r = c.r
  let g = c.g
  let b = c.b
  for (const l of layers) {
    const t = Math.hypot(x - l.center.x, y - l.center.y) / l.radius
    if (t >= 1) continue
    const a = stopColorAt(l.alpha, t).r
    r = r * (1 - a) + l.color.r * a
    g = g * (1 - a) + l.color.g * a
    b = b * (1 - a) + l.color.b * a
  }
  return { r, g, b }
}

function renderBase(pixels: RegionPixels, base: GradFit): Float32Array {
  const out = new Float32Array(pixels.count * 3)
  for (let i = 0; i < pixels.count; i++) {
    const c = evalFitColor(base, pixels.xs[i], pixels.ys[i])
    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }
  return out
}

function residualOf(pixels: RegionPixels, cur: Float32Array): Float32Array {
  const des = new Float32Array(pixels.count)
  for (let i = 0; i < pixels.count; i++) {
    des[i] = deltaE2000Rgb(
      { r: pixels.rgb[i * 3], g: pixels.rgb[i * 3 + 1], b: pixels.rgb[i * 3 + 2] },
      { r: cur[i * 3], g: cur[i * 3 + 1], b: cur[i * 3 + 2] },
    )
  }
  return des
}

function applySpot(target: Float32Array, pixels: RegionPixels, layer: SpotLayer): void {
  for (let i = 0; i < pixels.count; i++) {
    const dx = pixels.xs[i] - layer.center.x
    const dy = pixels.ys[i] - layer.center.y
    const t = Math.hypot(dx, dy) / layer.radius
    if (t >= 1) continue
    const a = stopColorAt(layer.alpha, t).r
    target[i * 3] = target[i * 3] * (1 - a) + layer.color.r * a
    target[i * 3 + 1] = target[i * 3 + 1] * (1 - a) + layer.color.g * a
    target[i * 3 + 2] = target[i * 3 + 2] * (1 - a) + layer.color.b * a
  }
}

interface Blob {
  idx: number[]
  peak: number
}

/** Flood fill from the residual peak over pixels above a share of its error, capped in size. */
function peakBlob(pixels: RegionPixels, des: Float32Array, cap: number): Blob | null {
  let peak = -1
  let peakDe = 0
  for (let i = 0; i < pixels.count; i++) {
    if (des[i] > peakDe) {
      peakDe = des[i]
      peak = i
    }
  }
  if (peak < 0 || peakDe < 1) return null
  const thr = Math.max(0.5, peakDe * 0.5)
  // index grid over the region bbox for 4-neighbour walks
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
  const bw = maxX - minX + 1
  const grid = new Int32Array(bw * (maxY - minY + 1)).fill(-1)
  for (let i = 0; i < pixels.count; i++) {
    grid[(pixels.ys[i] - minY) * bw + (pixels.xs[i] - minX)] = i
  }
  const idx: number[] = []
  const seen = new Set<number>([peak])
  const stack = [peak]
  while (stack.length > 0 && idx.length < cap) {
    const i = stack.pop() as number
    idx.push(i)
    const nbs = [
      [pixels.xs[i] - 1, pixels.ys[i]],
      [pixels.xs[i] + 1, pixels.ys[i]],
      [pixels.xs[i], pixels.ys[i] - 1],
      [pixels.xs[i], pixels.ys[i] + 1],
    ]
    for (const [nx, ny] of nbs) {
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const j = grid[(ny - minY) * bw + (nx - minX)]
      if (j < 0 || seen.has(j) || des[j] < thr) continue
      seen.add(j)
      stack.push(j)
    }
  }
  return { idx, peak }
}

/** Fit one spot on the blob: color from the peak pixel, alpha ramp from per-pixel alpha votes. */
function fitSpot(
  pixels: RegionPixels,
  cur: Float32Array,
  blob: Blob,
  opts: FitOptions,
): SpotLayer | null {
  let cx = 0
  let cy = 0
  let wSum = 0
  for (const i of blob.idx) {
    const w = pixels.weights[i]
    cx += w * pixels.xs[i]
    cy += w * pixels.ys[i]
    wSum += w
  }
  if (wSum <= 0) return null
  cx /= wSum
  cy /= wSum
  let radius = 0
  for (const i of blob.idx) {
    radius = Math.max(radius, Math.hypot(pixels.xs[i] - cx, pixels.ys[i] - cy))
  }
  radius = radius * 1.15 + 0.5
  // layer color: the original color at the residual peak
  const peak = blob.peak
  const color: RGB = {
    r: pixels.rgb[peak * 3],
    g: pixels.rgb[peak * 3 + 1],
    b: pixels.rgb[peak * 3 + 2],
  }

  // per-pixel alpha votes: a = (orig − cur) / (K − cur), averaged over informative channels
  const n = blob.idx.length
  const ts = new Float32Array(n)
  const alphas = new Float32Array(n * 3)
  const weights = new Float32Array(n)
  let votes = 0
  for (let j = 0; j < n; j++) {
    const i = blob.idx[j]
    let sum = 0
    let chans = 0
    for (let ch = 0; ch < 3; ch++) {
      const kc = ch === 0 ? color.r : ch === 1 ? color.g : color.b
      const base = cur[i * 3 + ch]
      const d = kc - base
      if (Math.abs(d) <= CONTRAST_EPS) continue
      const orig = pixels.rgb[i * 3 + ch]
      sum += (orig - base) / d
      chans++
    }
    if (chans === 0) continue
    const a = clamp01(sum / chans)
    ts[votes] = clamp01(Math.hypot(pixels.xs[i] - cx, pixels.ys[i] - cy) / radius)
    alphas[votes * 3] = a
    alphas[votes * 3 + 1] = a
    alphas[votes * 3 + 2] = a
    weights[votes] = pixels.weights[i]
    votes++
  }
  if (votes < MIN_BLOB_PIXELS) return null
  const tsF = ts.slice(0, votes)
  const alphasF = alphas.slice(0, votes * 3)
  const weightsF = weights.slice(0, votes)
  const profile = buildProfile(tsF, alphasF, weightsF, 48)
  const offsets = simplifyProfile(profile, 0.75, opts.maxStops)
  let stops = refineStops(tsF, alphasF, weightsF, fitStopColors(tsF, alphasF, weightsF, offsets), 1)
  // the ramp must fade out at the rim so the spot stays local
  if (stops.length > 0) stops = [...stops.slice(0, -1), { offset: 1, color: { r: 0, g: 0, b: 0 } }]
  return { center: { x: cx, y: cy }, radius, alpha: stops, color }
}

function meanOf(des: Float32Array, weights: Float32Array): number {
  let sum = 0
  let wSum = 0
  for (let i = 0; i < des.length; i++) {
    sum += des[i] * weights[i]
    wSum += weights[i]
  }
  return wSum > 0 ? sum / wSum : 0
}

function percentile95(des: Float32Array): number {
  const sorted = [...des].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))
  return sorted[rank]
}
