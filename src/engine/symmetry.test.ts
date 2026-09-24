import { describe, expect, it } from 'vitest'

import { linePoints } from './shapes'
import {
  REPEAT_MODES,
  polarAngleMaps,
  repeatDef,
  symmetryPairPoints,
  symmetryPoints,
  symmetryTransforms,
} from './symmetry'
import type { SymMode } from './symmetry'

const CELL = 8
const BW = 48
const BH = 48

function orbit(mode: SymMode, x: number, y: number, cell = CELL): Array<[number, number]> {
  return symmetryPoints(x, y, BW, BH, mode, 8, cell)
}

describe('symmetryPoints', () => {
  it('returns only the point for none mode', () => {
    expect(symmetryPoints(3, 4, 16, 16, 'none', 6)).toEqual([[3, 4]])
  })

  it('mirrors vertically (mirrorX) on even and odd widths', () => {
    expect(symmetryPoints(5, 2, 16, 16, 'mirrorX', 0)).toContainEqual([10, 2])
    expect(symmetryPoints(0, 2, 15, 15, 'mirrorX', 0)).toContainEqual([14, 2])
  })

  it('quad gives 4 points including mirrors', () => {
    const pts = symmetryPoints(3, 5, 16, 16, 'quad', 0)
    expect(pts).toHaveLength(4)
    expect(pts).toContainEqual([3, 5])
    expect(pts).toContainEqual([12, 5])
    expect(pts).toContainEqual([3, 10])
    expect(pts).toContainEqual([12, 10])
  })

  it('diag8 gives 8 points on square grids', () => {
    const pts = symmetryPoints(4, 10, 16, 16, 'diag8', 0)
    expect(pts).toHaveLength(8)
    expect(pts).toContainEqual([10, 4])
  })

  it('radial produces n rotated copies around the center', () => {
    const bw = 32
    const cx = (bw - 1) / 2
    // a point straight above the center rotated 6-fold stays on the vertical axis half
    const pts = symmetryPoints(15, 4, bw, bw, 'radial', 6)
    expect(pts.length).toBeGreaterThanOrEqual(5)
    // top and bottom of the axis are distinct rotations for even folds
    expect(pts.some(([x]) => Math.abs(x - cx) < 0.51)).toBe(true)
  })

  it('radial keeps the original point', () => {
    const pts = symmetryPoints(10, 20, 32, 32, 'radial', 5)
    expect(pts).toContainEqual([10, 20])
  })

  it('kaleido produces up to 2n points', () => {
    const pts = symmetryPoints(6, 3, 32, 32, 'kaleido', 8)
    expect(pts.length).toBeGreaterThan(8)
    expect(pts.length).toBeLessThanOrEqual(16)
  })

  it('drops out-of-bounds rotated points on non-square grids', () => {
    const pts = symmetryPoints(0, 0, 20, 8, 'radial', 4)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(20)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(8)
    }
  })
})

describe('repeat modes (wallpaper / tiling)', () => {
  it('every repeat mode has a definition', () => {
    for (const mode of REPEAT_MODES) {
      expect(repeatDef(mode), mode).not.toBeNull()
    }
  })

  it('all repeat modes keep the original point and stay in bounds', () => {
    for (const mode of REPEAT_MODES) {
      const pts = orbit(mode, 5, 11)
      expect(pts[0], mode).toEqual([5, 11])
      for (const [x, y] of pts) {
        expect(x, mode).toBeGreaterThanOrEqual(0)
        expect(x, mode).toBeLessThan(BW)
        expect(y, mode).toBeGreaterThanOrEqual(0)
        expect(y, mode).toBeLessThan(BH)
      }
      // deduplicated
      expect(new Set(pts.map(([x, y]) => `${x},${y}`)).size, mode).toBe(pts.length)
    }
  })

  it('p1 tiles the point every cell horizontally and vertically', () => {
    const pts = orbit('p1', 5, 3)
    expect(pts).toContainEqual([13, 3])
    expect(pts).toContainEqual([5, 11])
    expect(pts).toContainEqual([21, 19])
    expect(pts).toContainEqual([5, 3])
    // no mirrored copies
    expect(pts).not.toContainEqual([BW - 1 - 5, 3])
    // translation-only: relative offsets are exact multiples of the cell
    for (const [x, y] of pts) {
      expect((x - 5) % CELL, `${x}`).toBe(0)
      expect((y - 3) % CELL, `${y}`).toBe(0)
    }
  })

  it('brick offsets every other row by half a cell', () => {
    const pts = orbit('brick', 2, 2)
    // same row: plain translation
    expect(pts).toContainEqual([10, 2])
    // one row down: half-cell offset
    expect(pts).toContainEqual([2 + CELL / 2, 2 + CELL])
    // two rows down: aligned again
    expect(pts).toContainEqual([2, 2 + 2 * CELL])
  })

  it('halfdrop offsets every other column by half a cell', () => {
    const pts = orbit('halfdrop', 2, 2)
    expect(pts).toContainEqual([2, 10])
    expect(pts).toContainEqual([2 + CELL, 2 + CELL / 2])
    expect(pts).toContainEqual([2 + 2 * CELL, 2])
  })

  it('pm mirrors within every tile', () => {
    const pts = orbit('pm', 2, 1)
    // mirror of u=2 across the cell edge at u=0, translated by one cell
    expect(pts).toContainEqual([CELL - 2, 1])
    expect(pts).toContainEqual([CELL + 2, 1])
    expect(pts).toContainEqual([2 * CELL - 2, 1])
    // mirror is along the v axis: vertical offsets stay whole cells
    for (const [, y] of pts) expect((y - 1) % CELL, `${y}`).toBe(0)
  })

  it('pg glides: mirror plus half-cell vertical shift', () => {
    const pts = orbit('pg', 2, 1)
    expect(pts).toContainEqual([CELL - 2, 1 + CELL / 2])
    expect(pts).toContainEqual([2, 1])
  })

  it('p2 adds half-turn copies', () => {
    const pts = orbit('p2', 2, 1, 16)
    // 180° about the tile origin: (u,v) → (−u,−v), translated back in-bounds
    expect(pts).toContainEqual([16 - 2, 16 - 1])
  })

  it('p4m includes quarter-turn and diagonal copies in the same tile', () => {
    const pts = orbit('p4m', 5, 1, 16)
    // quarter turn (u,v)→(−v,u): (−1, 5) ≡ (15, 5)
    expect(pts).toContainEqual([15, 5])
    // diagonal mirror (u,v)→(v,u): (1, 5)
    expect(pts).toContainEqual([1, 5])
    // tiled copies of the rotation
    expect(pts).toContainEqual([16 + 15, 5])
  })

  it('cm includes the centered copy', () => {
    const pts = orbit('cm', 2, 1, 16)
    // plain translation
    expect(pts).toContainEqual([18, 1])
    // centering (½,½) applied to the identity copy
    expect(pts).toContainEqual([8 + 2, 8 + 1])
  })

  it('p6 stays on the hexagonal lattice', () => {
    // hex basis with cell 16: A=(16,0), B=(8, 13.856…); all p6 ops fix the
    // lattice origin, so the orbit of (0,0) is the pure translation lattice
    const pts = symmetryPoints(0, 0, 48, 48, 'p6', 8, 16)
    expect(pts.length).toBeGreaterThan(6)
    for (const [x, y] of pts) {
      // y = round(j·|B|): recover j within rounding, then i exactly
      const j = y / (16 * (Math.sqrt(3) / 2))
      const jr = Math.round(j)
      const i = (x - jr * 8) / 16
      expect(Math.abs(j - jr), `j=${j}`).toBeLessThan(0.04)
      expect(Math.abs(i - Math.round(i)), `i=${i} (x=${x}, y=${y})`).toBeLessThan(0.001)
    }
  })

  it('op tables close under composition modulo lattice translations', () => {
    const sample: Array<[number, number]> = [
      [0.137, 0.521],
      [0.6, 0.3],
      [0.25, 0.75],
      [0.5, 0.5],
    ]
    for (const mode of REPEAT_MODES) {
      const def = repeatDef(mode)
      if (!def) continue
      for (const b of def.ops) {
        for (const a of def.ops) {
          for (const [u, v] of sample) {
            const u1 = b.m[0] * u + b.m[1] * v + b.f[0]
            const v1 = b.m[2] * u + b.m[3] * v + b.f[1]
            const u2 = a.m[0] * u1 + a.m[1] * v1 + a.f[0]
            const v2 = a.m[2] * u1 + a.m[3] * v1 + a.f[1]
            // a∘b must equal some table op up to whole lattice translations
            const ok = def.ops.some(({ m, f }) => {
              const du = u2 - (m[0] * u + m[1] * v + f[0])
              const dv = v2 - (m[2] * u + m[3] * v + f[1])
              return Math.abs(du - Math.round(du)) < 1e-9 && Math.abs(dv - Math.round(dv)) < 1e-9
            })
            expect(ok, `${mode}: ${JSON.stringify(a.m)}∘${JSON.stringify(b.m)} not in table`).toBe(
              true,
            )
          }
        }
      }
    }
  })

  it('caps pathological orbit sizes', () => {
    const pts = symmetryPoints(1, 1, 64, 64, 'p1', 8, 4)
    expect(pts.length).toBeLessThanOrEqual(4096)
  })
})

describe('polarAngleMaps (non-square lattices)', () => {
  /** Apply an angle map to a cartesian point about the origin */
  const apply = (f: (a: number, r: number) => number, x: number, y: number): [number, number] => {
    const r = Math.hypot(x, y)
    const a2 = f(Math.atan2(y, x), r)
    return [r * Math.cos(a2), r * Math.sin(a2)]
  }

  it('mirrorX reflects left↔right (x negates, y stays)', () => {
    const [f] = polarAngleMaps('mirrorX', 8)
    const [x, y] = apply(f, 3, 1)
    expect(x).toBeCloseTo(-3)
    expect(y).toBeCloseTo(1)
  })

  it('mirrorY reflects top↔bottom (y negates, x stays)', () => {
    const [f] = polarAngleMaps('mirrorY', 8)
    const [x, y] = apply(f, 3, 1)
    expect(x).toBeCloseTo(3)
    expect(y).toBeCloseTo(-1)
  })

  it('kaleido mirrors across the vertical axis like the square-grid math', () => {
    const maps = polarAngleMaps('kaleido', 6)
    expect(maps).toHaveLength(6) // 5 rotations + 1 mirror
    const [x, y] = apply(maps[maps.length - 1], 3, 1)
    expect(x).toBeCloseTo(-3)
    expect(y).toBeCloseTo(1)
  })

  it('radial yields fold−1 rotations and diag8 yields the 7 other D4 elements', () => {
    expect(polarAngleMaps('radial', 6)).toHaveLength(5)
    expect(polarAngleMaps('diag8', 8)).toHaveLength(7)
    expect(polarAngleMaps('quad', 8)).toHaveLength(3)
  })

  it('returns no maps for none and repeat modes', () => {
    expect(polarAngleMaps('none', 8)).toHaveLength(0)
    for (const mode of REPEAT_MODES) {
      expect(polarAngleMaps(mode, 8), mode).toHaveLength(0)
    }
  })
})

describe('symmetryTransforms (per-copy endpoint maps)', () => {
  it('returns null for none and all repeat modes', () => {
    expect(symmetryTransforms(32, 32, 'none', 8)).toBeNull()
    for (const mode of REPEAT_MODES) {
      expect(symmetryTransforms(32, 32, mode, 8), mode).toBeNull()
    }
  })

  it('mirrorX maps x to the opposite edge', () => {
    const [t] = symmetryTransforms(16, 16, 'mirrorX', 0)!
    expect(t(5, 2)).toEqual([10, 2])
    expect(t(0, 7)).toEqual([15, 7])
  })

  it('diag8 includes the transpose and point reflection', () => {
    const ts = symmetryTransforms(16, 16, 'diag8', 0)!
    const results = ts.map((t) => t(3, 10)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(results).toContainEqual([10, 3])
    expect(results).toContainEqual([12, 5])
  })

  it('radial exposes fold maps (identity included)', () => {
    const ts = symmetryTransforms(32, 32, 'radial', 6)!
    expect(ts).toHaveLength(6)
    const first = ts[0](10, 20)
    expect(first).toEqual([10, 20])
    const unique = new Set(ts.map((t) => t(22, 6).join(',')))
    expect(unique.size).toBeGreaterThan(3)
  })

  it('kaleido exposes 2·fold maps', () => {
    expect(symmetryTransforms(32, 32, 'kaleido', 6)).toHaveLength(12)
  })

  const equivariantModes: SymMode[] = ['mirrorX', 'mirrorY', 'quad', 'diag8']
  it.each(equivariantModes)('%s rasterized copies match transformed rasters', (mode) => {
    const bw = 24
    const bh = 24
    const ts = symmetryTransforms(bw, bh, mode, 8)!
    const a: [number, number] = [2, 3]
    const b: [number, number] = [19, 14]
    const original = linePoints(a[0], a[1], b[0], b[1])
    const mapped = new Set(original.map(([x, y]) => `${x},${y}`)) // transformed copies of the raster
    for (const t of ts) {
      for (const [x, y] of original) mapped.add(t(x, y).join(','))
    }
    // re-rasterizing the mapped endpoints must land on the same pixels
    const direct = new Set<string>()
    const push = (p: [number, number], q: [number, number]) => {
      for (const [x, y] of linePoints(p[0], p[1], q[0], q[1])) direct.add(`${x},${y}`)
    }
    push(a, b)
    for (const t of ts) push(t(a[0], a[1]), t(b[0], b[1]))
    expect([...direct].sort()).toEqual([...mapped].sort())
  })
})

describe('symmetryPairPoints (connector copies)', () => {
  it('starts with the original pair', () => {
    const pairs = symmetryPairPoints(3, 4, 8, 9, 32, 32, 'none', 8)
    expect(pairs).toEqual([[3, 4, 8, 9]])
  })

  it('mirrorX maps both endpoints with the same mirror', () => {
    const pairs = symmetryPairPoints(3, 4, 8, 9, 32, 32, 'mirrorX', 0)
    expect(pairs).toHaveLength(2)
    expect(pairs[1]).toEqual([28, 4, 23, 9])
  })

  it('quad mirrors both endpoints into every quadrant', () => {
    const pairs = symmetryPairPoints(3, 4, 5, 6, 32, 32, 'quad', 0)
    expect(pairs).toHaveLength(4)
    expect(pairs.map((p) => p.join(','))).toContain('3,27,5,25')
    expect(pairs.map((p) => p.join(','))).toContain('28,27,26,25')
  })

  it('repeat modes keep both endpoints under one tile operation', () => {
    const pairs = symmetryPairPoints(5, 3, 7, 4, 48, 48, 'p1', 8, 8)
    // p1 is translation-only: the pair must move rigidly by whole cells
    for (const [ax, ay, bx, by] of pairs) {
      expect((ax - 5) % 8).toBe(0)
      expect((ay - 3) % 8).toBe(0)
      expect(bx - ax).toBe(2)
      expect(by - ay).toBe(1)
    }
    expect(pairs.length).toBeGreaterThan(3)
  })

  it('never returns out-of-bounds copies', () => {
    for (const mode of ['mirrorX', 'quad', 'radial', 'p1', 'p4m', 'brick'] as SymMode[]) {
      const pairs = symmetryPairPoints(1, 1, 2, 1, 24, 24, mode, 6, 6)
      for (const [ax, ay, bx, by] of pairs) {
        expect(ax, `${mode}`).toBeGreaterThanOrEqual(0)
        expect(ax, `${mode}`).toBeLessThan(24)
        expect(ay, `${mode}`).toBeGreaterThanOrEqual(0)
        expect(ay, `${mode}`).toBeLessThan(24)
        expect(bx, `${mode}`).toBeGreaterThanOrEqual(0)
        expect(bx, `${mode}`).toBeLessThan(24)
        expect(by, `${mode}`).toBeGreaterThanOrEqual(0)
        expect(by, `${mode}`).toBeLessThan(24)
      }
    }
  })
})

describe('radial fill/phase/twist', () => {
  const fillRadial = (
    x: number,
    y: number,
    opts?: { fill?: number; phase?: number; twist?: number },
  ) => symmetryPoints(x, y, BW, BH, 'radial', 8, CELL, opts)

  it('fill 100 keeps the plain radial orbit', () => {
    const plain = symmetryPoints(30, 20, BW, BH, 'radial', 8, CELL)
    const gated = fillRadial(30, 20, { fill: 100 })
    expect(gated).toEqual(plain)
  })

  it('fill gate: nothing paints outside the wedge, the point paints inside it', () => {
    // sector width is 45° (n=8); the wedge covers the first quarter of every sector
    const inside = fillRadial(34, 25, { fill: 25 }) // ~8° from center → inside the wedge
    expect(inside.length).toBeGreaterThan(0)
    const outside = fillRadial(26, 20, { fill: 25 }) // ~-54° → frac 0.79 of its sector
    expect(outside).toEqual([])
  })

  it('phase rotates the paintable window', () => {
    const x = 31
    const y = 30 // ~41° from center → frac 0.91 of its sector
    expect(fillRadial(x, y, { fill: 25 })).toEqual([])
    // shifting the pattern by 30° moves the point to frac 0.24 — inside the wedge
    const shifted = fillRadial(x, y, { fill: 25, phase: 30 })
    expect(shifted.length).toBeGreaterThan(0)
  })

  it('twist rotates orbits around the center while keeping the radius', () => {
    const cx = (BW - 1) / 2
    const cy = (BH - 1) / 2
    const plain = fillRadial(38, 24)
    const twisted = fillRadial(38, 24, { twist: 45 })
    expect(twisted).not.toEqual(plain)
    const r = Math.hypot(38 - cx, 24 - cy)
    for (const [px, py] of twisted) {
      expect(Math.abs(Math.hypot(px - cx, py - cy) - r)).toBeLessThanOrEqual(0.75)
    }
    // twisting does not bypass the sector gate
    expect(fillRadial(26, 20, { fill: 25, twist: 45 })).toEqual([])
  })
})
