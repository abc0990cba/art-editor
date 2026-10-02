/**
 * Text machinery for dithering: ASCII density ramps, braille dot ramps, and the bridges from
 * characters to GlyphTileSets — the boolean-ramp format every glyph consumer (fill pattern, import
 * dithers, glyphSetToField) already speaks. Built-in tile sets for the 'ascii' and 'braille'
 * dithers are generated once and memoized. Pure.
 */

import { FONT_H, FONT_W, glyphRows } from './bitmap-font.ts'
import type { GlyphTileCells, GlyphTileSet } from './glyph-tiles.ts'

/** Character ramps, light → dark. The first character should read as empty paper. */
export const ASCII_RAMPS: Record<string, string> = {
  classic: ' .:-=+*0#@',
  blocks: ' .:-=+*O0@',
  minimal: ' .*#@',
}

/** Tone in 0..1 ink → the ramp character that reads as that density (light characters first). */
export function charForTone(ramp: string, tone: number): string {
  if (ramp.length === 0) return ' '
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(tone * (ramp.length - 1))))
  return ramp[i]
}

/** Ink coverage of a character's bitmap-font glyph (0..1) — the tone it reads as. */
export function charDensity(ch: string): number {
  const rows = glyphRows(ch)
  let ink = 0
  for (const row of rows) for (const c of row) if (c === '#') ink++
  return ink / (FONT_W * FONT_H)
}

export interface TextTiles {
  w: number
  h: number
  /** Row-major booleans, w × h */
  tiles: boolean[]
}

/**
 * Rasterize text into one boolean grid: each glyph is FONT_W×FONT_H cells with one blank tracking
 * column between characters, blank rows collapsed to none (line height = FONT_H).
 */
export function textTiles(text: string, tracking = 1): TextTiles {
  const lines = text.split('\n')
  const track = Math.max(0, Math.round(tracking))
  const chars = lines.map((line) => [...line])
  const w = Math.max(0, ...chars.map((line) => line.length)) * (FONT_W + track) - track
  const h = lines.length * FONT_H
  const tiles: boolean[] = new Array(Math.max(0, w) * Math.max(0, h)).fill(false)
  lines.forEach((line, li) => {
    ;[...line].forEach((ch, ci) => {
      const rows = glyphRows(ch)
      const ox = ci * (FONT_W + track)
      const oy = li * FONT_H
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < FONT_W; rx++) {
          if (row[rx] === '#') tiles[(oy + ry) * w + ox + rx] = true
        }
      })
    })
  })
  return { w: Math.max(0, w), h, tiles }
}

/**
 * ASCII ramp → GlyphTileSet: level k renders ramp[k] in a 5×7 tile; level 0 (paper) stays the blank
 * glyph, so ramps should start with a space.
 */
export function asciiGlyphSet(ramp: string, name: string): GlyphTileSet {
  const levels: GlyphTileCells[] = []
  for (const ch of ramp.length > 0 ? ramp : ' ') {
    const rows = glyphRows(ch)
    const cells: GlyphTileCells = []
    for (let y = 0; y < FONT_H; y++) {
      for (let x = 0; x < FONT_W; x++) cells.push(rows[y][x] === '#')
    }
    levels.push(cells)
  }
  return { name, w: FONT_W, h: FONT_H, levels }
}

/** Braille dot order: the standard 8-dot reading sequence inside the 2×4 cell. */
const BRAILLE_BITS: readonly [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
]

/**
 * Braille ramp: every 2×4 dot pattern of the 8-dot cell, ordered by raised-dot count then bit order
 * — 256 tone levels, twice the resolution of a 4×4 matrix in half the tile.
 */
export function brailleGlyphSet(name = 'braille'): GlyphTileSet {
  const masks: number[] = []
  for (let m = 0; m < 256; m++) masks.push(m)
  const pop = (m: number): number => {
    let c = 0
    while (m) {
      m &= m - 1
      c++
    }
    return c
  }
  masks.sort((a, b) => pop(a) - pop(b) || a - b)
  const levels: GlyphTileCells[] = []
  for (let level = 0; level <= 256; level++) {
    const cells: GlyphTileCells = new Array(8).fill(false)
    if (level > 0) {
      const m = masks[level - 1]
      BRAILLE_BITS.forEach(([bx, by], bit) => {
        if (m & (1 << bit)) cells[by * 2 + bx] = true
      })
    }
    levels.push(cells)
  }
  return { name, w: 2, h: 4, levels }
}

import type { ImportDither } from './dither-catalog.ts'

/** Fixed tile sets behind the dedicated glyph-family dither ids (no picker required). */
let builtin: Partial<Record<ImportDither, GlyphTileSet>> | null = null
export function builtinDitherSets(): Partial<Record<ImportDither, GlyphTileSet>> {
  if (!builtin) {
    builtin = {
      ascii: asciiGlyphSet(ASCII_RAMPS['classic'], 'ascii'),
      braille: brailleGlyphSet(),
    }
  }
  return builtin
}
