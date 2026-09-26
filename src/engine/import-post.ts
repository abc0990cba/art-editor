/**
 * Post-processing stage of the image import: glow (screen-blend bloom), median denoise and
 * smoothing applied to the snapped palette colors, then a re-snap of every pixel back onto the
 * palette. Pure.
 */

import { gaussianBlurRGBA, glowScreenRGBA, medianDenoiseRGBA } from './image-ops.ts'
import type { ImportOptions } from './import-image.ts'
import { clamp255, nearestIndex, type PaletteRgb } from './import-shared.ts'

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
