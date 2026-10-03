/**
 * ASCII text export: one character per document cell, tone read from the palette luminance — the
 * classic text-art flavor of a dither, copy-pasteable anywhere. Pure.
 */

import { paletteLuma } from '../color/color.ts'
import type { Doc } from '../core/doc.ts'
import { syncDoc } from '../core/scene.ts'
import { ASCII_RAMPS, charForTone } from '../glyph/text-raster.ts'

/**
 * Render the document as text. Empty cells become spaces; each cell's sub-block is averaged into a
 * tone, and `invert` reads light ink as dense characters (for dark backgrounds).
 */
export function buildAscii(
  doc: Doc,
  ramp: string = ASCII_RAMPS['classic'],
  invert = false,
): string {
  const { cells, cols, rows, sub, palette } = syncDoc(doc)
  const lines: string[] = []
  for (let cy = 0; cy < rows; cy++) {
    let line = ''
    for (let cx = 0; cx < cols; cx++) {
      const tone = cellTone(cells, { cols, sub, palette }, cx, cy)
      line += tone === null ? ' ' : charForTone(ramp, invert ? 1 - tone : tone)
    }
    lines.push(line.replace(/\s+$/, ''))
  }
  return lines.join('\n')
}

/** Average ink of one cell's sub-block; null when the cell is empty paper. */
function cellTone(
  cells: Uint16Array,
  lay: { cols: number; sub: number; palette: string[] },
  cx: number,
  cy: number,
): number | null {
  const { cols, sub, palette } = lay
  let ink = 0
  let count = 0
  for (let sy = 0; sy < sub; sy++) {
    for (let sx = 0; sx < sub; sx++) {
      const v = cells[(cy * sub + sy) * cols * sub + cx * sub + sx]
      if (v === 0) continue
      ink += 1 - paletteLuma(palette, v)
      count++
    }
  }
  return count === 0 ? null : ink / count
}
