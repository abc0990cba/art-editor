import { describe, expect, it } from 'vitest'
import {
  applyFillStyle,
  DEFAULT_FILL_STYLE,
  fillSelectionCells,
  gradientAt,
  patternAt,
  patternCoord,
  type FillPatternId,
  type FillStyle,
} from './fillpatterns'
import { defaultDoc, resolveColor, type Doc } from './doc'

const style = (patch: Partial<FillStyle>): FillStyle => ({
  ...DEFAULT_FILL_STYLE,
  mode: 'pattern',
  ...patch,
})

const count = (id: FillPatternId, t: number, n = 8): number => {
  let c = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (patternAt(id, x, y, t)) c++
  return c
}

describe('ordered dithering', () => {
  it('bayer2 at 50% is a checkerboard', () => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) expect(patternAt('bayer2', x, y, 0.5)).toBe((x + y) % 2 === 0)
  })

  it('bayer thresholds cover the extremes and never revert to color A', () => {
    for (const id of ['bayer2', 'bayer4', 'bayer8', 'bayer16'] as const) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          expect(patternAt(id, x, y, 0)).toBe(false)
          expect(patternAt(id, x, y, 1)).toBe(true)
          let wasB = false
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const b = patternAt(id, x, y, t)
            expect(b).toBe(wasB || b)
            wasB = b
          }
        }
    }
  })

  it('finer bayers approximate the mix ratio more closely', () => {
    // sample whole 16×16 tiles so bayer16 is judged on its full period
    const err = (id: FillPatternId, t: number) => Math.abs(count(id, t, 16) / 256 - t)
    expect(err('bayer2', 0.15)).toBeGreaterThan(err('bayer4', 0.15))
    expect(err('bayer4', 0.15)).toBeGreaterThan(err('bayer8', 0.15))
    expect(err('bayer8', 0.15)).toBeGreaterThan(err('bayer16', 0.15))
  })
})

describe('matrix patterns', () => {
  it('cluster, halftone, blue-noise and void-cluster cover the extremes monotonically', () => {
    for (const id of ['cluster', 'halftone', 'blue-noise', 'void-cluster'] as const) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          expect(patternAt(id, x, y, 0)).toBe(false)
          expect(patternAt(id, x, y, 1)).toBe(true)
          let wasB = false
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const b = patternAt(id, x, y, t)
            expect(b).toBe(wasB || b)
            wasB = b
          }
        }
    }
  })

  it('cluster and halftone tile every 4 cells; noise masks tile every 8', () => {
    const tiles = (id: FillPatternId, period: number, t: number) => {
      for (let y = 0; y < period * 2; y++)
        for (let x = 0; x < period * 2; x++) {
          expect(patternAt(id, x, y, t)).toBe(patternAt(id, x % period, y % period, t))
        }
    }
    tiles('cluster', 4, 0.4)
    tiles('halftone', 4, 0.6)
    tiles('blue-noise', 8, 0.3)
    tiles('void-cluster', 8, 0.7)
  })
})

describe('noise dithering', () => {
  it('is deterministic per position', () => {
    expect(patternAt('noise', 13, 7, 0.4)).toBe(patternAt('noise', 13, 7, 0.4))
  })

  it('respects the mix ratio and its extremes', () => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        expect(patternAt('noise', x, y, 0)).toBe(false)
        expect(patternAt('noise', x, y, 1)).toBe(true)
      }
    const ratio = count('noise', 0.5, 64) / (64 * 64)
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.6)
  })
})

describe('stripes and dots', () => {
  const ids = ['stripes-h', 'stripes-v', 'stripes-diag', 'dots'] as const

  it('grow from empty to full with the mix ratio', () => {
    for (const id of ids)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          expect(patternAt(id, x, y, 0)).toBe(false)
          expect(patternAt(id, x, y, 1)).toBe(true)
        }
  })

  it('stripes take exactly half the cells at 50%', () => {
    for (const id of ['stripes-h', 'stripes-v', 'stripes-diag'] as const) {
      expect(count(id, 0.5, 16)).toBe(128)
    }
  })

  it('stripe bands follow the mix ratio', () => {
    // 25%: one row of every four takes color B
    for (let x = 0; x < 8; x++) {
      expect(patternAt('stripes-h', x, 0, 0.25)).toBe(true)
      expect(patternAt('stripes-h', x, 1, 0.25)).toBe(false)
      expect(patternAt('stripes-h', x, 4, 0.25)).toBe(true)
    }
  })
})

describe('scaled and shaped patterns', () => {
  const ORIGIN = { x: 0, y: 0 }

  it('all scaled patterns hit the extremes at every scale', () => {
    const ids = [
      'checker',
      'grid',
      'hatch',
      'stripes-h',
      'stripes-v',
      'stripes-diag',
      'zigzag',
      'dots',
      'bricks',
      'rings',
    ] as const
    for (const id of ids)
      for (const scale of [1, 2, 4])
        for (let y = 0; y < 24; y += 3)
          for (let x = 0; x < 24; x += 3) {
            expect(patternAt(id, x, y, 0, { scale, seed: ORIGIN })).toBe(false)
            expect(patternAt(id, x, y, 1, { scale, seed: ORIGIN })).toBe(true)
          }
  })

  it('stripes scale their period', () => {
    expect(patternAt('stripes-h', 0, 0, 0.5, { scale: 2 })).toBe(true)
    expect(patternAt('stripes-h', 0, 4, 0.5, { scale: 2 })).toBe(false)
    expect(patternAt('stripes-h', 0, 6, 0.5, { scale: 2 })).toBe(false)
    expect(patternAt('stripes-h', 0, 8, 0.5, { scale: 2 })).toBe(true)
  })

  it('checker makes s×s blocks', () => {
    for (let dx = 0; dx < 2; dx++)
      for (let dy = 0; dy < 2; dy++) {
        expect(patternAt('checker', dx, dy, 0.5, { scale: 2 })).toBe(true)
        expect(patternAt('checker', dx + 2, dy, 0.5, { scale: 2 })).toBe(false)
        expect(patternAt('checker', dx + 2, dy + 2, 0.5, { scale: 2 })).toBe(true)
      }
  })

  it('grid draws thin lines at low density and fills at full', () => {
    expect(patternAt('grid', 0, 0, 0.25)).toBe(true)
    expect(patternAt('grid', 0, 2, 0.25)).toBe(true)
    expect(patternAt('grid', 1, 1, 0.25)).toBe(false)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) expect(patternAt('grid', x, y, 1)).toBe(true)
  })

  it('hatch combines both diagonal directions', () => {
    expect(patternAt('hatch', 0, 0, 0.25)).toBe(true)
    expect(patternAt('hatch', 1, 1, 0.25)).toBe(true)
    expect(patternAt('hatch', 2, 0, 0.25)).toBe(false)
  })

  it('bricks leave mortar joints that close at full density', () => {
    // s=1 rows are 2px: below 50% the whole field is mortar
    expect(patternAt('bricks', 0, 0, 0.5)).toBe(false)
    expect(patternAt('bricks', 0, 0, 0.75)).toBe(false)
    expect(patternAt('bricks', 1, 1, 0.75)).toBe(true)
  })

  it('rings center on the seed anchor', () => {
    const seed = { x: 10, y: 10 }
    expect(patternAt('rings', 10, 10, 0.5, { seed })).toBe(true)
    expect(patternAt('rings', 14, 10, 0.5, { seed })).toBe(true)
    expect(patternAt('rings', 12, 10, 0.5, { seed })).toBe(false)
  })

  it('noise grain merges cells into blocks', () => {
    const o = { grain: 2 }
    expect(patternAt('noise', 4, 6, 0.5, o)).toBe(patternAt('noise', 5, 7, 0.5, o))
  })
})

describe('gradient noise (ign)', () => {
  it('is deterministic per position', () => {
    expect(patternAt('ign', 13, 7, 0.4)).toBe(patternAt('ign', 13, 7, 0.4))
  })

  it('covers the extremes and stays near the mix ratio at 50%', () => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        expect(patternAt('ign', x, y, 0)).toBe(false)
        expect(patternAt('ign', x, y, 1)).toBe(true)
      }
    const ratio = count('ign', 0.5, 64) / (64 * 64)
    expect(ratio).toBeGreaterThan(0.35)
    expect(ratio).toBeLessThan(0.65)
  })
})

describe('gradient profiles', () => {
  const box = { x0: 0, y0: 0, x1: 9, y1: 9 }
  const origin = { x: 0, y: 0 }

  it('flat is constant zero — density applies instead', () => {
    expect(gradientAt('none', 5, 5, origin, box)).toBe(0)
  })

  it('vertical and horizontal interpolate along one axis only', () => {
    expect(gradientAt('vertical', 3, 0, origin, box)).toBe(0)
    expect(gradientAt('vertical', 3, 9, origin, box)).toBe(1)
    expect(gradientAt('vertical', 7, 4, origin, box)).toBeCloseTo(
      gradientAt('vertical', 0, 4, origin, box),
    )
    expect(gradientAt('horizontal', 0, 5, origin, box)).toBe(0)
    expect(gradientAt('horizontal', 9, 5, origin, box)).toBe(1)
  })

  it('diagonals interpolate corner to corner', () => {
    expect(gradientAt('diag', 0, 0, origin, box)).toBe(0)
    expect(gradientAt('diag', 9, 9, origin, box)).toBe(1)
    expect(gradientAt('diag', 0, 9, origin, box)).toBeCloseTo(0.5)
    expect(gradientAt('diag-inv', 0, 9, origin, box)).toBe(0)
    expect(gradientAt('diag-inv', 9, 0, origin, box)).toBe(1)
  })

  it('radial starts at the seed and peaks at the farthest corner', () => {
    const seed = { x: 4, y: 4 }
    expect(gradientAt('radial', 4, 4, seed, box)).toBe(0)
    expect(gradientAt('radial', 9, 9, seed, box)).toBe(1)
    expect(gradientAt('radial', 2, 4, seed, box)).toBeLessThan(
      gradientAt('radial', 6, 6, seed, box),
    )
  })

  it('degenerate single-cell regions stay inside [0,1]', () => {
    const one = { x0: 3, y0: 3, x1: 3, y1: 3 }
    for (const g of ['vertical', 'horizontal', 'diag', 'diag-inv', 'radial'] as const) {
      expect(gradientAt(g, 3, 3, { x: 3, y: 3 }, one)).toBe(0)
    }
  })
})

describe('applyFillStyle', () => {
  const coord = patternCoord({ ...defaultDoc(), cols: 8, rows: 8, sub: 1 })

  it('assigns only region cells and respects flat density endpoints', () => {
    const region = [9, 10, 11, 17, 25]
    const full = applyFillStyle(style({ gradient: 'none', density: 1 }), region, 9, coord)
    expect(full.size).toBe(region.length)
    for (const i of region) expect(full.get(i)).toBe(1)
    const empty = applyFillStyle(style({ gradient: 'none', density: 0 }), region, 9, coord)
    for (const i of region) expect(empty.get(i)).toBe(0)
  })

  it('renders a checkerboard at 50% with bayer2', () => {
    const region = Array.from({ length: 64 }, (_, i) => i)
    const m = applyFillStyle(
      style({ pattern: 'bayer2', gradient: 'none', density: 0.5 }),
      region,
      0,
      coord,
    )
    for (const [i, pick] of m) {
      const { x, y } = coord(i)
      expect(pick === 1).toBe((x + y) % 2 === 0)
    }
  })

  it('a vertical gradient sweeps color B across the region', () => {
    const region = Array.from({ length: 64 }, (_, i) => i)
    const m = applyFillStyle(
      style({ pattern: 'stripes-v', gradient: 'vertical' }),
      region,
      0,
      coord,
    )
    for (let x = 0; x < 8; x++) {
      expect(m.get(x)).toBe(0)
      expect(m.get(56 + x)).toBe(1)
    }
  })

  it('empty regions produce no assignment', () => {
    expect(applyFillStyle(style({}), [], 0, coord).size).toBe(0)
  })
})

describe('fillSelectionCells', () => {
  const COLOR_A = '#0f0f0f'

  /** A doc with two painted blocks attributed to distinct elements (ids 1 and 2). */
  const docWithTwoElements = (): Doc => {
    const doc = defaultDoc()
    const bw = doc.cols * doc.sub
    const cells = doc.cells.slice()
    const cellObj = new Uint32Array(cells.length)
    const block = (x0: number, y0: number, x1: number, y1: number, v: number, obj: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * bw + x
          cells[i] = v
          cellObj[i] = obj
        }
    }
    block(0, 0, 3, 3, 1, 1)
    block(10, 10, 13, 13, 2, 2)
    return { ...doc, cells, cellObj }
  }

  it('solid mode recolors only the selected element and extends the palette', () => {
    const doc = docWithTwoElements()
    const res = fillSelectionCells(doc, [1], { ...DEFAULT_FILL_STYLE, mode: 'solid' }, COLOR_A)
    expect(res).not.toBeNull()
    const v = resolveColor(doc, COLOR_A).v
    expect(res!.palette.length).toBe(doc.palette.length + 1)
    for (let i = 0; i < doc.cells.length; i++) {
      const expected = doc.cellObj![i] === 1 && doc.cells[i] > 0 ? v : doc.cells[i]
      expect(res!.cells[i]).toBe(expected)
    }
  })

  it('keeps an in-palette color without touching the palette', () => {
    const doc = docWithTwoElements()
    const res = fillSelectionCells(
      doc,
      [1],
      { ...DEFAULT_FILL_STYLE, mode: 'solid' },
      doc.palette[3],
    )
    expect(res).not.toBeNull()
    expect(res!.palette).toEqual(doc.palette)
    expect(res!.cells[0]).toBe(4)
  })

  it('pattern mode mixes the two colors by density', () => {
    const doc = docWithTwoElements()
    const a = resolveColor(doc, COLOR_A).v
    const b = resolveColor(resolveColor(doc, COLOR_A).doc, '#ffffff').v
    const none = fillSelectionCells(doc, [1], style({ pattern: 'stripes-h', density: 0 }), COLOR_A)
    const full = fillSelectionCells(doc, [1], style({ pattern: 'stripes-h', density: 1 }), COLOR_A)
    for (let i = 0; i < doc.cells.length; i++) {
      if (doc.cellObj![i] !== 1) continue
      expect(none!.cells[i]).toBe(a)
      expect(full!.cells[i]).toBe(b)
    }
    // 50% bayer2 over a 4×4 block contains both colors
    const half = fillSelectionCells(doc, [1], style({ pattern: 'bayer2', density: 0.5 }), COLOR_A)
    const picks = new Set<number>()
    for (let i = 0; i < doc.cells.length; i++) {
      if (doc.cellObj![i] === 1) picks.add(half!.cells[i])
    }
    expect([...picks].sort()).toEqual([a, b].sort())
  })

  it('pattern mode never leaves a selected cell empty', () => {
    const doc = docWithTwoElements()
    const res = fillSelectionCells(doc, [1], style({ pattern: 'dots', density: 0.3 }), COLOR_A)
    for (let i = 0; i < doc.cells.length; i++) {
      if (doc.cellObj![i] === 1) expect(res!.cells[i]).toBeGreaterThan(0)
    }
  })

  it('refills only the selected shapes and keeps the rest intact', () => {
    const doc = docWithTwoElements()
    const res = fillSelectionCells(doc, [2], { ...DEFAULT_FILL_STYLE, mode: 'solid' }, COLOR_A)
    expect(res!.cells[0]).toBe(1) // element 1 keeps its old color
    expect(res!.cells[11 * doc.cols + 11]).toBe(resolveColor(doc, COLOR_A).v)
    const both = fillSelectionCells(doc, [1, 2], { ...DEFAULT_FILL_STYLE, mode: 'solid' }, COLOR_A)
    expect(both!.cells[0]).toBe(resolveColor(doc, COLOR_A).v)
    expect(both!.cells[11 * doc.cols + 11]).toBe(resolveColor(doc, COLOR_A).v)
  })

  it('does not mutate the input document', () => {
    const doc = docWithTwoElements()
    const snapshot = doc.cells.slice()
    fillSelectionCells(doc, [1], style({ pattern: 'bayer4', density: 0.5 }), COLOR_A)
    expect(doc.cells).toEqual(snapshot)
  })

  it('is a no-op without a selection, an empty element, or attribution', () => {
    const doc = docWithTwoElements()
    expect(fillSelectionCells(doc, [], style({}), COLOR_A)).toBeNull()
    expect(fillSelectionCells(doc, [7], style({}), COLOR_A)).toBeNull()
    expect(fillSelectionCells(defaultDoc(), [1], style({}), COLOR_A)).toBeNull()
  })
})

describe('halftone screen', () => {
  const shapes = ['dot', 'square', 'diamond', 'line', 'ellipse'] as const

  const count = (o: Parameters<typeof patternAt>[4] = {}, t = 0.5, n = 36): number => {
    let c = 0
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (patternAt('screen', x, y, t, o)) c++
    return c
  }

  it('covers the extremes for every shape', () => {
    for (const htShape of shapes) {
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++) {
          expect(patternAt('screen', x, y, 0, { htShape })).toBe(false)
          expect(patternAt('screen', x, y, 1, { htShape })).toBe(true)
        }
    }
  })

  it('is monotonic per cell and stays near the mix ratio at 50%', () => {
    for (const htShape of shapes) {
      for (let y = 0; y < 18; y++)
        for (let x = 0; x < 18; x++) {
          let wasB = false
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const b = patternAt('screen', x, y, t, { htShape })
            expect(b).toBe(wasB || b)
            wasB = b
          }
        }
    }
    const ratio = count({ htAngle: 45 }, 0.5) / (36 * 36)
    expect(Math.abs(ratio - 0.5)).toBeLessThan(0.06)
  })

  it('rotates with the angle and grows with scale', () => {
    expect(count({ htAngle: 0 })).not.toBe(count({ htAngle: 45 }))
    expect(count({ htAngle: 45 }, 0.5, 36)).toBe(count({ htAngle: 45 }, 0.5, 36))
    // scale enlarges the dots (same coverage, different placement)
    let differs = false
    for (let y = 0; y < 48 && !differs; y++)
      for (let x = 0; x < 48 && !differs; x++)
        if (
          patternAt('screen', x, y, 0.5, { scale: 1 }) !==
          patternAt('screen', x, y, 0.5, { scale: 2 })
        )
          differs = true
    expect(differs).toBe(true)
  })

  it('jitter scatters dots and dropout wears them away', () => {
    const clean = count({ htJitter: 0, htDropout: 0 })
    expect(count({ htJitter: 80 })).not.toBe(clean)
    expect(count({ htDropout: 100 })).toBeLessThan(clean * 0.2)
    // dirty screens are deterministic for the same options
    expect(count({ htJitter: 60, htDropout: 30 })).toBe(count({ htJitter: 60, htDropout: 30 }))
  })

  it('flows through applyFillStyle', () => {
    const doc = defaultDoc()
    const region = Array.from({ length: doc.cols * doc.sub * 4 }, (_, i) => i)
    const out = applyFillStyle(
      style({ pattern: 'screen', htShape: 'ellipse', htAngle: 30, htJitter: 40, htDropout: 20 }),
      region,
      0,
      patternCoord(doc),
    )
    expect(out.size).toBe(region.length)
    const picks = [...out.values()]
    expect(picks.some((v) => v === 1)).toBe(true)
    expect(picks.some((v) => v === 0)).toBe(true)
  })
})
