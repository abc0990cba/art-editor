/**
 * Special diffusion strategies for the image import: tone-adaptive error weights (Ostromoukhov,
 * Variable-Error), class-ordered dot diffusion and the decaying-error-memory Riemersma trace. The
 * adaptive FS variants live in import-adaptive.ts, the palette-mix search in import-yliluoma.ts;
 * this file owns the strategy registry. Pure.
 */

import type { ImportDither } from '../dither/catalog.ts'
import { mapEdgeAware, mapNoiseThreshold } from './adaptive.ts'
import { mapCmyk } from './cmyk.ts'
import type { SpecialCtx, SpecialMapper } from './shared.ts'
import { clamp255, nearestIndex } from './shared.ts'
import { mapYliluoma } from './yliluoma.ts'

/**
 * Ostromoukhov: simple, error-diffusion weights that vary with the pixel's tone (32 luminance
 * bands), giving even textures without directional worms.
 */
const OSTROMOUKHOV_TABLE: readonly (readonly [number, number, number, number])[] = [
  [13, 0, 5, 18],
  [13, 0, 5, 18],
  [21, 0, 10, 31],
  [7, 0, 4, 11],
  [8, 0, 5, 13],
  [47, 3, 28, 78],
  [23, 3, 13, 39],
  [15, 3, 8, 26],
  [22, 5, 10, 37],
  [56, 14, 21, 91],
  [28, 8, 9, 45],
  [19, 6, 5, 30],
  [14, 5, 3, 22],
  [7, 3, 1, 11],
  [65, 32, 7, 104],
  [23, 12, 2, 37],
  [23, 12, 2, 37],
  [65, 32, 7, 104],
  [7, 3, 1, 11],
  [14, 5, 3, 22],
  [19, 6, 5, 30],
  [28, 8, 9, 45],
  [56, 14, 21, 91],
  [22, 5, 10, 37],
  [15, 3, 8, 26],
  [23, 3, 13, 39],
  [47, 3, 28, 78],
  [8, 0, 5, 13],
  [7, 0, 4, 11],
  [21, 0, 10, 31],
  [13, 0, 5, 18],
  [13, 0, 5, 18],
]

export function mapOstromoukhov(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
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
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const band = Math.min(31, Math.max(0, Math.floor(lum / 8)))
      const [c0, c1, c2, dn] = OSTROMOUKHOV_TABLE[band]
      if (dn === 0) continue
      const er = ((r - pal.r[ci]) * strength) / dn
      const eg = ((g - pal.g[ci]) * strength) / dn
      const eb = ((b - pal.b[ci]) * strength) / dn
      // c0 → next in scan direction, c1 → behind on the next row, c2 → below
      const targets: [number, number, number][] = [
        [c0, 0, 1],
        [c1, 1, -1],
        [c2, 1, 0],
      ]
      for (const [w, dy, dxDir] of targets) {
        if (w === 0) continue
        const nx = x + dxDir * dir
        const ny = y + dy
        if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
        const to = (ny * tw + nx) * 4
        work[to] += er * w
        work[to + 1] += eg * w
        work[to + 2] += eb * w
      }
    }
  }
}

/**
 * Variable-Error: Floyd–Steinberg geometry whose weights slide with the tone — bright pixels push
 * most error forward, dark pixels downward, for softer ramps.
 */
export function mapVariableError(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
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
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const f = lum < 0 ? 0 : lum > 1 ? 1 : lum
      const er = (r - pal.r[ci]) * strength
      const eg = (g - pal.g[ci]) * strength
      const eb = (b - pal.b[ci]) * strength
      const steps: [number, number, number][] = [
        [7 * f, 0, 1],
        [3 * (1 - f), 1, -1],
        [5, 1, 0],
        [1, 1, 1],
      ]
      for (const [w, dy, dxDir] of steps) {
        if (w === 0) continue
        const nx = x + dxDir * dir
        const ny = y + dy
        if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
        const to = (ny * tw + nx) * 4
        work[to] += (er * w) / 16
        work[to + 1] += (eg * w) / 16
        work[to + 2] += (eb * w) / 16
      }
    }
  }
}

/** Dot-Diffusion class matrix: which cells take error first (0 = darkest class). */
const DOT_CLASS = [
  [0, 2, 4, 6],
  [1, 3, 5, 7],
  [0, 2, 4, 6],
  [1, 3, 5, 7],
]

/**
 * Dot-Diffusion: error flows from dark classes to bright ones along the scan direction, scaled by
 * the current cell's class — a grainy, evenly textured look.
 */
export function mapDotDiffusion(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
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
      const cls = DOT_CLASS[y % 4][x % 4]
      const nx = x + dir
      if (nx < 0 || nx >= tw) continue
      const scale = strength / (cls + 1)
      const to = (y * tw + nx) * 4
      work[to] += (r - pal.r[ci]) * scale
      work[to + 1] += (g - pal.g[ci]) * scale
      work[to + 2] += (b - pal.b[ci]) * scale
    }
  }
}

/**
 * Riemersma: a decaying error memory along the (serpentine) scan path — no spatial neighbor spread,
 * so the texture stays quiet and slightly blurred.
 */
export function mapRiemersma(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
  const decay = strength * (1 / 16)
  const br = new Float64Array(16)
  const bg = new Float64Array(16)
  const bb = new Float64Array(16)
  let head = 0
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
      const r = clamp255(sample[o] + br[head])
      const g = clamp255(sample[o + 1] + bg[head])
      const b = clamp255(sample[o + 2] + bb[head])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      br[head] = (r - pal.r[ci]) * decay
      bg[head] = (g - pal.g[ci]) * decay
      bb[head] = (b - pal.b[ci]) * decay
      head = (head + 1) % 16
    }
  }
}

/** Special-diffusion strategies by catalog id — the dispatch table behind the 'special' family. */
export const SPECIAL_MAPPERS: Partial<Record<ImportDither, SpecialMapper>> = {
  ostromoukhov: mapOstromoukhov,
  'variable-error': mapVariableError,
  'dot-diffusion': mapDotDiffusion,
  riemersma: mapRiemersma,
  'noise-threshold': mapNoiseThreshold,
  'edge-aware': mapEdgeAware,
  yliluoma: mapYliluoma,
  cmyk: mapCmyk,
}
