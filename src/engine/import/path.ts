/**
 * Path-driven error diffusion: a decaying 16-slot error memory consumed along a scan path (column,
 * diagonal, spiral, Hilbert, seeded-random) — Riemersma's memory model generalized to arbitrary
 * visit orders. No spatial neighbor spread, so the texture stays quiet while the path gives each
 * variant its own directional grain. Pure.
 */

import type { ImportDither } from '../dither/catalog.ts'
import { scanOrder, type ScanKind } from '../dither/scans.ts'
import { clamp255, nearestIndex, type PaletteRgb } from './shared.ts'

/** Per-pipeline path-diffusion parameters. */
export interface PathCtx {
  pal: PaletteRgb
  order: Int32Array
  strength: number
}

/** Error memory with exponential decay walked along the visit order. */
export function mapPathDiffusion(
  sample: Float64Array,
  _tw: number,
  _th: number,
  ctx: PathCtx,
  out: Int32Array,
): void {
  const { pal, order, strength } = ctx
  const decay = strength * (1 / 16)
  const br = new Float64Array(16)
  const bg = new Float64Array(16)
  const bb = new Float64Array(16)
  let head = 0
  for (let k = 0; k < order.length; k++) {
    const p = order[k]
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

/** Scan path per catalog id — the dispatch table behind the 'path' family. */
export const PATH_DIFFUSIONS: Partial<Record<ImportDither, ScanKind>> = {
  'column-path': 'column',
  'diagonal-path': 'diagonal',
  'spiral-path': 'spiral',
  hilbert: 'hilbert',
  'random-path': 'random',
}

/** Visit order for a path dither, or undefined when the id is not a path strategy. */
export function pathOrderFor(id: ImportDither, tw: number, th: number): Int32Array | undefined {
  const kind = PATH_DIFFUSIONS[id]
  return kind ? scanOrder(kind, tw, th) : undefined
}
