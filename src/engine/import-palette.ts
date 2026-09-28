/**
 * User curation of a converted import palette: recolor entries in place, drop colors from the
 * future document palette, mark one color as transparent. Pure post-processing of a conversion
 * result — no re-quantization, cells are remapped to the curated palette.
 */

import { hexToRgb } from './color.ts'
import type { ImportResult } from './import-image.ts'

/** Curated palette: the kept colors in display order plus an optional transparent color. */
export interface PaletteEdit {
  colors: string[]
  /** Cells of this color become empty; the color itself leaves the palette */
  transparent: string | null
}

/** Dedupe case-normalized colors, preserving the first occurrence of each. */
function dedupe(colors: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of colors) {
    const key = c.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * Apply a palette edit to a conversion result: kept colors reindex the cells, edited hexes recolor
 * them in place, removed colors remap their cells to the nearest kept color, and the transparent
 * color empties its cells. The result is directly applicable by `importPixels`.
 */
export function curateImportPalette(result: ImportResult, edit: PaletteEdit): ImportResult {
  const transparent = edit.transparent?.toLowerCase() ?? null
  const colors = dedupe(edit.colors).filter((c) => c !== transparent)
  const valueOf = new Map<string, number>()
  colors.forEach((c, i) => valueOf.set(c, i + 1))
  const rgbs = colors.map((c) => hexToRgb(c) ?? { r: 0, g: 0, b: 0 })
  // a removed color's cells go to the nearest kept color (RGB distance); with nothing kept
  // the artwork empties out
  const nearest = (hex: string): number => {
    const p = hexToRgb(hex)
    if (!p || rgbs.length === 0) return 0
    let best = 0
    let bestD = Infinity
    rgbs.forEach((q, i) => {
      const d = (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best + 1
  }
  const cells = new Uint16Array(result.cells.length)
  for (let i = 0; i < result.cells.length; i++) {
    const v = result.cells[i]
    if (v === 0) continue
    const hex = result.palette[(v - 1) % result.palette.length].toLowerCase()
    if (hex === transparent) continue
    cells[i] = valueOf.get(hex) ?? nearest(hex)
  }
  return { ...result, palette: colors, cells }
}
