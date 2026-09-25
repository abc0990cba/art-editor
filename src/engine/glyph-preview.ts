/**
 * Photo preview dithering for the glyph gallery: renders an image through a glyph tile set at a
 * chosen grid resolution — same tone → tile mapping the import dithering uses, sampled per grid
 * cell with the tile's sub-cells drawn inside it.
 *
 * Works on a plain { width, height, data } raster (no DOM ImageData needed), so it stays testable
 * in node; ImageData is structurally compatible on both sides.
 */

import { type GlyphTileSet } from './glyph-tiles.ts'

export interface Raster {
  width: number
  height: number
  // ArrayBuffer-backed (not Shared) so ImageData accepts it directly in the browser
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Ink and paper of the preview render (canvas-drawn, fixed like a print). */
const INK = { r: 26, g: 26, b: 30 }
const PAPER = { r: 242, g: 242, b: 240 }

/**
 * Dither `src` through `set` on a grid of `cols` cells across (rows follow the aspect ratio).
 * Returns a new raster of the same size: each grid cell shows the set's tile with its w×h
 * sub-cells, inked by the cell's average luminance.
 */
export function ditherImageWithGlyph(src: Raster, set: GlyphTileSet, cols: number): Raster {
  const cols1 = Math.max(1, Math.min(Math.round(cols), src.width))
  const cellW = src.width / cols1
  const rows = Math.max(1, Math.round(src.height / cellW))
  const cellH = src.height / rows

  // per-cell average luminance (0 = black, 1 = white)
  const sums = new Float64Array(cols1 * rows)
  const counts = new Float64Array(cols1 * rows)
  const { data } = src
  for (let y = 0; y < src.height; y++) {
    const cy = Math.min(rows - 1, Math.floor(y / cellH))
    for (let x = 0; x < src.width; x++) {
      const cx = Math.min(cols1 - 1, Math.floor(x / cellW))
      const i = cy * cols1 + cx
      const o = (y * src.width + x) * 4
      sums[i] += (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
      counts[i]++
    }
  }

  const out = new Uint8ClampedArray(src.data.length)
  const levelCount = set.levels.length
  for (let y = 0; y < src.height; y++) {
    const cy = Math.min(rows - 1, Math.floor(y / cellH))
    // position inside the cell → which tile sub-cell this pixel belongs to
    const sy = Math.min(set.h - 1, Math.floor(((y / cellH) % 1) * set.h))
    for (let x = 0; x < src.width; x++) {
      const cx = Math.min(cols1 - 1, Math.floor(x / cellW))
      const sx = Math.min(set.w - 1, Math.floor(((x / cellW) % 1) * set.w))
      const lum = sums[cy * cols1 + cx] / counts[cy * cols1 + cx]
      const tone = 1 - lum
      const idx = Math.min(levelCount - 1, Math.max(0, Math.round(tone * (levelCount - 1))))
      const on = set.levels[idx][sy * set.w + sx]
      const c = on ? INK : PAPER
      const o = (y * src.width + x) * 4
      out[o] = c.r
      out[o + 1] = c.g
      out[o + 2] = c.b
      out[o + 3] = 255
    }
  }
  return { width: src.width, height: src.height, data: out }
}
