import { describe, expect, it } from 'vitest'

import { scanOrder } from './diffusion-scans.ts'
import { blueNoise16 } from './dither-blue-noise.ts'
import {
  DITHER_CATALOG,
  DITHER_FAMILIES,
  dithersOfFamily,
  ORDERED_DITHERS,
  type ImportDither,
} from './dither-catalog.ts'
import {
  fractalNoiseAt,
  ignAt,
  linesDiagAt,
  linesHAt,
  linesVAt,
  phyllotaxisAt,
  ringsAt,
  spiralAt,
  sunburstAt,
  zigzagAt,
} from './dither-fields.ts'
import {
  BAYER32,
  ELLIPTICAL8,
  EUCLIDEAN8,
  HOUNDSTOOTH8,
  ROSETTE8,
  TWILL8,
  WEAVE8,
} from './dither-matrices.ts'
import { DIFFUSION_KERNELS } from './import-diffusion.ts'
import { GLYPH_MAPPERS } from './import-glyph.ts'
import { convertImage, DEFAULT_IMPORT_OPTIONS, type ImportBitmap } from './import-image.ts'
import { orderedFieldFor } from './import-ordered.ts'
import { PATH_DIFFUSIONS } from './import-path.ts'
import { SPECIAL_MAPPERS } from './import-special.ts'

const implOf = (id: ImportDither): unknown => {
  switch (DITHER_CATALOG[id].family) {
    case 'off': {
      return id === 'none' ? 'off' : undefined
    }
    case 'ordered': {
      return orderedFieldFor(id, null)
    }
    case 'diffusion': {
      return DIFFUSION_KERNELS[id]
    }
    case 'path': {
      return PATH_DIFFUSIONS[id]
    }
    case 'special': {
      return SPECIAL_MAPPERS[id] ?? (id === 'posterize' ? 'posterize-dispatch' : undefined)
    }
    case 'hybrid': {
      return 'hybrid-dispatch'
    }
    case 'glyph': {
      return GLYPH_MAPPERS[id]
    }
  }
}

/** Gray ramp with a transparent corner — exercises tone, alpha and palette-bracketing paths. */
const ramp = (w: number, h: number): ImportBitmap => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const v = Math.round((x / (w - 1)) * 255)
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = x < 4 && y < 4 ? 0 : 255
    }
  }
  return { width: w, height: h, data }
}

const BW = ['#000000', '#ffffff']
const GRID = { cols: 24, rows: 24, sub: 1 as const }
const base = (dither: ImportDither): Parameters<typeof convertImage>[1] => ({
  ...DEFAULT_IMPORT_OPTIONS,
  dither,
  palette: { kind: 'preset', colors: [...BW] },
})

const ALL_IDS = Object.keys(DITHER_CATALOG) as ImportDither[]

describe('dither catalog closure', () => {
  it('every catalog id has an implementation for its family', () => {
    for (const id of ALL_IDS) expect(implOf(id), id).toBeTruthy()
  })

  it('every id belongs to exactly one family group', () => {
    const grouped = DITHER_FAMILIES.flatMap((f) => dithersOfFamily(f))
    expect(new Set(grouped).size).toBe(grouped.length)
    expect(new Set(grouped)).toEqual(new Set(ALL_IDS))
  })

  it('ordered family matches the derived threshold set', () => {
    expect([...ORDERED_DITHERS]).toEqual(dithersOfFamily('ordered'))
  })
})

describe('new ordered matrices and fields', () => {
  const permutationMatrices: [string, readonly (readonly number[])[]][] = [
    ['rosette', ROSETTE8],
    ['elliptical', ELLIPTICAL8],
    ['euclidean', EUCLIDEAN8],
    ['weave', WEAVE8],
    ['twill', TWILL8],
    ['houndstooth', HOUNDSTOOTH8],
    ['blue-noise-16', blueNoise16()],
  ]
  it.each(permutationMatrices)('%s ranks form a permutation', (_name, m) => {
    const values = m.flat()
    expect(new Set(values).size).toBe(values.length)
    expect(Math.max(...values)).toBe(values.length - 1)
    expect(Math.min(...values)).toBe(0)
  })

  it('bayer32 has 1024 distinct ranks', () => {
    expect(BAYER32.length).toBe(32)
    const flat = BAYER32.flat()
    expect(new Set(flat).size).toBe(1024)
  })

  it('procedural fields stay inside [0, 1)', () => {
    const fields = [
      linesHAt,
      linesVAt,
      linesDiagAt,
      ignAt,
      spiralAt,
      ringsAt,
      sunburstAt,
      phyllotaxisAt,
      zigzagAt,
      fractalNoiseAt,
    ]
    for (const f of fields) {
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          const v = f(x, y)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(1)
        }
      }
    }
  })
})

describe('scan orders', () => {
  const kinds = ['column', 'diagonal', 'spiral', 'hilbert', 'random'] as const
  it.each(kinds)('%s order is a permutation of the buffer', (kind) => {
    const order = scanOrder(kind, 13, 7)
    expect(order.length).toBe(13 * 7)
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 13 * 7 }, (_v, i) => i))
  })
})

describe('per-algorithm conformance', () => {
  const img = ramp(24, 24)
  const run = (dither: ImportDither, strength?: number) =>
    convertImage(img, { ...base(dither), ditherStrength: strength ?? 100 }, GRID, BW)

  it('every algorithm is deterministic', () => {
    for (const id of ALL_IDS) {
      expect(run(id).cells, id).toEqual(run(id).cells)
    }
  })

  it('every algorithm stays on the conversion palette and keeps transparency', () => {
    for (const id of ALL_IDS) {
      const { cells } = run(id)
      for (const v of cells) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(BW.length)
      }
      expect(cells[0]).toBe(0) // transparent corner
      expect(cells[5 * 24 + 5]).toBeGreaterThan(0) // opaque area
    }
  })

  it('strength 0 reduces diffusion, path, special and glyph families to nearest', () => {
    const plain = run('none').cells
    for (const id of ALL_IDS) {
      const family = DITHER_CATALOG[id].family
      if (family === 'ordered' || family === 'off') continue
      expect(run(id, 0).cells, id).toEqual(plain)
    }
  })

  it('ordered threshold bias is directional for every ordered algorithm', () => {
    const light = ramp(24, 24)
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const o = (y * 24 + x) * 4
        light.data[o] = 220
        light.data[o + 1] = 220
        light.data[o + 2] = 220
      }
    }
    const darkAt = (id: ImportDither, threshold: number): number => {
      const { cells } = convertImage(
        light,
        { ...base(id), threshold, ditherStrength: 100 },
        GRID,
        BW,
      )
      let dark = 0
      for (const v of cells) if (v === 1) dark++ // #000000 is palette index 0 → cell value 1
      return dark
    }
    for (const id of dithersOfFamily('ordered')) {
      expect(darkAt(id, 0), id).toBeGreaterThan(darkAt(id, 255))
    }
  })
})
