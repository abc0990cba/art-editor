/**
 * Adaptive Floyd–Steinberg variants for the image import: a noise-jittered quantization input
 * (noise-threshold) and an edge-aware gain that fades diffusion on busy areas. Pure.
 */

import { BAYER4, thresholdAt } from '../dither/matrices.ts'
import { DIFFUSION_KERNELS } from './diffusion.ts'
import type { SpecialCtx } from './shared.ts'
import { clamp255, nearestIndex, type PaletteRgb } from './shared.ts'

/** Deterministic per-pixel [0,1) hash (position-seeded, cheap). */
function hash01(p: number): number {
  let h = Math.imul(p | 0, 0x9e_37_79_b1)
  h = Math.imul(h ^ (h >>> 16), 2_246_822_507)
  h = Math.imul(h ^ (h >>> 13), 3_266_489_909)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

/** Per-pixel luminance of the original sample (edge detection source). */
function lumAt(sample: Float64Array, o: number): number {
  return 0.299 * sample[o] + 0.587 * sample[o + 1] + 0.114 * sample[o + 2]
}

/** Options of the shared Floyd–Steinberg core. */
interface FsOptions {
  sample: Float64Array
  tw: number
  th: number
  pal: PaletteRgb
  strength: number
  out: Int32Array
  /** May bias the working sample before quantization. */
  pre: (p: number, o: number, work: Float64Array) => void
  /** Scales the diffused error per pixel (1 = full diffusion). */
  gain: (p: number, o: number) => number
}

/** Shared Floyd–Steinberg core for the adaptive variants. */
function fsCore(o: FsOptions): void {
  const { sample, tw, th, pal, strength, out, pre, gain } = o
  const kernel = DIFFUSION_KERNELS.floyd
  if (!kernel) return
  const work = sample.slice()
  const err = new Float64Array(3)
  const spread = (x: number, y: number, dir: number): void => {
    for (const [dx, dy, w] of kernel.steps) {
      const nx = x + dx * dir
      const ny = y + dy
      if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
      const to = (ny * tw + nx) * 4
      work[to] += (err[0] * w) / kernel.div
      work[to + 1] += (err[1] * w) / kernel.div
      work[to + 2] += (err[2] * w) / kernel.div
    }
  }
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      pre(p, o, work)
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      const f = gain(p, o) * strength
      err[0] = (r - pal.r[ci]) * f
      err[1] = (g - pal.g[ci]) * f
      err[2] = (b - pal.b[ci]) * f
      spread(x, y, ltr ? 1 : -1)
    }
  }
}

/** Noise-Threshold: Floyd–Steinberg whose quantization input is jittered by deterministic noise. */
export function mapNoiseThreshold(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  fsCore({
    sample,
    tw,
    th,
    pal: ctx.pal,
    strength: ctx.strength,
    out,
    pre: (p, o, work) => {
      work[o] += (hash01(p) - 0.5) * 48 * ctx.strength
      work[o + 1] += (hash01(p + 1_000_003) - 0.5) * 48 * ctx.strength
      work[o + 2] += (hash01(p + 2_000_009) - 0.5) * 48 * ctx.strength
    },
    gain: () => 1,
  })
}

/**
 * Edge-Aware: Floyd–Steinberg whose diffusion fades on busy areas — flat regions dither, edges stay
 * clean.
 */
export function mapEdgeAware(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  fsCore({
    sample,
    tw,
    th,
    pal: ctx.pal,
    strength: ctx.strength,
    out,
    pre: () => {},
    gain: (p, o) => {
      const here = lumAt(sample, o)
      const right = p % tw === tw - 1 ? here : lumAt(sample, o + 4)
      const below = p + tw >= tw * th ? here : lumAt(sample, o + tw * 4)
      const contrast = Math.abs(right - here) + Math.abs(below - here)
      const f = 1 - Math.min(1, contrast / 48) * 0.9
      return f < 0.1 ? 0.1 : f
    },
  })
}

/**
 * Posterize + Jitter: tones collapse onto N bands; a Bayer-ordered jitter at the band boundaries
 * (scaled by strength) turns the hard steps into a textured crossfade. Strength 0 stays plain
 * nearest, so the effect reads as "posterize amount".
 */
export function mapPosterizeJitter(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx & { levels: number },
  out: Int32Array,
): void {
  const { pal, strength, levels } = ctx
  const n = Math.max(2, Math.min(32, Math.round(levels)))
  const step = 255 / (n - 1)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(sample[o])
      const g = clamp255(sample[o + 1])
      const b = clamp255(sample[o + 2])
      const nearest = nearestIndex(pal, r, g, b)
      if (strength <= 0 || pal.r.length < 2) {
        out[p] = nearest
        continue
      }
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const q = Math.round(lum / step) * step
      // jitter the band boundary with the ordered field, tone projected back to gray
      const j = (thresholdAt(BAYER4, 4, 16, x, y) - 0.5) * step * 0.9 * strength
      const gray = clamp255(q + j)
      out[p] = nearestIndex(pal, gray, gray, gray)
    }
  }
}
