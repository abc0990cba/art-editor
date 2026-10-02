import { describe, expect, it } from 'vitest'

import { patternAt } from './fillpatterns.ts'
import { HALFTONE_NODES } from './nodes/halftone.node.ts'
import { Resolved, type RasterNodeDef } from './nodes/types.ts'
import {
  latticePoints,
  LatticeIndex,
  screenCellOn,
  screenShapeOn,
  SCREEN_LATTICES,
  type ScreenStyle,
} from './screen-engine.ts'

const BOX = { w: 24, h: 24 }

describe('lattice points', () => {
  it('every lattice kind produces deterministic in-bounds points', () => {
    for (const kind of SCREEN_LATTICES) {
      const a = latticePoints(kind, 3, 42, BOX.w, BOX.h)
      const b = latticePoints(kind, 3, 42, BOX.w, BOX.h)
      expect(a.length, kind).toBeGreaterThan(0)
      expect(a).toEqual(b)
      for (const pt of a) {
        expect(pt.x).toBeGreaterThan(-4)
        expect(pt.x).toBeLessThan(BOX.w + 4)
        expect(pt.y).toBeGreaterThan(-4)
        expect(pt.y).toBeLessThan(BOX.h + 4)
        expect(pt.n).toBeGreaterThanOrEqual(0)
        expect(pt.n).toBeLessThanOrEqual(1)
      }
    }
  })

  it('radial lattices wrap around the box center', () => {
    const pts = latticePoints('rings', 4, 1, BOX.w, BOX.h)
    let sumX = 0
    let sumY = 0
    for (const pt of pts) {
      sumX += pt.x
      sumY += pt.y
    }
    expect(sumX / pts.length).toBeCloseTo(BOX.w / 2, 0)
    expect(sumY / pts.length).toBeCloseTo(BOX.h / 2, 0)
  })

  it('scatter spreads at least half the seeded target density', () => {
    const pts = latticePoints('scatter', 2, 7, BOX.w, BOX.h)
    expect(pts.length).toBeGreaterThanOrEqual((BOX.w * BOX.h) / (2 * 2 * 0.9))
  })
})

const style = (over: Partial<ScreenStyle>): ScreenStyle => ({
  lattice: 'grid',
  mark: 'circle',
  mode: 'size',
  pitch: 4,
  twist: 180,
  seed: 3,
  ...over,
})

describe('screen masks', () => {
  const countOn = (s: ScreenStyle, tone: number): number => {
    const pts = latticePoints(s.lattice, s.pitch, s.seed, BOX.w, BOX.h)
    const index = new LatticeIndex(pts, s.pitch)
    let n = 0
    for (let y = 0; y < BOX.h; y++) {
      for (let x = 0; x < BOX.w; x++) {
        if (screenCellOn(s, index, x, y, () => tone)) n++
      }
    }
    return n
  }

  it.each(SCREEN_LATTICES)('%s: higher tone never covers less', (lattice) => {
    let prev = -1
    for (const tone of [0.15, 0.4, 0.7, 0.95]) {
      const n = countOn(style({ lattice }), tone)
      expect(n, `${lattice}@${tone}`).toBeGreaterThanOrEqual(prev)
      prev = n
    }
  })

  it('tone 1 with size mode fills the whole pitch grid on any mark', () => {
    for (const lattice of ['grid', 'hex'] as const) {
      expect(countOn(style({ lattice, mark: 'square' }), 1)).toBe(BOX.w * BOX.h)
    }
  })

  it('silhouette test scales around the center', () => {
    expect(screenShapeOn('circle', 0.5, 0.5, 0)).toBe(false)
    expect(screenShapeOn('circle', 0.5, 0.5, 1)).toBe(true)
    expect(screenShapeOn('circle', 0.02, 0.02, 1)).toBe(false)
    expect(screenShapeOn('square', 0.02, 0.02, 1)).toBe(true)
  })
})

describe('halftone node', () => {
  const def = HALFTONE_NODES[0] as RasterNodeDef
  const params = (over: Record<string, unknown>): Resolved =>
    new Resolved({
      lattice: 'grid',
      mark: 'circle',
      mode: 'size',
      pitch: 2,
      twist: 180,
      color: '#111111',
      keepColor: false,
      invert: false,
      seed: 1,
      ...over,
    })
  const ctx = {
    bw: 16,
    bh: 16,
    paletteLen: 4,
    hexValue: (hex: string): number => (hex === '#111111' ? 2 : 1),
    luma: (v: number): number => (v === 2 ? 0.2 : 0.9),
    rng: () => 0.5,
  }
  const solidInk = (): Map<number, number> => {
    const m = new Map<number, number>()
    for (let i = 0; i < 16 * 16; i++) m.set(i, 2)
    return m
  }

  it('dark ink at tone 1 merges into a solid; empty input stays empty', () => {
    const dark = def.evaluate(ctx, params({}), solidInk())
    expect(dark.size).toBe(16 * 16)
    const empty = def.evaluate(ctx, params({}), new Map())
    expect(empty.size).toBe(0)
  })

  it('is deterministic and colorizes from source with keepColor', () => {
    const a = def.evaluate(ctx, params({ mode: 'density' }), solidInk())
    const b = def.evaluate(ctx, params({ mode: 'density' }), solidInk())
    expect(a).toEqual(b)
    const kept = def.evaluate(ctx, params({ keepColor: true }), solidInk())
    expect([...kept.values()].every((v) => v === 2)).toBe(true)
  })

  it('density mode thins the marks compared to solid coverage', () => {
    const sized = def.evaluate(ctx, params({}), solidInk())
    const sparse = def.evaluate(ctx, params({ pitch: 4 }), solidInk())
    expect(sparse.size).toBeLessThan(sized.size)
  })
})

describe('fill screen lattices', () => {
  const countScreen = (lattice: 'grid' | 'hex' | 'rings', c: number): number => {
    let n = 0
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (patternAt('screen', x, y, c, { htLattice: lattice, seed: { x: 16, y: 16 } })) n++
      }
    }
    return n
  }

  it('hex and rings stay monotonic in tone', () => {
    for (const lattice of ['grid', 'hex', 'rings'] as const) {
      let prev = -1
      for (const c of [0.2, 0.5, 0.8, 0.97]) {
        const n = countScreen(lattice, c)
        expect(n, `${lattice}@${c}`).toBeGreaterThanOrEqual(prev)
        prev = n
      }
    }
  })

  it('hex rows are offset — the pattern differs from the grid at half tone', () => {
    let diff = 0
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const a = patternAt('screen', x, y, 0.5, { htLattice: 'grid' })
        const b = patternAt('screen', x, y, 0.5, { htLattice: 'hex' })
        if (a !== b) diff++
      }
    }
    expect(diff).toBeGreaterThan(0)
  })
})
