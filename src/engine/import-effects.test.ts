import { describe, expect, it } from 'vitest'

import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  type ImportBitmap,
  type ImportOptions,
} from './import-image.ts'

const BW = ['#000000', '#ffffff']
const GRID = { cols: 24, rows: 24, sub: 1 as const }
const base = (over: Partial<ImportOptions>): ImportOptions => ({
  ...DEFAULT_IMPORT_OPTIONS,
  ...over,
  palette: over.palette ?? { kind: 'preset', colors: [...BW] },
})

/** Horizontal bands of dark / mid / light gray, one 8-row band each. */
const bandImage = (): ImportBitmap => {
  const data = new Uint8ClampedArray(24 * 24 * 4)
  for (let y = 0; y < 24; y++) {
    const v = y < 8 ? 24 : y < 16 ? 128 : 232
    for (let x = 0; x < 24; x++) {
      const o = (y * 24 + x) * 4
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return { width: 24, height: 24, data }
}

/** Solid gray image. */
const solidGray = (v: number): ImportBitmap => {
  const data = new Uint8ClampedArray(24 * 24 * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  return { width: 24, height: 24, data }
}

describe('hybrid band dithering', () => {
  const opts = base({
    dither: 'hybrid',
    hybridLow: 'lines-h',
    hybridMid: 'blue-noise',
    hybridHigh: 'lines-diag',
  })

  it('each uniform tone equals the direct conversion with that band algorithm', () => {
    const cases: [number, 'lines-h' | 'blue-noise' | 'lines-diag'][] = [
      [24, 'lines-h'],
      [128, 'blue-noise'],
      [232, 'lines-diag'],
    ]
    for (const [gray, algorithm] of cases) {
      const hybrid = convertImage(solidGray(gray), opts, GRID, BW)
      const direct = convertImage(solidGray(gray), base({ dither: algorithm }), GRID, BW)
      expect(hybrid.cells, `gray ${gray}`).toEqual(direct.cells)
    }
  })

  it('is deterministic', () => {
    expect(convertImage(bandImage(), opts, GRID, BW).cells).toEqual(
      convertImage(bandImage(), opts, GRID, BW).cells,
    )
  })

  it('nested hybrid band ids degrade to nearest instead of recursing', () => {
    const nested = convertImage(
      bandImage(),
      base({ dither: 'hybrid', hybridLow: 'hybrid' }),
      GRID,
      BW,
    )
    for (const v of nested.cells) expect(v).toBeLessThanOrEqual(BW.length)
  })
})

describe('posterize jitter', () => {
  it('reduces the gray ramp to a few flat tones', () => {
    const data = new Uint8ClampedArray(24 * 24 * 4)
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const o = (y * 24 + x) * 4
        const v = Math.round((x / 23) * 255)
        data[o] = v
        data[o + 1] = v
        data[o + 2] = v
        data[o + 3] = 255
      }
    }
    // posterize onto a gray palette so the band count is directly readable
    const grays = ['#000000', '#555555', '#aaaaaa', '#ffffff']
    const { cells } = convertImage(
      { width: 24, height: 24, data },
      base({
        dither: 'posterize',
        posterizeLevels: 3,
        palette: { kind: 'preset', colors: grays },
        ditherStrength: 30,
      }),
      GRID,
      grays,
    )
    const used = new Set([...cells].filter((v) => v > 0))
    expect(used.size).toBeGreaterThan(1)
    expect(used.size).toBeLessThanOrEqual(4)
  })
})

describe('duotone gradient map', () => {
  it('projects the sample onto the two inks before quantization', () => {
    const inks = ['#0000ff', '#ffff00']
    const { cells, palette } = convertImage(
      solidGray(40),
      base({
        dither: 'none',
        duotone: { dark: '#0000ff', light: '#ffff00' },
        palette: { kind: 'preset', colors: inks },
      }),
      GRID,
      inks,
    )
    const used = [...cells].filter((v) => v > 0).map((v) => palette[v - 1])
    expect(used.length).toBeGreaterThan(0)
    for (const hex of used) expect(inks).toContain(hex)
    // a dark image leans to the dark ink
    expect(used.every((hex) => hex === '#0000ff')).toBe(true)
  })
})

describe('edge outline', () => {
  it('inks the boundary between two flat areas', () => {
    const data = new Uint8ClampedArray(24 * 24 * 4)
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const o = (y * 24 + x) * 4
        const v = x < 12 ? 30 : 225
        data[o] = v
        data[o + 1] = v
        data[o + 2] = v
        data[o + 3] = 255
      }
    }
    const img = { width: 24, height: 24, data }
    const plain = convertImage(img, base({ dither: 'none' }), GRID, BW)
    const outlined = convertImage(img, base({ dither: 'none', edgeOutline: 90 }), GRID, BW)
    let gained = 0
    for (let p = 0; p < plain.cells.length; p++) {
      if (plain.cells[p] !== 1 && outlined.cells[p] === 1) gained++
    }
    expect(gained).toBeGreaterThan(0)
    // the flat interiors stay untouched
    expect(outlined.cells[5 * 24 + 2]).toBe(plain.cells[5 * 24 + 2])
    expect(outlined.cells[5 * 24 + 21]).toBe(plain.cells[5 * 24 + 21])
  })
})

describe('custom ascii ramp', () => {
  it('overrides the builtin character set', () => {
    const img = bandImage()
    const def = convertImage(img, base({ dither: 'ascii' }), GRID, BW)
    const custom = convertImage(img, base({ dither: 'ascii', asciiRamp: ' .:#' }), GRID, BW)
    expect(def.cells).not.toEqual(custom.cells)
    expect(convertImage(img, base({ dither: 'ascii', asciiRamp: ' .:#' }), GRID, BW).cells).toEqual(
      custom.cells,
    )
  })
})
