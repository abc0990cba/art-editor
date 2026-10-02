import { describe, expect, it } from 'vitest'

import type { TextureSettings } from './doc.ts'
import { HATCH_NODES } from './nodes/hatch.node.ts'
import { Resolved, type RasterNodeDef } from './nodes/types.ts'
import { regionTextureFragments } from './texture-region.ts'
import type { TextureCell } from './texture-region.ts'

describe('hatch texture', () => {
  const N = 16
  const settings = (over: Partial<TextureSettings>): TextureSettings => ({
    effect: 'hatch',
    amount: 40,
    scale: 2,
    sizeMin: 0.12,
    sizeMax: 0.35,
    shape: 'square',
    edge: 100,
    dist: 'scatter',
    gap: 0,
    gapMode: 'cell',
    even: false,
    angle: 45,
    seed: 1,
    jitter: 0,
    variation: 0,
    wobble: 0,
    merge: 0,
    dropout: 0,
    spray: 0,
    ramp: 0,
    ...over,
  })
  const cells = (): TextureCell[] => {
    const out: TextureCell[] = []
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const same = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < N && yy < N
        out.push({
          x: gx + 0.05,
          y: gy + 0.05,
          w: 0.9,
          h: 0.9,
          radii: [0, 0, 0, 0],
          chamfer: false,
          cx0: gx,
          cy0: gy,
          cx1: gx + 1,
          cy1: gy + 1,
          connectedL: same(gx - 1, gy),
          connectedT: same(gx, gy - 1),
          connectedR: same(gx + 1, gy),
          connectedB: same(gx, gy + 1),
        })
      }
    }
    return out
  }
  const coords = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

  it('produces deterministic, non-empty fragments on a full region', () => {
    const a = regionTextureFragments(cells(), settings({}), 1)
    expect(a).not.toBe('')
    expect(a).toBe(regionTextureFragments(cells(), settings({}), 1))
  })

  it('clips every emitted coordinate to the region box (plus one line width)', () => {
    const d = regionTextureFragments(cells(), settings({ hatchStyle: 'cross' }), 1)
    const nums = coords(d)
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(-1)
      expect(nums[i]).toBeLessThanOrEqual(N + 1)
      expect(nums[i + 1]).toBeGreaterThanOrEqual(-1)
      expect(nums[i + 1]).toBeLessThanOrEqual(N + 1)
    }
  })

  it('cross covers more directions than straight lines', () => {
    const straight = regionTextureFragments(cells(), settings({}), 1)
    const cross = regionTextureFragments(cells(), settings({ hatchStyle: 'cross' }), 1)
    expect(cross.length).toBeGreaterThan(straight.length)
  })

  it('gaps and single cells stay inside their paint rect', () => {
    const one: TextureCell[] = [
      {
        x: 2.05,
        y: 3.05,
        w: 0.9,
        h: 0.9,
        radii: [0, 0, 0, 0],
        chamfer: false,
        cx0: 2,
        cy0: 3,
        cx1: 3,
        cy1: 4,
        connectedL: false,
        connectedT: false,
        connectedR: false,
        connectedB: false,
      },
    ]
    const d = regionTextureFragments(one, settings({ hatchStyle: 'cross' }), 1)
    const nums = coords(d)
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(1.9)
      expect(nums[i]).toBeLessThanOrEqual(3.1)
      expect(nums[i + 1]).toBeGreaterThanOrEqual(2.9)
      expect(nums[i + 1]).toBeLessThanOrEqual(4.1)
    }
  })
})

describe('hatch node', () => {
  const def = HATCH_NODES[0] as RasterNodeDef
  const params = (over: Record<string, unknown>): Resolved =>
    new Resolved({
      angle: 45,
      pitch: 3,
      width: 50,
      cross: false,
      wave: 0,
      waveLen: 24,
      color: '#111111',
      keepColor: false,
      invert: false,
      ...over,
    })
  const ctx = {
    bw: 16,
    bh: 16,
    paletteLen: 4,
    hexValue: (hex: string): number => (hex === '#111111' ? 2 : 1),
    luma: (v: number): number => (v === 2 ? 0.2 : 0.9),
    rng: (): number => 0.5,
  }
  const solidInk = (): Map<number, number> => {
    const m = new Map<number, number>()
    for (let i = 0; i < 16 * 16; i++) m.set(i, 2)
    return m
  }
  const off = (m: Map<number, number>): number => 16 * 16 - m.size

  it('carves lines out of solid ink; empty input stays empty', () => {
    const carved = def.evaluate(ctx, params({}), solidInk())
    expect(carved.size).toBeGreaterThan(0)
    expect(off(carved)).toBeGreaterThan(0)
    expect(def.evaluate(ctx, params({}), new Map()).size).toBe(0)
  })

  it('is deterministic and keeps source colors with keepColor', () => {
    const a = def.evaluate(ctx, params({}), solidInk())
    expect(a).toEqual(def.evaluate(ctx, params({}), solidInk()))
    const kept = def.evaluate(ctx, params({ keepColor: true }), solidInk())
    expect([...kept.values()].every((v) => v === 2)).toBe(true)
  })

  it('narrower lines cover fewer cells; cross covers more', () => {
    const base = def.evaluate(ctx, params({}), solidInk())
    const thin = def.evaluate(ctx, params({ width: 20 }), solidInk())
    const cross = def.evaluate(ctx, params({ cross: true }), solidInk())
    expect(thin.size).toBeLessThan(base.size)
    expect(cross.size).toBeGreaterThan(base.size)
  })

  it('lighter tone never widens the lines', () => {
    const input = new Map<number, number>()
    for (let i = 0; i < 16 * 16; i++) input.set(i, 2) // luma 0.2 → tone 0.8
    const dark = def.evaluate(ctx, params({}), input)
    const light = new Map<number, number>()
    for (let i = 0; i < 16 * 16; i++) light.set(i, 1) // luma 0.9 → tone 0.1
    const lightOut = def.evaluate(ctx, params({}), light)
    expect(lightOut.size).toBeLessThan(dark.size)
  })

  it('waved systems stay within the box', () => {
    const waved = def.evaluate(ctx, params({ wave: 60, waveLen: 12 }), solidInk())
    expect(waved.size).toBeGreaterThan(0)
    for (const key of waved.keys()) {
      expect(key).toBeGreaterThanOrEqual(0)
      expect(key).toBeLessThan(16 * 16)
    }
  })
})
