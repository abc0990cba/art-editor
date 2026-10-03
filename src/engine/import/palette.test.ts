import { describe, expect, it } from 'vitest'

import type { ImportResult } from './index.ts'
import { curateImportPalette } from './palette.ts'

/** 2×2 image, black→1 white→2 red→3; cell (1,1) empty. */
function result(): ImportResult {
  const cells = new Uint16Array([1, 2, 3, 0])
  return { cols: 2, rows: 2, palette: ['#000000', '#ffffff', '#ff0000'], cells }
}

describe('curateImportPalette', () => {
  it('recoloring an entry repaints its cells without touching the others', () => {
    const out = curateImportPalette(result(), {
      colors: ['#0000ff', '#ffffff', '#ff0000'],
      transparent: null,
    })
    expect(out.palette).toEqual(['#0000ff', '#ffffff', '#ff0000'])
    expect([...out.cells]).toEqual([1, 2, 3, 0])
  })

  it('a removed color remaps its cells to the nearest kept color', () => {
    const out = curateImportPalette(result(), {
      colors: ['#000000', '#ffe0e0'],
      transparent: null,
    })
    expect(out.palette).toEqual(['#000000', '#ffe0e0'])
    // black stays; white→light pink (255-224)² ·2 < (255)²·3; red→black (255² < 224²·2)
    expect([...out.cells]).toEqual([1, 2, 1, 0])
  })

  it('the transparent color empties its cells and leaves the palette', () => {
    const out = curateImportPalette(result(), {
      colors: ['#000000', '#ffffff', '#ff0000'],
      transparent: '#ffffff',
    })
    expect(out.palette).toEqual(['#000000', '#ff0000'])
    expect([...out.cells]).toEqual([1, 0, 2, 0])
  })

  it('removing every color empties the artwork', () => {
    const out = curateImportPalette(result(), { colors: [], transparent: null })
    expect(out.palette).toEqual([])
    expect([...out.cells]).toEqual([0, 0, 0, 0])
  })

  it('duplicate entries collapse case-insensitively', () => {
    const out = curateImportPalette(result(), {
      colors: ['#000000', '#FFFFFF', '#000000'],
      transparent: null,
    })
    expect(out.palette).toEqual(['#000000', '#ffffff'])
  })
})
