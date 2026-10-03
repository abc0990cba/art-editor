import { describe, expect, it } from 'vitest'

import {
  blobShape,
  mulberry32,
  num,
  pointsBBox,
  shapeBBox,
  shapePath,
  smoothClosedPath,
  starPoints,
} from './index.ts'

describe('starPoints', () => {
  it('alternates outer and inner vertices starting at the top', () => {
    const pts = starPoints({ x: 0, y: 0 }, 100, 40, 5, 0)
    expect(pts).toHaveLength(10)
    expect(pts[0]?.x).toBeCloseTo(0, 5)
    expect(pts[0]?.y).toBeCloseTo(-100, 5)
    // First inner vertex at −90° + 36°.
    expect(pts[1]?.x).toBeCloseTo(40 * Math.cos(-Math.PI / 2 + Math.PI / 5), 5)
    // Outer vertex radius is R for every even index.
    for (let i = 0; i < 10; i += 2) {
      expect(Math.hypot(pts[i]?.x ?? 0, pts[i]?.y ?? 0)).toBeCloseTo(100, 5)
    }
  })

  it('bakes rotation into coordinates', () => {
    const rotated = starPoints({ x: 100, y: 100 }, 50, 20, 5, 90)
    expect(rotated[0]?.x).toBeCloseTo(150, 5)
    expect(rotated[0]?.y).toBeCloseTo(100, 5)
  })
})

describe('shapePath', () => {
  it('emits a closed rect path through its corners', () => {
    const d = shapePath({
      kind: 'rect',
      cx: { x: 10, y: 10 },
      w: 20,
      h: 10,
      radius: 0,
      rotation: 0,
    })
    expect(d.startsWith('M0 5')).toBe(true)
    expect(d).toContain('L20 5')
    expect(d).toContain('L20 15')
    expect(d).toContain('L0 15')
    expect(d.endsWith('Z')).toBe(true)
  })

  it('approximates an axis-aligned ellipse through its extremes', () => {
    const d = shapePath({ kind: 'ellipse', cx: { x: 0, y: 0 }, rx: 30, ry: 10, rotation: 0 })
    expect(d).toContain('M30 0')
    // Quarter points at (0,10), (−30,0), (0,−10) must appear as curve endpoints.
    expect(d).toContain('0 10')
    expect(d).toContain('-30 0')
    expect(d).toContain('0 -10')
  })

  it('maps a rotated ellipse onto its extreme points', () => {
    const d = shapePath({ kind: 'ellipse', cx: { x: 0, y: 0 }, rx: 30, ry: 10, rotation: 90 })
    // +90° rotation sends (30, 0) to (0, 30) and (0, 10) to (−10, 0).
    expect(d).toContain('M0 30')
    expect(d).toContain('-10 0')
  })

  it('clamps corner radius and keeps rounded corners inside the rect', () => {
    const d = shapePath({
      kind: 'rect',
      cx: { x: 50, y: 50 },
      w: 40,
      h: 20,
      radius: 100,
      rotation: 0,
    })
    // All coordinates stay within the rect bounds.
    for (const match of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
      const x = Number(match[1])
      const y = Number(match[2])
      expect(x).toBeGreaterThanOrEqual(30)
      expect(x).toBeLessThanOrEqual(70)
      expect(y).toBeGreaterThanOrEqual(40)
      expect(y).toBeLessThanOrEqual(60)
    }
  })
})

describe('shapeBBox', () => {
  it('computes the enclosing box of a rotated rect', () => {
    const bb = shapeBBox({
      kind: 'rect',
      cx: { x: 0, y: 0 },
      w: 100,
      h: 20,
      radius: 0,
      rotation: 90,
    })
    expect(bb.w).toBeCloseTo(20, 5)
    expect(bb.h).toBeCloseTo(100, 5)
  })

  it('uses the anchors for path shapes', () => {
    const shape = blobShape({ x: 0, y: 0 }, 50, 3, 0.2)
    const bb = shapeBBox(shape)
    expect(bb.w).toBeGreaterThan(0)
    expect(bb.h).toBeGreaterThan(0)
  })
})

describe('determinism', () => {
  it('mulberry32 reproduces sequences', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 5; i++) expect(a()).toBe(b())
  })

  it('blobShape is deterministic per seed and produces a closed path', () => {
    const a = blobShape({ x: 0, y: 0 }, 10, 42)
    const a2 = blobShape({ x: 0, y: 0 }, 10, 42)
    const b = blobShape({ x: 0, y: 0 }, 10, 43)
    expect(a.kind).toBe('path')
    expect(b.kind).toBe('path')
    if (a.kind !== 'path' || a2.kind !== 'path' || b.kind !== 'path') return
    expect(a.d).toBe(a2.d)
    expect(a.d).not.toBe(b.d)
    expect(a.d.endsWith('Z')).toBe(true)
  })
})

describe('helpers', () => {
  it('smoothClosedPath builds C segments through all anchors', () => {
    const d = smoothClosedPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    expect(d.match(/C/g)?.length).toBe(3)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('pointsBBox is exact', () => {
    const bb = pointsBBox([
      { x: -5, y: 2 },
      { x: 7, y: -3 },
      { x: 1, y: 9 },
    ])
    expect(bb).toEqual({ x: -5, y: -3, w: 12, h: 12 })
  })

  it('num trims trailing zeros and normalizes -0', () => {
    expect(num(1.5)).toBe('1.5')
    expect(num(1)).toBe('1')
    // −0.0001 rounds to "−0.000" at 3 decimals and normalizes to plain 0.
    expect(num(-0.0001)).toBe('0')
    expect(num(-0)).toBe('0')
  })
})
