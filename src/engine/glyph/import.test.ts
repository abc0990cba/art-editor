import { describe, expect, it } from 'vitest'

import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  type ImportBitmap,
  type ImportOptions,
} from '../import/index.ts'
import type { GlyphTileSet } from './tiles.ts'

const bmp = (
  w: number,
  h: number,
  px: (x: number, y: number) => [number, number, number, number],
): ImportBitmap => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      const o = (y * w + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    }
  }
  return { width: w, height: h, data }
}

const opts = (patch: Partial<ImportOptions>): ImportOptions => ({
  ...DEFAULT_IMPORT_OPTIONS,
  dither: 'none',
  ...patch,
})

const grid = (cols: number, rows: number) => ({ cols, rows, sub: 1 as const })

const at = (r: { cells: Uint16Array }, bw: number, x: number, y: number): number =>
  r.cells[y * bw + x]

// 2×1 set: mid tone inks even columns only
const midLines: GlyphTileSet = {
  name: 'lines',
  w: 2,
  h: 1,
  levels: [
    [false, false],
    [true, false],
    [true, true],
  ],
}

describe('glyph dither import', glyphImport)

function glyphImport() {
  it('tone glyph: mid-gray renders the tile rhythm between two palette colors', () => {
    const r = convertImage(
      bmp(4, 2, (x) => [x % 2 === 0 ? 77 : 77, 77, 77, 255]),
      opts({
        fit: 'stretch',
        dither: 'glyph',
        ditherStrength: 100,
        glyphSet: midLines,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
        pixelScale: 1,
      }),
      grid(4, 2),
      [],
    )
    // gray 77 sits at t≈0.30 between black and white → level 1 → even x inked (white)
    const row = [at(r, 4, 0, 0), at(r, 4, 1, 0), at(r, 4, 2, 0), at(r, 4, 3, 0)]
    expect(row).toEqual([2, 1, 2, 1])
  })

  it('strength 0 falls back to plain nearest', () => {
    const r = convertImage(
      bmp(4, 1, () => [77, 77, 77, 255]),
      opts({
        fit: 'stretch',
        dither: 'glyph',
        ditherStrength: 0,
        glyphSet: midLines,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(4, 1),
      [],
    )
    expect(new Set([at(r, 4, 0, 0), at(r, 4, 1, 0), at(r, 4, 2, 0)])).toEqual(new Set([1]))
  })

  it('null glyphSet degrades to nearest (no crash)', () => {
    const r = convertImage(
      bmp(2, 1, () => [77, 77, 77, 255]),
      opts({
        fit: 'stretch',
        dither: 'glyph',
        glyphSet: null,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(2, 1),
      [],
    )
    expect(new Set([at(r, 2, 0, 0), at(r, 2, 1, 0)])).toEqual(new Set([1]))
  })

  it('palette-glyph shifts off cells to the next luminance neighbor', () => {
    const r = convertImage(
      bmp(4, 1, () => [10, 10, 10, 255]),
      opts({
        fit: 'stretch',
        dither: 'palette-glyph',
        ditherStrength: 100,
        glyphSet: midLines,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(4, 1),
      [],
    )
    // black's tile is level 0 = all-off → every cell wraps to the next luminance color
    const row = [at(r, 4, 0, 0), at(r, 4, 1, 0), at(r, 4, 2, 0), at(r, 4, 3, 0)]
    expect(new Set(row)).toEqual(new Set([2]))
  })

  it('classic methods still work: bayer2 ordered dither runs unchanged', () => {
    const r = convertImage(
      bmp(4, 1, () => [128, 128, 128, 255]),
      opts({
        fit: 'stretch',
        dither: 'bayer2',
        ditherStrength: 100,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(4, 1),
      [],
    )
    const row = [at(r, 4, 0, 0), at(r, 4, 1, 0)]
    expect(new Set(row)).toEqual(new Set([1, 2]))
  })
}
