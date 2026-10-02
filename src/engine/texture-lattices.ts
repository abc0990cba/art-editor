/**
 * Non-grid halftone lattices: mark centers come from the shared screen-engine lattice generator
 * (hex / rings / sunburst / spiral / phyllotaxis / scatter); size, jitter, variation, dropout and
 * the ramp knob follow the grid scanner's semantics — the ramp reads the radial order for radial
 * lattices. Points are capped at a radius that can never touch, so evenodd never XORs. Pure.
 */

import { latticePoints, type ScreenLattice } from './screen-engine.ts'
import { hash2, mulberry32, valueNoise } from './texture-core.ts'
import type { RegionState } from './texture-region.ts'

/** Collect halftone dots for a non-grid lattice into the region's dot buffers. */
export function latticeHalftoneDots(s: RegionState, kind: ScreenLattice, Ld: number): void {
  const t = s.t
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of s.cells) {
    minX = Math.min(minX, c.cx0)
    minY = Math.min(minY, c.cy0)
    maxX = Math.max(maxX, c.cx1)
    maxY = Math.max(maxY, c.cy1)
  }
  const w = Math.max(1, (maxX - minX) / Ld)
  const h = Math.max(1, (maxY - minY) / Ld)
  const points = latticePoints(kind, 1, t.seed, w, h)
  for (let i = 0; i < points.length && s.count < 20_000; i++) {
    const pt = points[i]
    const rand = mulberry32(hash2(i, 7, t.seed + 17))
    const r1 = rand()
    const r2 = rand()
    const r3 = rand()
    let dx = minX + pt.x * Ld
    let dy = minY + pt.y * Ld
    if (t.jitter > 0) {
      dx += (r1 - 0.5) * (t.jitter / 100) * Ld
      dy += (r2 - 0.5) * (t.jitter / 100) * Ld
    }
    let mult = 1
    if (t.ramp > 0) mult *= 1 + (t.ramp / 100) * (2 * pt.n - 1)
    if (t.variation > 0) mult *= 1 + (t.variation / 100) * (r3 * 2 - 1)
    const a = Math.min(Ld * 0.9 * Math.max(mult, 0.05), Ld * 0.9)
    const dropped =
      t.dropout > 0 &&
      valueNoise(dx / (Ld * 4), dy / (Ld * 4), t.seed + 77) < (t.dropout / 100) * 0.92
    if (a <= Ld * 0.015 || dropped) continue
    const fx = dx - a / 2
    const fy = dy - a / 2
    if (!s.fits(fx, fy, a)) continue
    s.dotAt.set(i, s.dots.length)
    s.dotKeys.push(i)
    s.dots.push({ cx: dx, cy: dy, r: a / 2 })
    s.count++
  }
}
