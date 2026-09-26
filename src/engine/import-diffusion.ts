/**
 * Error-diffusion dithering for the image import: classic serpentine kernels (Floyd–Steinberg,
 * Atkinson, Sierra, Stucki, Burkes, Jarvis-Judice-Ninke, Stevenson-Arce, Nakano). Each pixel's
 * quantization error spreads to not-yet-visited neighbors, self-correcting the tone. Pure.
 */

import type { ImportDither } from './import-image.ts'
import { clamp255, nearestIndex, type PaletteRgb } from './import-shared.ts'

/** One error-diffusion kernel: (dx, dy, weight numerator) steps in scan direction, over `div`. */
export interface DiffusionKernel {
  div: number
  steps: readonly (readonly [number, number, number])[]
}

/** Per-pipeline diffusion parameters shared by every pixel. */
export interface DiffusionCtx {
  pal: PaletteRgb
  kernel: DiffusionKernel
  strength: number
}

/**
 * Classic error-diffusion kernels in scan orientation (dx > 0 = the next column); serpentine rows
 * mirror the dx sign. Values follow the canonical published tables.
 */
export const DIFFUSION_KERNELS: Partial<Record<ImportDither, DiffusionKernel>> = {
  floyd: {
    div: 16,
    steps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  atkinson: {
    div: 8,
    steps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  sierra: {
    div: 32,
    steps: [
      [1, 0, 5],
      [2, 0, 3],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 5],
      [1, 1, 4],
      [2, 1, 2],
      [-1, 2, 2],
      [0, 2, 3],
      [1, 2, 2],
    ],
  },
  'sierra-lite': {
    div: 4,
    steps: [
      [1, 0, 2],
      [-1, 1, 1],
      [0, 1, 1],
    ],
  },
  stucki: {
    div: 42,
    steps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
  },
  burkes: {
    div: 32,
    steps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
    ],
  },
  jjn: {
    div: 48,
    steps: [
      [1, 0, 7],
      [2, 0, 5],
      [-2, 1, 3],
      [-1, 1, 5],
      [0, 1, 7],
      [1, 1, 5],
      [2, 1, 3],
      [-2, 2, 1],
      [-1, 2, 3],
      [0, 2, 5],
      [1, 2, 3],
      [2, 2, 1],
    ],
  },
  'stevenson-arce': {
    div: 200,
    steps: [
      [2, 0, 32],
      [-3, 1, 12],
      [-1, 1, 26],
      [1, 1, 30],
      [3, 1, 16],
      [-2, 2, 12],
      [0, 2, 26],
      [2, 2, 12],
      [-3, 3, 5],
      [-1, 3, 12],
      [1, 3, 12],
      [3, 3, 5],
    ],
  },
  nakano: {
    div: 24,
    steps: [
      [1, 0, 8],
      [-1, 1, 4],
      [0, 1, 4],
      [1, 1, 4],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 1],
    ],
  },
}

/**
 * Error diffusion (serpentine scan): self-correcting tone, the classic photo-dither look. The
 * `spread` closure carries one pixel's (scaled) quantization error along the kernel, mirrored on
 * RTL rows; the error triple is a reused scratch buffer so the hot path allocates nothing.
 */
export function mapErrorDiffusion(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: DiffusionCtx,
  out: Int32Array,
): void {
  const { pal, kernel, strength } = ctx
  const work = sample.slice()
  const err = new Float64Array(3)
  // spread one pixel's scaled error along the kernel; dir flips on RTL rows
  const spread = (x: number, y: number, dir: number): void => {
    for (const [dx, dy, w] of kernel.steps) {
      const nx = x + dx * dir
      const ny = y + dy
      if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
      const o = (ny * tw + nx) * 4
      work[o] += (err[0] * w) / kernel.div
      work[o + 1] += (err[1] * w) / kernel.div
      work[o + 2] += (err[2] * w) / kernel.div
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
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      err[0] = (r - pal.r[ci]) * strength
      err[1] = (g - pal.g[ci]) * strength
      err[2] = (b - pal.b[ci]) * strength
      spread(x, y, ltr ? 1 : -1)
    }
  }
}
