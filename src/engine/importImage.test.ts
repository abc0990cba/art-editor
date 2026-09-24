import { describe, expect, it } from 'vitest'

import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  expandPaletteWithBlend,
  medianCut,
  resizeTargetSize,
  type ImportBitmap,
  type ImportDither,
  type ImportOptions,
} from './importImage'

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

const solid = (w: number, h: number, r: number, g: number, b: number, a = 255): ImportBitmap =>
  bmp(w, h, () => [r, g, b, a])

const opts = (patch: Partial<ImportOptions>): ImportOptions => ({
  ...DEFAULT_IMPORT_OPTIONS,
  dither: 'none',
  ...patch,
})

const grid = (cols: number, rows: number, sub: 1 | 2 | 3 = 1) => ({ cols, rows, sub })

const at = (r: { cells: Uint16Array }, bw: number, x: number, y: number): number =>
  r.cells[y * bw + x]

describe('resizeTargetSize', () => {
  it('keeps the longer side and derives the other from the photo aspect', () => {
    expect(resizeTargetSize(200, 100, 32, 32)).toEqual({ cols: 32, rows: 16 })
    expect(resizeTargetSize(100, 200, 32, 32)).toEqual({ cols: 16, rows: 32 })
    expect(resizeTargetSize(100, 200, 8, 48)).toEqual({ cols: 24, rows: 48 })
  })

  it('clamps to the canvas size limits', () => {
    expect(resizeTargetSize(1000, 10, 512, 512)).toEqual({ cols: 512, rows: 5 })
    expect(resizeTargetSize(10, 1000, 512, 512)).toEqual({ cols: 5, rows: 512 })
  })
})

describe('fit modes', () => {
  it('stretch fills the whole grid with the photo', () => {
    const r = convertImage(solid(4, 4, 255, 0, 0), opts({ fit: 'stretch' }), grid(2, 3), [])
    expect(r.cells.every((v) => v === 1)).toBe(true)
    expect(r.palette).toContain('#ff0000')
  })

  it('contain letterboxes with transparent margins', () => {
    // 1×2 photo into 4×4: scaled copy is 2 wide, one empty column on each side
    const r = convertImage(solid(1, 2, 255, 0, 0), opts({ fit: 'contain' }), grid(4, 4), [])
    for (let y = 0; y < 4; y++) {
      expect(at(r, 4, 0, y)).toBe(0)
      expect(at(r, 4, 3, y)).toBe(0)
      expect(at(r, 4, 1, y)).toBe(1)
      expect(at(r, 4, 2, y)).toBe(1)
    }
  })

  it('semi-transparent samples under the alpha threshold become empty cells', () => {
    const r = convertImage(solid(2, 2, 255, 0, 0, 100), opts({ fit: 'stretch' }), grid(2, 2), [])
    expect(r.cells.every((v) => v === 0)).toBe(true)
  })
})

describe('pixel scale', () => {
  it('replicates each sample into scale² cell blocks', () => {
    const src = bmp(2, 2, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const r = convertImage(
      src,
      opts({
        fit: 'stretch',
        pixelScale: 2,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(4, 4),
      [],
    )
    expect(at(r, 4, 0, 0)).toBe(at(r, 4, 1, 0))
    expect(at(r, 4, 0, 0)).toBe(at(r, 4, 0, 1))
    expect(at(r, 4, 0, 0)).not.toBe(at(r, 4, 2, 0))
    expect(at(r, 4, 2, 2)).toBe(at(r, 4, 3, 3))
  })
})

describe('palette choices', () => {
  it('maps onto the current document palette', () => {
    const r = convertImage(
      solid(2, 2, 255, 0, 0),
      opts({ palette: { kind: 'current' } }),
      grid(2, 2),
      ['#123456'],
    )
    expect(r.palette).toEqual(['#123456'])
    expect(r.cells.every((v) => v === 1)).toBe(true)
  })

  it("'resize' resizes the canvas to the photo proportions", () => {
    const r = convertImage(solid(8, 4, 255, 0, 0), opts({ fit: 'resize' }), grid(4, 4), [])
    expect(r.cols).toBe(4)
    expect(r.rows).toBe(2)
    expect(r.cells.length).toBe(8)
    expect(r.cells.every((v) => v === 1)).toBe(true)
  })

  it('median cut finds the two color clusters and sorts by luminance', () => {
    const sample = new Float64Array(128 * 4)
    for (let i = 0; i < 64; i++) {
      sample[i * 4] = 250
      sample[i * 4 + 3] = 255
      sample[(64 + i) * 4 + 2] = 250
      sample[(64 + i) * 4 + 3] = 255
    }
    const colors = medianCut(sample, 2)
    expect(colors).toEqual(['#0000fa', '#fa0000'])
  })
})

describe('dithering', () => {
  it('is deterministic across runs', () => {
    const src = bmp(16, 16, (x) => [x * 16, x * 16, x * 16, 255])
    const o = opts({
      dither: 'floyd',
      palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
    })
    const a = convertImage(src, o, grid(16, 16), [])
    const b = convertImage(src, o, grid(16, 16), [])
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells))
  })

  it('bayer keeps flat palette colors stable', () => {
    const r = convertImage(
      solid(8, 8, 255, 0, 0),
      opts({ dither: 'bayer4', palette: { kind: 'preset', colors: ['#ff0000', '#00ff00'] } }),
      grid(8, 8),
      [],
    )
    expect(r.cells.every((v) => v === 1)).toBe(true)
  })

  it('floyd–steinberg renders a gray ramp with both extremes', () => {
    const src = bmp(16, 16, (x) => [x * 17, x * 17, x * 17, 255])
    const r = convertImage(
      src,
      opts({
        dither: 'floyd',
        fit: 'stretch',
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(16, 16),
      [],
    )
    const used = new Set(r.cells)
    expect(used.has(1)).toBe(true)
    expect(used.has(2)).toBe(true)
  })

  it('strength 0 makes every diffusion kernel behave like plain nearest', () => {
    const src = bmp(16, 16, (x, y) => [x * 16, y * 16, 128, 255])
    const kernels: ImportDither[] = [
      'floyd',
      'atkinson',
      'sierra',
      'sierra-lite',
      'stucki',
      'burkes',
      'jjn',
      'stevenson-arce',
      'nakano',
      'ostromoukhov',
      'variable-error',
      'dot-diffusion',
      'riemersma',
    ]
    const base = convertImage(
      src,
      opts({
        dither: 'none',
        fit: 'stretch',
        palette: { kind: 'preset', colors: ['#345', '#678'] },
      }),
      grid(16, 16),
      [],
    )
    for (const dither of kernels) {
      const r = convertImage(
        src,
        opts({
          dither,
          fit: 'stretch',
          ditherStrength: 0,
          palette: { kind: 'preset', colors: ['#345', '#678'] },
        }),
        grid(16, 16),
        [],
      )
      expect(Array.from(r.cells), dither).toEqual(Array.from(base.cells))
    }
  })

  it('every new algorithm stays deterministic and inside the palette', () => {
    const src = bmp(24, 24, (x, y) => [x * 10, y * 10, (x + y) * 5, 255])
    const all: ImportDither[] = [
      'bayer2',
      'bayer4',
      'bayer8',
      'bayer16',
      'cluster-dot',
      'halftone',
      'blue-noise',
      'void-cluster',
      'pattern',
      'crosshatch',
      'floyd',
      'atkinson',
      'sierra',
      'sierra-lite',
      'stucki',
      'burkes',
      'jjn',
      'stevenson-arce',
      'nakano',
      'ostromoukhov',
      'variable-error',
      'dot-diffusion',
      'riemersma',
    ]
    const palette = ['#000000', '#555555', '#aaaaaa', '#ffffff']
    for (const dither of all) {
      const o = opts({ dither, fit: 'stretch', palette: { kind: 'preset', colors: palette } })
      const a = convertImage(src, o, grid(24, 24), [])
      const b = convertImage(src, o, grid(24, 24), [])
      expect(Array.from(a.cells), dither).toEqual(Array.from(b.cells))
      expect(a.palette.length, dither).toBe(4)
      expect(
        Array.from(a.cells).every((v) => v >= 0 && v <= 4),
        dither,
      ).toBe(true)
    }
  })

  it('ordered threshold bias pulls midtones towards dark or light', () => {
    const src = solid(16, 16, 100, 100, 100)
    const o = (threshold: number) =>
      opts({
        dither: 'bayer8',
        fit: 'stretch',
        threshold,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      })
    const dark = convertImage(src, o(255), grid(16, 16), [])
    expect(dark.cells.every((v) => v === 1)).toBe(true)
    const light = convertImage(src, o(0), grid(16, 16), [])
    const white = Array.from(light.cells).filter((v) => v === 2).length
    expect(white).toBeGreaterThan(0)
  })

  it('ordered strength 0 collapses to a clean threshold split', () => {
    const src = bmp(16, 16, (x) => [x * 17, x * 17, x * 17, 255])
    const r = convertImage(
      src,
      opts({
        dither: 'bayer8',
        fit: 'stretch',
        ditherStrength: 0,
        palette: { kind: 'preset', colors: ['#000000', '#ffffff'] },
      }),
      grid(16, 16),
      [],
    )
    // no matrix pattern left: every column boundary is a pure tone split
    expect(Array.from(r.cells).every((v) => v === 1 || v === 2)).toBe(true)
  })
})

describe('palette blend', () => {
  it('inserts midpoints between luminance-sorted neighbors', () => {
    expect(expandPaletteWithBlend(['#000000', '#ffffff'], 33)).toEqual([
      '#000000',
      '#808080',
      '#ffffff',
    ])
    expect(expandPaletteWithBlend(['#000000', '#ffffff'], 50)).toEqual([
      '#000000',
      '#555555',
      '#aaaaaa',
      '#ffffff',
    ])
  })

  it('leaves the palette untouched at 0 and caps the result at 64 entries', () => {
    const p = ['#ff0000', '#00ff00']
    expect(expandPaletteWithBlend(p, 0)).toEqual(p)
    const many = Array.from(
      { length: 50 },
      (_, i) => `#${(10 + i * 4).toString(16).padStart(2, '0')}0000`,
    )
    const out = expandPaletteWithBlend(many, 100)
    expect(out.length).toBeLessThanOrEqual(64)
    expect(out.length).toBeGreaterThanOrEqual(many.length)
  })
})

describe('pre/post pipeline', () => {
  it('glow spreads the bright area into dark neighbors', () => {
    const src = bmp(16, 8, (x) => (x < 8 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    const o = (extra: Partial<ImportOptions>) =>
      opts({
        dither: 'none',
        fit: 'stretch',
        palette: { kind: 'preset', colors: ['#000000', '#888888', '#ffffff'] },
        ...extra,
      })
    const plain = convertImage(src, o({}), grid(16, 8), [])
    const glow = convertImage(src, o({ glowRadius: 4, glowIntensity: 100 }), grid(16, 8), [])
    // screen-blending pushes boundary blacks up into the middle gray of the palette
    expect(Array.from(plain.cells).includes(2)).toBe(false)
    expect(Array.from(glow.cells).includes(2)).toBe(true)
  })

  it('post effects keep every cell on the palette and deterministic', () => {
    const src = bmp(16, 16, (x, y) => [x * 16, y * 16, 200, 255])
    const o = opts({
      dither: 'floyd',
      fit: 'stretch',
      palette: { kind: 'preset', colors: ['#000000', '#883333', '#ffffff'] },
      glowRadius: 3,
      glowIntensity: 60,
      postDenoise: 1,
      postSmooth: 1,
    })
    const a = convertImage(src, o, grid(16, 16), [])
    const b = convertImage(src, o, grid(16, 16), [])
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells))
    expect(Array.from(a.cells).every((v) => v >= 0 && v <= 3)).toBe(true)
  })
})
