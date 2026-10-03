/**
 * Yliluoma palette-mixing search for the image import: every pixel is matched against the
 * luminance-bracketing palette colors and their pairwise blends; the best mix wins and blends
 * render as an ordered per-cell pick between their components. Pure.
 */

import { BAYER4, thresholdAt } from '../dither/matrices.ts'
import type { PaletteRgb, SpecialCtx } from './shared.ts'
import { nearestIndex } from './shared.ts'

/** One candidate mix: solid color a when b < 0, otherwise the a→b blend at ratio w. */
interface MixCandidate {
  a: number
  b: number
  w: number
}

const RATIOS: readonly number[] = [1 / 3, 1 / 2, 2 / 3]

/** Luminance of a palette entry. */
function palLum(pal: PaletteRgb, i: number): number {
  return 0.299 * pal.r[i] + 0.587 * pal.g[i] + 0.114 * pal.b[i]
}

/** Deterministic [0,1) hash of a cell position — mixes nearest fallback under strength < 1. */
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) | 0
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

/** Weighted RGB² distance, the same weighting as nearestIndex. */
function dist3(dr: number, dg: number, db: number): number {
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db
}

/** Solids and pairwise blends (1/3, 1/2, 2/3) of the palette colors in the luminance window. */
function windowCandidates(order: number[], from: number, to: number): MixCandidate[] {
  const out: MixCandidate[] = []
  for (let i = from; i < to; i++) {
    out.push({ a: order[i], b: -1, w: 0 })
    for (let j = i + 1; j < to; j++) {
      for (const w of RATIOS) out.push({ a: order[i], b: order[j], w })
    }
  }
  return out
}

/** Mix color of a candidate in parallel-channel palette space. */
function mixColor(pal: PaletteRgb, c: MixCandidate): [number, number, number] {
  if (c.b < 0) return [pal.r[c.a], pal.g[c.a], pal.b[c.a]]
  return [
    pal.r[c.a] + (pal.r[c.b] - pal.r[c.a]) * c.w,
    pal.g[c.a] + (pal.g[c.b] - pal.g[c.a]) * c.w,
    pal.b[c.a] + (pal.b[c.b] - pal.b[c.a]) * c.w,
  ]
}

/** The candidate whose mixed color best matches the pixel. */
function bestCandidate(
  pal: PaletteRgb,
  cands: MixCandidate[],
  r: number,
  g: number,
  b: number,
): MixCandidate {
  let best = cands[0]
  let bestD = Infinity
  for (const c of cands) {
    const [cr, cg, cb] = mixColor(pal, c)
    const d = dist3(r - cr, g - cg, b - cb)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/**
 * Yliluoma: palette-mixing search. Every pixel is matched against the six luminance-bracketing
 * palette colors and their pairwise blends (1/3, 1/2, 2/3); the best mix wins, and blends render as
 * an ordered per-cell pick between their components (Bayer 4) so the artwork averages to the mixed
 * tone. Strength mixes the search with plain nearest colors deterministically.
 */
export function mapYliluoma(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
  const k = pal.r.length
  const order: number[] = []
  for (let i = 0; i < k; i++) order.push(i)
  order.sort((a, b) => palLum(pal, a) - palLum(pal, b))
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = sample[o]
      const g = sample[o + 1]
      const b = sample[o + 2]
      const nearest = nearestIndex(pal, r, g, b)
      if (strength <= 0 || k <= 1) {
        out[p] = nearest
        continue
      }
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      let lo = 0
      while (lo < k && palLum(pal, order[lo]) < lum) lo++
      const cands = windowCandidates(order, Math.max(0, lo - 3), Math.min(k, lo + 3))
      const best = bestCandidate(pal, cands, r, g, b)
      if (best.b >= 0 && cellHash(x, y) < strength) {
        out[p] = thresholdAt(BAYER4, 4, 16, x, y) < best.w ? best.b : best.a
        continue
      }
      out[p] = nearest
    }
  }
}
