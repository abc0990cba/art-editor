/**
 * Glyph-tile dithering for the image import (tile sets live in engine/glyph-tiles.ts): tone glyphs
 * pick between the two palette colors bracketing the pixel's tone; palette glyphs spread the
 * palette across tile levels for a per-color glyph mosaic. Pure.
 */

import type { ImportDither } from './dither-catalog.ts'
import { glyphCellAt, type GlyphTileSet } from './glyph-tiles.ts'
import { nearestIndex, type PaletteRgb } from './import-shared.ts'

/** Per-pipeline glyph parameters shared by every pixel. */
export interface GlyphCtx {
  pal: PaletteRgb
  set: GlyphTileSet
  strength: number
}

/** One glyph strategy: fills `out` with palette indices for the sample. */
export type GlyphMapper = (
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: GlyphCtx,
  out: Int32Array,
) => void

/** Deterministic [0,1) hash of the cell position — mixes nearest fallback under strength < 1. */
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) | 0
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

/**
 * Tone glyph dithering: the pixel tone picks a tile from the set; the tile cell under the repeating
 * grid decides between the two palette colors bracketing the tone (mapOrdered's two-color axis,
 * with the matrix replaced by a user-editable tile). Strength mixes the tile decision with plain
 * nearest colors deterministically.
 */
export function mapGlyphTone(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: GlyphCtx,
  out: Int32Array,
): void {
  const { pal, set, strength } = ctx
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
      const on = glyphCellAt(set, x, y, t)
      const useTile = strength >= 1 || cellHash(x, y) < strength
      out[p] = useTile && on ? c2 : useTile && !on ? c1 : c1
    }
  }
}

/**
 * Palette glyph dithering: palette colors are ordered by luminance and spread across the tile
 * levels; the nearest color's tile decides whether it stays or steps to the next luminance neighbor
 * — the artwork becomes a mosaic of different glyphs per color.
 */
export function mapGlyphPalette(
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: GlyphCtx,
  out: Int32Array,
): void {
  const { pal, set, strength } = ctx
  const k = pal.r.length
  const order: number[] = []
  for (let i = 0; i < k; i++) order.push(i)
  order.sort((a, b) => {
    const la = 0.299 * pal.r[a] + 0.587 * pal.g[a] + 0.114 * pal.b[a]
    const lb = 0.299 * pal.r[b] + 0.587 * pal.g[b] + 0.114 * pal.b[b]
    return la - lb
  })
  const rankOf = new Array<number>(k)
  order.forEach((c, rank) => {
    rankOf[c] = rank
  })
  const levelCount = set.levels.length
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
      const level = Math.round((rankOf[c1] / Math.max(1, k - 1)) * (levelCount - 1))
      const on = glyphCellAt(set, x, y, levelCount <= 1 ? 0 : level / (levelCount - 1))
      const useTile = strength >= 1 || cellHash(x, y) < strength
      if (!useTile || on || k <= 1) {
        out[p] = c1
        continue
      }
      // step toward the next luminance neighbor (wrap) — keeps the glyph mosaic alive
      const nextRank = (rankOf[c1] + 1) % k
      out[p] = order[nextRank]
    }
  }
}

/** Glyph strategies by catalog id — the dispatch table behind the 'glyph' family. */
export const GLYPH_MAPPERS: Partial<Record<ImportDither, GlyphMapper>> = {
  glyph: mapGlyphTone,
  'palette-glyph': mapGlyphPalette,
  ascii: mapGlyphTone,
  braille: mapGlyphTone,
}
