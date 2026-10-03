import { bench, describe } from 'vitest'

import { convertImage, DEFAULT_IMPORT_OPTIONS, type ImportBitmap } from '../import/index.ts'
import type { ImportDither } from './catalog.ts'

/**
 * Image-import dithering costs: the dialog re-runs a conversion on every slider tick (60 ms
 * debounce) and once per gallery tile, so per-algorithm cost on a 128×128 sample is the number to
 * watch. Baseline established 2026-10-02 with the effects-library expansion (see bench/PERFLOG.md)
 * — new heavy algorithms land here with their first row.
 */

const BW = ['#000000', '#ffffff']

/** 128×24 gradient ramp with a color patch — bracketing + alpha paths in one image. */
const benchImage = (): ImportBitmap => {
  const w = 128
  const h = 128
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      data[o] = Math.round((x / (w - 1)) * 255)
      data[o + 1] = Math.round((y / (h - 1)) * 255)
      data[o + 2] = x < w / 2 ? 96 : 192
      data[o + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

const img = benchImage()
const grid = { cols: 128, rows: 128, sub: 1 as const }
const opts = (dither: ImportDither, over: Partial<Parameters<typeof convertImage>[1]> = {}) => ({
  ...DEFAULT_IMPORT_OPTIONS,
  dither,
  palette: { kind: 'preset' as const, colors: [...BW] },
  ...over,
})

describe('import dithering 128² (baseline 2026-10-02, dither-library expansion)', () => {
  bench('nearest (off)', () => {
    convertImage(img, opts('none'), grid, BW)
  })

  bench('floyd (diffusion baseline)', () => {
    convertImage(img, opts('floyd'), grid, BW)
  })

  bench('bayer8 (ordered baseline)', () => {
    convertImage(img, opts('bayer8'), grid, BW)
  })

  bench('yliluoma (mix search)', () => {
    convertImage(img, opts('yliluoma'), grid, BW)
  })

  bench('cmyk (four rosette plates)', () => {
    convertImage(img, opts('cmyk'), grid, BW)
  })

  bench('hilbert (scan path)', () => {
    convertImage(img, opts('hilbert'), grid, BW)
  })

  bench('hybrid (three band runs)', () => {
    convertImage(
      img,
      opts('hybrid', { hybridLow: 'lines-diag', hybridMid: 'floyd', hybridHigh: 'bayer8' }),
      grid,
      BW,
    )
  })
})
