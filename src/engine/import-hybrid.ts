/**
 * Hybrid band dithering: three algorithms run independently over the whole sample — shadows,
 * midtones and highlights each get their own strategy — and the composite reads each pixel from the
 * run whose tone band owns it. Diffusion keeps its global scan inside each run, so the bands blend
 * without seams. Pure.
 */

import type { ImportDither } from './dither-catalog.ts'
import { mapNearest, type PaletteRgb } from './import-shared.ts'

/** Band strategy: the algorithm per band plus the two split points (pixel 0..255 luminance). */
export interface HybridPlan {
  low: ImportDither
  mid: ImportDither
  high: ImportDither
  /** Shadows end at this luminance (0..255) */
  bandLow: number
  /** Highlights start at this luminance (0..255) */
  bandHigh: number
  strength: number
}

/** Composite bounds check: which band a luminance belongs to. */
export function bandOf(lum: number, plan: HybridPlan): 'low' | 'mid' | 'high' {
  if (lum <= plan.bandLow) return 'low'
  if (lum >= plan.bandHigh) return 'high'
  return 'mid'
}

/**
 * Run the three band algorithms (each via the standard pipeline entry the caller provides) and
 * composite by band. `run` is the ordinary whole-image dither dispatcher — hybrid reuses it, so
 * every registered algorithm works inside a band.
 */
/** Everything mapHybrid needs beyond the sample geometry. */
export interface HybridCtx {
  plan: HybridPlan
  pal: PaletteRgb
  run: (dither: ImportDither) => Int32Array
}

export function mapHybrid(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: HybridCtx,
  out: Int32Array,
): void {
  const { plan, pal, run } = ctx
  if (plan.strength <= 0) {
    mapNearest(sample, tw * th, pal, out)
    return
  }
  const low = run(plan.low)
  const mid = run(plan.mid)
  const high = run(plan.high)
  for (let p = 0; p < out.length; p++) {
    const o = p * 4
    if (sample[o + 3] < 128) {
      out[p] = -1
      continue
    }
    const lum = 0.299 * sample[o] + 0.587 * sample[o + 1] + 0.114 * sample[o + 2]
    const band = bandOf(lum, plan)
    out[p] = band === 'low' ? low[p] : band === 'mid' ? mid[p] : high[p]
  }
}
