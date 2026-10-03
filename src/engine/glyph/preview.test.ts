import { describe, expect, it } from 'vitest'

import { BAYER2 } from '../dither/matrices.ts'
import { ditherImageWithGlyph, type Raster } from './preview.ts'
import { glyphSetFromMatrix } from './tiles.ts'

function flatImage(w: number, h: number, gray: number): Raster {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = gray
    data[i * 4 + 1] = gray
    data[i * 4 + 2] = gray
    data[i * 4 + 3] = 255
  }
  return { width: w, height: h, data }
}

describe('glyph photo preview dithering', () => {
  it('keeps the source size and clamps the grid to the pixel width', () => {
    const out = ditherImageWithGlyph(flatImage(40, 20, 128), glyphSetFromMatrix(BAYER2, 'b'), 999)
    expect(out.width).toBe(40)
    expect(out.height).toBe(20)
  })

  it('renders black input as full ink and white input as bare paper', () => {
    const set = glyphSetFromMatrix(BAYER2, 'b')
    const ink = ditherImageWithGlyph(flatImage(8, 8, 0), set, 2)
    expect(ink.data.filter((_v, i) => (i + 1) % 4 !== 0).every((v) => v > 0)).toBe(true)
    const paper = ditherImageWithGlyph(flatImage(8, 8, 255), set, 2)
    expect(paper.data.filter((_v, i) => (i + 1) % 4 !== 0).every((v) => v > 200)).toBe(true)
  })

  it('mid gray dithers to a mix of ink and paper', () => {
    const out = ditherImageWithGlyph(flatImage(16, 16, 128), glyphSetFromMatrix(BAYER2, 'b'), 4)
    const ink = out.data.filter((v, i) => (i + 1) % 4 !== 0 && v < 100).length
    const total = out.data.filter((_v, i) => (i + 1) % 4 !== 0).length
    const share = ink / total
    expect(share).toBeGreaterThan(0.1)
    expect(share).toBeLessThan(0.9)
  })
})
