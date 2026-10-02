/**
 * Ordered (threshold-matrix) dithering for the image import: each pixel's tone along the axis
 * between its two nearest palette colors is compared against a threshold field — Bayer, cluster
 * dot, halftone, blue noise, void-and-cluster, pattern or crosshatch. Pure.
 */

import { blueNoise16 } from './dither-blue-noise.ts'
import type { ImportDither } from './dither-catalog.ts'
import {
  fractalNoiseAt,
  ignAt,
  screen45At,
  screenWaveAt,
  linesDiagAt,
  linesHAt,
  linesVAt,
  phyllotaxisAt,
  ringsAt,
  spiralAt,
  sunburstAt,
  zigzagAt,
} from './dither-fields.ts'
import {
  BAYER2,
  BAYER4,
  BAYER8,
  BAYER16,
  BAYER32,
  CLUSTER4,
  HALFTONE4,
  BLUE_NOISE8,
  VOID_CLUSTER8,
  PATTERN8,
  ROSETTE8,
  ELLIPTICAL8,
  EUCLIDEAN8,
  WEAVE8,
  TWILL8,
  HOUNDSTOOTH8,
  thresholdAt,
  crosshatchAt,
} from './dither-matrices.ts'
import type { GlyphTileSet } from './glyph-tiles.ts'
import { glyphSetToField } from './glyph-tiles.ts'
import { nearestIndex, type PaletteRgb } from './import-shared.ts'

/** Per-pipeline ordered-dither parameters shared by every pixel. */
export interface OrderedCtx {
  pal: PaletteRgb
  fieldAt: (x: number, y: number) => number
  strength: number
  threshold: number
}

/**
 * Ordered dithering generalized to a palette: for each pixel the two nearest palette colors form an
 * axis; the pixel's tone along it is compared against a threshold field. Strength scales the
 * matrix's influence (0 = a clean 50% split at the threshold bias) and the threshold bias shifts
 * the cutoff.
 */
export function mapOrdered(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: OrderedCtx,
  out: Int32Array,
): void {
  const { pal, fieldAt, strength, threshold } = ctx
  const T = threshold / 255
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
      const c1 = nearestIndex(pal, r, g, b)
      const c2 = nearestIndex(pal, r, g, b, c1)
      if (c2 < 0) {
        out[p] = c1
        continue
      }
      const vx = pal.r[c2] - pal.r[c1]
      const vy = pal.g[c2] - pal.g[c1]
      const vz = pal.b[c2] - pal.b[c1]
      const len2 = vx * vx + vy * vy + vz * vz
      let t = 0.5
      if (len2 > 0) {
        t = ((r - pal.r[c1]) * vx + (g - pal.g[c1]) * vy + (b - pal.b[c1]) * vz) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
      }
      out[p] = t > T - (0.5 - fieldAt(x, y)) * strength ? c2 : c1
    }
  }
}

/** Threshold-field accessors for the ordered dithers. */
function matrixField(
  m: readonly (readonly number[])[],
  n: number,
  levels: number,
): (x: number, y: number) => number {
  return (x, y) => thresholdAt(m, n, levels, x, y)
}

export const ORDERED_FIELDS: Partial<Record<ImportDither, (x: number, y: number) => number>> = {
  bayer2: matrixField(BAYER2, 2, 4),
  bayer4: matrixField(BAYER4, 4, 16),
  bayer8: matrixField(BAYER8, 8, 64),
  bayer16: matrixField(BAYER16, 16, 256),
  bayer32: matrixField(BAYER32, 32, 1024),
  'cluster-dot': matrixField(CLUSTER4, 4, 16),
  halftone: matrixField(HALFTONE4, 4, 16),
  rosette: matrixField(ROSETTE8, 8, 64),
  elliptical: matrixField(ELLIPTICAL8, 8, 64),
  euclidean: matrixField(EUCLIDEAN8, 8, 64),
  'lines-h': linesHAt,
  'lines-v': linesVAt,
  'lines-diag': linesDiagAt,
  'screen-45': screen45At,
  'screen-wave': screenWaveAt,
  ign: ignAt,
  'blue-noise': matrixField(BLUE_NOISE8, 8, 16),
  'blue-noise-16': matrixField(blueNoise16(), 16, 256),
  'void-cluster': matrixField(VOID_CLUSTER8, 8, 256),
  pattern: matrixField(PATTERN8, 8, 32),
  crosshatch: crosshatchAt,
  spiral: spiralAt,
  rings: ringsAt,
  sunburst: sunburstAt,
  phyllotaxis: phyllotaxisAt,
  zigzag: zigzagAt,
  'fractal-noise': fractalNoiseAt,
  weave: matrixField(WEAVE8, 8, 64),
  twill: matrixField(TWILL8, 8, 64),
  houndstooth: matrixField(HOUNDSTOOTH8, 8, 64),
}

/**
 * Threshold field for an ordered dither; the custom-matrix strategy projects the user's glyph tile
 * set into a field (falling back to Bayer 4 when none is picked).
 */
export function orderedFieldFor(
  id: ImportDither,
  glyphSet: GlyphTileSet | null,
): ((x: number, y: number) => number) | undefined {
  if (id === 'custom-matrix') {
    return glyphSet ? glyphSetToField(glyphSet) : matrixField(BAYER4, 4, 16)
  }
  return ORDERED_FIELDS[id]
}
