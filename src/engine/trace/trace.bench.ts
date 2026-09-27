import { bench, describe } from 'vitest'

import type { ImportBitmap } from '../import-image.ts'
import { DEFAULT_TRACE_PARAMS } from './params.ts'
import { clusterImage } from './quantize.ts'
import { traceImage } from './trace.ts'

/**
 * Trace pipeline cost on deterministic synthetic images. The "photo" fixture is smooth radial
 * gradients + banding (the hard case for clustering); the "pixel" fixture is hard-edged bands (the
 * hard case for contour tracing). Sizes are worker-budget scale, not bench-doc scale.
 */

function photoBitmap(size: number): ImportBitmap {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const wave = Math.sin((x / size) * Math.PI * 3) * Math.cos((y / size) * Math.PI * 2)
      data[o] = 128 + wave * 90
      data[o + 1] = 96 + Math.sin((y / size) * Math.PI * 4) * 80
      data[o + 2] = 140 + wave * 60
      data[o + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

function bandsBitmap(size: number): ImportBitmap {
  const data = new Uint8ClampedArray(size * size * 4)
  const colors = [
    [230, 60, 60],
    [60, 180, 60],
    [60, 60, 220],
    [240, 220, 60],
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const c = colors[Math.floor((x / size) * 4 + (y % 16 < 8 ? 0 : 0.5)) % 4]
      data[o] = c[0]
      data[o + 1] = c[1]
      data[o + 2] = c[2]
      data[o + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

const photo512 = photoBitmap(512)
const bands512 = bandsBitmap(512)
const bands2048 = bandsBitmap(2048)

describe('trace pipeline (512²)', () => {
  bench(
    'cluster 512² photo',
    () => {
      clusterImage(photo512, DEFAULT_TRACE_PARAMS)
    },
    { iterations: 5, warmupIterations: 1 },
  )
  bench(
    'trace 512² photo (spline, stacked)',
    () => {
      traceImage({ kind: 'raster', bitmap: photo512 }, DEFAULT_TRACE_PARAMS)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'trace 512² bands (polygon, stacked)',
    () => {
      traceImage({ kind: 'raster', bitmap: bands512 }, { ...DEFAULT_TRACE_PARAMS, mode: 'polygon' })
    },
    { iterations: 5, warmupIterations: 1 },
  )
  bench(
    'trace 2048² bands (polygon, stacked)',
    () => {
      traceImage(
        { kind: 'raster', bitmap: bands2048 },
        { ...DEFAULT_TRACE_PARAMS, mode: 'polygon' },
      )
    },
    { iterations: 2, warmupIterations: 0 },
  )
})
