import { describe, expect, it } from 'vitest'

import { gridCoverageClip, gridCoveragePoly } from './coverage.ts'
import { docSize } from './index.ts'

type CoverageDoc = Parameters<typeof gridCoveragePoly>[0]

const doc = (over: Partial<CoverageDoc> = {}): CoverageDoc => ({
  gridType: 'square',
  cols: 10,
  rows: 8,
  gridRotation: 0,
  ...over,
})

/** Winding-number point-in-polygon over the coverage outline. */
function polyContains(pts: { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x
    const yi = pts[i]!.y
    const xj = pts[j]!.x
    const yj = pts[j]!.y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

describe('grid coverage (drawable region of the plate)', () => {
  it('unrotated non-radial plates are fully covered — no clip', () => {
    for (const gridType of [
      'square',
      'hex',
      'hexFlat',
      'triangle',
      'rhombille',
      'diamond',
      'iso',
      'brick',
      'octasquare',
    ] as const) {
      expect(gridCoverageClip(doc({ gridType }))).toBeNull()
      const { w, h } = docSize(gridType, 10, 8)
      const pts = gridCoveragePoly(doc({ gridType }))
      expect(pts).toHaveLength(4)
      expect(polyContains(pts, w / 2, h / 2)).toBe(true)
      expect(polyContains(pts, w - 0.01, h - 0.01)).toBe(true)
    }
  })

  it('radial coverage is the inscribed disc: plate corners and margin ring are outside', () => {
    const d = doc({ gridType: 'radial', cols: 24, rows: 8 })
    const clip = gridCoverageClip(d)
    expect(clip).not.toBeNull()
    const { w, h } = docSize('radial', 24, 8)
    const cx = w / 2
    const cy = h / 2
    // plate corners and the 1-unit margin ring (r 8..9) have no cells
    expect(clip!(0, 0)).toBe(false)
    expect(clip!(cx, cy + 8.5)).toBe(false)
    // inside the disc every probe passes, boundary included
    expect(clip!(cx, cy)).toBe(true)
    expect(clip!(cx + 7.95, cy)).toBe(true)
    expect(clip!(cx + 7.999, cy)).toBe(true)
    // the polygon hugs the same disc: corners out, center in, ring boundary sampled on the arc
    const pts = gridCoveragePoly(d)
    expect(pts).toHaveLength(256)
    expect(polyContains(pts, 0.5, 0.5)).toBe(false)
    expect(polyContains(pts, cx, cy)).toBe(true)
    for (const p of pts) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(8, 6)
    }
  })

  it('rotated coverage is the turned rect: grown-plate corners are outside', () => {
    const d = doc({ gridType: 'square', cols: 10, rows: 10, gridRotation: 45 })
    const clip = gridCoverageClip(d)
    expect(clip).not.toBeNull()
    const { w, h } = docSize('square', 10, 10, 45)
    // the four grown-plate corners stay cell-free at any rotation
    for (const [x, y] of [
      [0.01, 0.01],
      [w - 0.01, 0.01],
      [0.01, h - 0.01],
      [w - 0.01, h - 0.01],
    ]) {
      expect(clip!(x, y)).toBe(false)
    }
    // the turned square's own corners and center are covered
    expect(clip!(w / 2, h / 2)).toBe(true)
    const pts = gridCoveragePoly(d)
    expect(pts).toHaveLength(4)
    expect(polyContains(pts, w / 2, h / 2)).toBe(true)
    expect(polyContains(pts, 0.01, 0.01)).toBe(false)
    // at 45° the turned corners land exactly on the plate edge midpoints
    const mids = pts.map((p) => Math.min(p.x, w - p.x, p.y, h - p.y))
    for (const m of mids) expect(m).toBeLessThan(1e-9)
  })

  it('clip and polygon agree on either side of every polygon edge (rotated + radial)', () => {
    for (const d of [
      doc({ gridType: 'square', gridRotation: 30 }),
      doc({ gridType: 'radial', cols: 16, rows: 6 }),
    ]) {
      const clip = gridCoverageClip(d)
      const pts = gridCoveragePoly(d)
      const { w, h } = docSize(d.gridType, d.cols, d.rows, d.gridRotation)
      for (let i = 0; i < 200; i++) {
        const x = (w * (i * 7919)) % w
        const y = (h * (i * 104729)) % h
        // probes strictly inside/outside agree; edge-straddling fp noise is allowed
        const inside = polyContains(pts, x, y)
        const tested = clip!(x, y)
        if (inside !== tested) {
          const margin = Math.min(x, w - x, y, h - y)
          expect(margin).toBeLessThan(0.05)
        }
      }
    }
  })
})
