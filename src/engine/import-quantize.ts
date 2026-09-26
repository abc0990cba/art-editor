/**
 * Color-reduction stage of the image import: palette normalization, luminance-sorted midpoint
 * blending and median-cut quantization of the sample grid. Pure.
 */

import { hexToRgb, rgbToHex } from './color'
import { luminanceOf } from './import-shared.ts'

/** Normalize a color list: parseable lowercase #rrggbb, deduplicated, never empty. */
export function normalizePalette(hexes: readonly string[]): string[] {
  const out: string[] = []
  for (const hex of hexes) {
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    const norm = rgbToHex(rgb)
    if (!out.includes(norm)) out.push(norm)
  }
  return out.length > 0 ? out : ['#000000']
}

/**
 * Insert synthetic midpoint colors between every adjacent pair of the luminance-sorted palette, so
 * dithered gradients gain intermediate steps (amount 0 = unchanged; higher values add up to three
 * midpoints per pair). The dithering pipeline uses the expanded list; the document palette grows
 * accordingly, capped at 64 entries.
 */
export function expandPaletteWithBlend(palette: readonly string[], amount: number): string[] {
  const sorted = [...palette].sort((a, b) => luminanceOf(a) - luminanceOf(b))
  if (amount <= 0 || sorted.length < 2) return sorted
  let steps = amount <= 33 ? 1 : amount <= 66 ? 2 : 3
  while (steps > 0 && sorted.length * (steps + 1) > 64) steps--
  if (steps === 0) return sorted
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i])
    if (i + 1 >= sorted.length) break
    const a = hexToRgb(sorted[i])
    const b = hexToRgb(sorted[i + 1])
    if (!a || !b) continue
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1)
      out.push(
        rgbToHex({
          r: Math.round(a.r + (b.r - a.r) * t),
          g: Math.round(a.g + (b.g - a.g) * t),
          b: Math.round(a.b + (b.b - a.b) * t),
        }),
      )
    }
  }
  return normalizePalette(out)
}

const MEDIAN_CUT_CAP = 32_768

/** Min→max range of one channel across a box's sample offsets. */
function channelRange(sample: Float64Array, box: number[], ch: number): number {
  let lo = 255
  let hi = 0
  for (const o of box) {
    const v = sample[o + ch]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi - lo
}

/**
 * Median-cut quantization of the opaque samples into up to maxColors colors. Samples a
 * deterministic stride of the grid so huge photos stay cheap; the result is sorted by luminance so
 * the document palette reads like a ramp.
 */
export function medianCut(sample: Float64Array, maxColors: number): string[] {
  const total = sample.length / 4
  if (total === 0) return ['#000000']
  const stride = Math.max(1, Math.floor(total / MEDIAN_CUT_CAP))
  const pxs: number[] = []
  for (let p = 0; p < total; p += stride) {
    const o = p * 4
    if (sample[o + 3] >= 128) pxs.push(o)
  }
  if (pxs.length === 0) return ['#000000']
  const n = Math.max(2, Math.min(64, Math.round(maxColors)))
  const boxes: number[][] = [pxs]
  while (boxes.length < n) {
    // split the box with the widest channel range at its median
    let bi = -1
    let bestRange = 0
    let bestCh = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.length < 2) continue
      for (let ch = 0; ch < 3; ch++) {
        const range = channelRange(sample, box, ch)
        if (range > bestRange) {
          bestRange = range
          bi = i
          bestCh = ch
        }
      }
    }
    if (bi < 0) break
    const sorted = [...boxes[bi]].sort((a, b) => sample[a + bestCh] - sample[b + bestCh])
    const mid = sorted.length >> 1
    boxes[bi] = sorted.slice(0, mid)
    boxes.push(sorted.slice(mid))
  }
  const colors = boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    for (const o of box) {
      r += sample[o]
      g += sample[o + 1]
      b += sample[o + 2]
    }
    return rgbToHex({
      r: Math.round(r / box.length),
      g: Math.round(g / box.length),
      b: Math.round(b / box.length),
    })
  })
  // luminance order reads like a ramp in the palette UI
  colors.sort((a, b) => luminanceOf(a) - luminanceOf(b))
  return normalizePalette(colors)
}
