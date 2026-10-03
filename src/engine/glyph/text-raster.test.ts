import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from '../core/doc.ts'
import { TEXT_NODES } from '../nodes/text.node.ts'
import { Resolved, type RasterNodeDef } from '../nodes/types.ts'
import { buildAscii } from '../output/ascii-export.ts'
import { FONT_H, FONT_W, fontCharset, glyphRows } from './font.ts'
import {
  ASCII_RAMPS,
  brailleGlyphSet,
  builtinDitherSets,
  charDensity,
  charForTone,
  textTiles,
  asciiGlyphSet,
} from './text-raster.ts'

describe('bitmap font', () => {
  it('every glyph is 5×7 and the charset is non-trivial', () => {
    expect(fontCharset().length).toBeGreaterThan(40)
    for (const ch of fontCharset()) {
      const rows = glyphRows(ch)
      expect(rows.length).toBe(FONT_H)
      for (const row of rows) expect(row.length).toBe(FONT_W)
    }
  })

  it('unknown characters rasterize blank', () => {
    for (const row of glyphRows('日')) expect(row).toBe('.....')
  })
})

describe('text tiles', () => {
  it('lays glyphs out with tracking and line height', () => {
    const { w, h, tiles } = textTiles('AB')
    expect(w).toBe(FONT_W * 2 + 1)
    expect(h).toBe(FONT_H)
    expect(tiles.filter(Boolean).length).toBeGreaterThan(0)
    const twoLines = textTiles('A\nB')
    expect(twoLines.h).toBe(FONT_H * 2)
  })

  it('stamps a known pixel of a known glyph', () => {
    const { w, tiles } = textTiles('T')
    // T's top row is '#####'
    for (let x = 0; x < FONT_W; x++) expect(tiles[x]).toBe(true)
    // the stem: center column only
    expect(tiles[3 * w + 2]).toBe(true)
    expect(tiles[3 * w + 1]).toBe(false)
  })
})

describe('tone ramps', () => {
  it('charForTone reads light → dark and clamps', () => {
    const ramp = ASCII_RAMPS['classic']
    expect(charForTone(ramp, 0)).toBe(' ')
    expect(charForTone(ramp, 1)).toBe('@')
    expect(charForTone(ramp, -3)).toBe(' ')
    expect(charForTone(ramp, 9)).toBe('@')
  })

  it('ramp order matches glyph ink coverage', () => {
    const ramp = ASCII_RAMPS['classic']
    let prev = -1
    for (const ch of ramp) {
      const d = charDensity(ch)
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })
})

describe('glyph-set bridges', () => {
  it('asciiGlyphSet maps the ramp onto 5×7 levels', () => {
    const set = asciiGlyphSet(ASCII_RAMPS['classic'], 'test')
    expect(set.levels.length).toBe(ASCII_RAMPS['classic'].length)
    expect(set.w).toBe(FONT_W)
    expect(set.h).toBe(FONT_H)
    expect(set.levels[0].every((c) => !c)).toBe(true)
    expect(set.levels[set.levels.length - 1].some((c) => c)).toBe(true)
  })

  it('brailleGlyphSet orders 256 masks by raised-dot count', () => {
    const set = brailleGlyphSet()
    expect(set.levels.length).toBe(257)
    expect(set.w).toBe(2)
    expect(set.h).toBe(4)
    expect(set.levels[0].every((c) => !c)).toBe(true)
    const pop = (cells: boolean[]): number => cells.filter(Boolean).length
    for (let i = 1; i < set.levels.length; i++) {
      expect(pop(set.levels[i])).toBeGreaterThanOrEqual(pop(set.levels[i - 1]))
    }
  })

  it('the builtin dither sets are memoized and complete', () => {
    const a = builtinDitherSets()
    expect(a['ascii']).toBeTruthy()
    expect(a['braille']).toBeTruthy()
    expect(a).toBe(builtinDitherSets())
  })
})

describe('ascii text export', () => {
  const doc = (): Doc => {
    const d = defaultDoc()
    d.cols = 4
    d.rows = 2
    d.sub = 1
    d.palette = ['#000000', '#ffffff']
    d.cells = new Uint16Array(8)
    for (let x = 0; x < 4; x++) d.cells[x] = 1 // dark top row
    return d
  }

  it('dark cells become dense characters, empty cells spaces', () => {
    const text = buildAscii(doc())
    const lines = text.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe('@@@@')
    expect(lines[1]).toBe('')
  })

  it('inverts for dark backgrounds', () => {
    const lines = buildAscii(doc(), ASCII_RAMPS['classic'], true).split('\n')
    expect(lines[0].trim()).toBe('')
  })
})

describe('source.text node', () => {
  const def = TEXT_NODES[0] as RasterNodeDef
  const ctx = {
    bw: 32,
    bh: 16,
    paletteLen: 4,
    hexValue: (hex: string): number => (hex === '#111111' ? 3 : 1),
    luma: () => 0.5,
    rng: () => 0.5,
  }
  const params = (over: Record<string, unknown>): Resolved =>
    new Resolved({
      text: 'T',
      dx: 1,
      dy: 1,
      scale: 1,
      tracking: 1,
      color: '#111111',
      ...over,
    })

  it('stamps the glyph pixels at the offset with the chosen ink', () => {
    const cells = def.evaluate(ctx, params({}), new Map())
    expect(cells.size).toBe(5 + 6) // T: top row of 5 + a 6-tall center stem? rows 1..6 → 6 px
    expect([...new Set(cells.values())]).toEqual([3])
  })

  it('is deterministic and clips out-of-bounds text', () => {
    const a = def.evaluate(ctx, params({}), new Map())
    const b = def.evaluate(ctx, params({}), new Map())
    expect(a).toEqual(b)
    const off = def.evaluate(ctx, params({ dx: -100 }), new Map())
    expect(off.size).toBe(0)
  })
})
