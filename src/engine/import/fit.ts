/**
 * Fit + pre-processing stage of the image import: sample the photo into the cell grid (cover /
 * contain / stretch), then apply brightness-contrast-saturation, blur, sharpening, hue rotation,
 * denoise and chromatic aberration before quantization. Pure floats, straight RGBA.
 */

import { MAX_SIZE, MIN_SIZE } from '../core/doc'
import type { ImportBitmap, ImportFit, ImportGrid, ImportOptions } from './index.ts'
import {
  chromaticAberrationRGBA,
  gaussianBlurRGBA,
  hueRotateRGBA,
  medianDenoiseRGBA,
  sharpenRGBA,
} from './ops.ts'
import { clamp255 } from './shared.ts'

/** Sample-grid geometry derived from the target grid and the pixel scale. */
export interface SampleLayout {
  cols: number
  rows: number
  /** Full-resolution cell buffer size (cols_sub × rows_sub) */
  bw: number
  bh: number
  /** Each sample covers scale² cells (1..4) */
  scale: number
  /** Sample-grid size that maps 1:1 onto the cell buffer at the pixel scale */
  tw: number
  th: number
}

/** Canvas grid size matching the photo proportions, keeping the longer current side. */
export function resizeTargetSize(
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  const maxSide = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.max(cols, rows)))
  if (imgW >= imgH) {
    return { cols: maxSide, rows: clampSide((maxSide * imgH) / imgW) }
  }
  return { cols: clampSide((maxSide * imgW) / imgH), rows: maxSide }
}

const clampSide = (v: number): number => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)))

/** Resolve the sample-grid layout: canvas size ('resize' adapts it), cell buffer and pixel scale. */
export function resolveLayout(
  src: ImportBitmap,
  opts: ImportOptions,
  grid: ImportGrid,
): SampleLayout {
  let { cols, rows } = grid
  if (opts.fit === 'resize')
    ({ cols, rows } = resizeTargetSize(src.width, src.height, grid.cols, grid.rows))
  const bw = cols * grid.sub
  const bh = rows * grid.sub
  const scale = Math.max(1, Math.min(4, Math.round(opts.pixelScale)))
  const tw = Math.max(1, Math.ceil(bw / scale))
  const th = Math.max(1, Math.ceil(bh / scale))
  return { cols, rows, bw, bh, scale, tw, th }
}

/**
 * Fit the source into a tw×th sample grid by area-averaged (box) downsampling. Colors are averaged
 * weighted by alpha; the output is straight RGBA floats and fully transparent samples stay at 0.
 * 'resize' samples like 'stretch'.
 */
function fitToGrid(src: ImportBitmap, tw: number, th: number, fit: ImportFit): Float64Array {
  const { width: W, height: H, data } = src
  const out = new Float64Array(tw * th * 4)
  // 'cover' crops the source to the target aspect, centered
  let cx0 = 0
  let cy0 = 0
  let cw = W
  let ch = H
  if (fit === 'cover') {
    const aT = tw / th
    const aS = W / H
    if (aS > aT) {
      cw = H * aT
      cx0 = (W - cw) / 2
    } else {
      ch = W / aT
      cy0 = (H - ch) / 2
    }
  }
  // 'contain' letterboxes a scaled-to-fit copy inside the grid
  const contain =
    fit === 'contain'
      ? (() => {
          const scale = Math.min(tw / W, th / H)
          const dw = W * scale
          const dh = H * scale
          return { ox: (tw - dw) / 2, oy: (th - dh) / 2, dw, dh }
        })()
      : null
  // box average with source-pixel overlap weights (alpha-weighted color); the accumulators live in
  // the enclosing scope so the sampling loops stay within the function depth budget
  let ar = 0
  let ag = 0
  let ab = 0
  let aa = 0
  let wsum = 0
  const boxSum = (sx0: number, sx1: number, sy0: number, sy1: number): void => {
    ar = 0
    ag = 0
    ab = 0
    aa = 0
    wsum = 0
    const ix0 = Math.max(0, Math.floor(sx0))
    const ix1 = Math.min(W, Math.ceil(sx1))
    const iy0 = Math.max(0, Math.floor(sy0))
    const iy1 = Math.min(H, Math.ceil(sy1))
    for (let sy = iy0; sy < iy1; sy++) {
      const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy)
      if (wy <= 0) continue
      for (let sx = ix0; sx < ix1; sx++) {
        const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx)
        if (wx <= 0) continue
        const w = wx * wy
        const o = (sy * W + sx) * 4
        const a = data[o + 3]
        ar += data[o] * a * w
        ag += data[o + 1] * a * w
        ab += data[o + 2] * a * w
        aa += a * w
        wsum += w
      }
    }
  }
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sx0: number
      let sy0: number
      let sx1: number
      let sy1: number
      if (contain) {
        const { ox, oy, dw, dh } = contain
        if (x + 1 <= ox || x >= ox + dw || y + 1 <= oy || y >= oy + dh) continue
        sx0 = ((x - ox) / dw) * W
        sx1 = ((x + 1 - ox) / dw) * W
        sy0 = ((y - oy) / dh) * H
        sy1 = ((y + 1 - oy) / dh) * H
      } else {
        sx0 = cx0 + (cw * x) / tw
        sx1 = cx0 + (cw * (x + 1)) / tw
        sy0 = cy0 + (ch * y) / th
        sy1 = cy0 + (ch * (y + 1)) / th
      }
      boxSum(sx0, sx1, sy0, sy1)
      if (wsum > 0 && aa > 0) {
        const o2 = (y * tw + x) * 4
        out[o2] = ar / aa
        out[o2 + 1] = ag / aa
        out[o2 + 2] = ab / aa
        out[o2 + 3] = aa / wsum
      }
    }
  }
  return out
}

/**
 * Brightness / contrast / saturation in place on straight RGBA floats; transparent samples keep
 * alpha 0.
 */
function adjustImage(
  sample: Float64Array,
  brightness: number,
  contrast: number,
  saturation: number,
): void {
  const C = contrast * 2.55
  const f = (259 * (C + 255)) / (255 * (259 - C))
  const sat = 1 + saturation / 100
  const bright = brightness * 1.28
  if (f === 1 && bright === 0 && sat === 1) return
  for (let i = 0; i < sample.length; i += 4) {
    if (sample[i + 3] === 0) continue
    let r = f * (sample[i] - 128) + 128 + bright
    let g = f * (sample[i + 1] - 128) + 128 + bright
    let b = f * (sample[i + 2] - 128) + 128 + bright
    if (sat !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      r = lum + (r - lum) * sat
      g = lum + (g - lum) * sat
      b = lum + (b - lum) * sat
    }
    sample[i] = clamp255(r)
    sample[i + 1] = clamp255(g)
    sample[i + 2] = clamp255(b)
  }
}

/** Fit the photo to the layout's sample grid, then run the whole pre-dither filter chain in order. */
export function prepareSample(
  src: ImportBitmap,
  opts: ImportOptions,
  layout: SampleLayout,
): Float64Array {
  const { tw, th } = layout
  const sample = fitToGrid(src, tw, th, opts.fit === 'resize' ? 'stretch' : opts.fit)
  adjustImage(sample, opts.brightness, opts.contrast, opts.saturation)
  if (opts.blur > 0) gaussianBlurRGBA(sample, tw, th, opts.blur)
  if (opts.sharpen > 0) sharpenRGBA(sample, tw, th, opts.sharpen / 50)
  if (opts.hue !== 0) hueRotateRGBA(sample, opts.hue)
  if (opts.preDenoise > 0) medianDenoiseRGBA(sample, tw, th, opts.preDenoise)
  if (opts.preSmooth > 0) gaussianBlurRGBA(sample, tw, th, opts.preSmooth * 0.5)
  if (opts.aberration > 0) chromaticAberrationRGBA(sample, tw, th, opts.aberration)
  return sample
}
