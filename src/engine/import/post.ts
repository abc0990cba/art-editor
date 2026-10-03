/**
 * Post-processing stage of the image import: glow (screen-blend bloom), median denoise and
 * smoothing applied to the snapped palette colors, then a re-snap of every pixel back onto the
 * palette. Pure.
 */

import type { ImportOptions } from './index.ts'
import { gaussianBlurRGBA, glowScreenRGBA, medianDenoiseRGBA } from './ops.ts'
import { clamp255, nearestIndex, type PaletteRgb } from './shared.ts'

/**
 * Post effects run on the snapped colors and land back on the palette: rebuild an RGBA image from
 * the mapped indices, apply glow / denoise / smooth, and re-snap every pixel to its nearest color
 * in place.
 */
export function applyPostEffects(
  idx: Int32Array,
  pal: PaletteRgb,
  tw: number,
  th: number,
  opts: ImportOptions,
): void {
  const rgb = new Float64Array(tw * th * 4)
  for (let p = 0; p < tw * th; p++) {
    const ci = idx[p]
    if (ci < 0) continue
    const o = p * 4
    rgb[o] = pal.r[ci]
    rgb[o + 1] = pal.g[ci]
    rgb[o + 2] = pal.b[ci]
    rgb[o + 3] = 255
  }
  if (opts.glowRadius > 0 && opts.glowIntensity > 0)
    glowScreenRGBA(rgb, tw, th, opts.glowRadius, opts.glowIntensity)
  if (opts.postDenoise > 0) medianDenoiseRGBA(rgb, tw, th, opts.postDenoise)
  if (opts.postSmooth > 0) gaussianBlurRGBA(rgb, tw, th, opts.postSmooth * 0.5)
  for (let p = 0; p < tw * th; p++) {
    const o = p * 4
    if (rgb[o + 3] < 128) {
      idx[p] = -1
      continue
    }
    idx[p] = nearestIndex(pal, clamp255(rgb[o]), clamp255(rgb[o + 1]), clamp255(rgb[o + 2]))
  }
}

/**
 * Edge outline: cells on luminance edges of the dithered result take the darkest palette ink — the
 * "ink lines over halftone" combo. Amount 0..100 sweeps the edge threshold.
 */
export function applyEdgeOutline(
  idx: Int32Array,
  pal: PaletteRgb,
  tw: number,
  th: number,
  amount: number,
): void {
  const k = Math.max(0, Math.min(100, amount)) / 100
  if (k <= 0 || pal.r.length === 0) return
  let dark = 0
  let darkLum = Infinity
  for (let i = 0; i < pal.r.length; i++) {
    const lum = 0.299 * pal.r[i] + 0.587 * pal.g[i] + 0.114 * pal.b[i]
    if (lum < darkLum) {
      darkLum = lum
      dark = i
    }
  }
  const lum = new Float64Array(idx.length)
  for (let p = 0; p < idx.length; p++) {
    const v = idx[p]
    lum[p] = v < 0 ? 1 : (0.299 * pal.r[v] + 0.587 * pal.g[v] + 0.114 * pal.b[v]) / 255
  }
  const threshold = 0.5 * (1 - k) + 0.02
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const p = y * tw + x
      if (idx[p] < 0) continue
      const here = lum[p]
      const right = x + 1 < tw ? lum[p + 1] : here
      const left = x > 0 ? lum[p - 1] : here
      const below = y + 1 < th ? lum[p + tw] : here
      const above = y > 0 ? lum[p - tw] : here
      const edge =
        Math.abs(right - here) +
        Math.abs(left - here) +
        Math.abs(below - here) +
        Math.abs(above - here)
      if (edge >= threshold * 2) idx[p] = dark
    }
  }
}
