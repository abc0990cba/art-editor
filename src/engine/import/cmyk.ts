/**
 * CMYK rosette separation for the image import: the pixel is separated into process inks, each
 * screened at its own rosette angle (C 15°, M 75°, Y 0°, K 45°) against a clustered-dot matrix; the
 * binary inks composite subtractively and snap to the conversion palette. Pure.
 */

import { ROSETTE8, thresholdAt } from '../dither/matrices.ts'
import type { SpecialCtx } from './shared.ts'
import { clamp255, nearestIndex } from './shared.ts'

/** Deterministic [0,1) hash of a cell position — mixes nearest fallback under strength < 1. */
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) | 0
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

const ANGLES: readonly number[] = [15, 75, 0, 45].map((d) => (d * Math.PI) / 180)

/** Screen decision for one ink at cell (x, y): rank below the ink coverage prints the ink. */
function inkOn(channel: number, x: number, y: number, angle: number): boolean {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const u = Math.round(x * ca + y * sa)
  const v = Math.round(y * ca - x * sa)
  return thresholdAt(ROSETTE8, 8, 64, u, v) < channel
}

/**
 * CMYK: four rosette screens overprint subtractively — where an ink prints, its channel multiplies
 * down; the overprint color snaps to the palette. Strength mixes the screening with plain nearest
 * colors deterministically.
 */
export function mapCmyk(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
): void {
  const { pal, strength } = ctx
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
      if (strength <= 0 || cellHash(x, y) >= strength) {
        out[p] = nearest
        continue
      }
      let c = 1 - r / 255
      let m = 1 - g / 255
      let yy = 1 - b / 255
      const k = Math.min(c, m, yy)
      if (k < 1) {
        c = (c - k) / (1 - k)
        m = (m - k) / (1 - k)
        yy = (yy - k) / (1 - k)
      } else {
        c = 0
        m = 0
        yy = 0
      }
      const plates = [c, m, yy, k]
      let cr = 1
      let cg = 1
      let cb = 1
      for (let i = 0; i < 4; i++) {
        if (!inkOn(plates[i], x, y, ANGLES[i])) continue
        if (i === 0) cr = 0
        else if (i === 1) cg = 0
        else if (i === 2) cb = 0
        else {
          cr = Math.min(cr, 0.08)
          cg = Math.min(cg, 0.08)
          cb = Math.min(cb, 0.08)
        }
      }
      out[p] = nearestIndex(pal, clamp255(cr * 255), clamp255(cg * 255), clamp255(cb * 255))
    }
  }
}
