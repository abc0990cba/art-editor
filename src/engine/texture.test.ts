import { describe, expect, it } from 'vitest'

import { defaultDoc, type TextureSettings } from './doc.ts'
import { buildGeometry } from './geometry.ts'
import { deserialize, serialize } from './project.ts'
import { buildSvg } from './svg.ts'
import { figureSpace } from './texture-figure.ts'
import { fieldTextureFragments, regionTextureFragments, type TextureCell } from './texture.ts'

const DEFAULTS: Omit<TextureSettings, 'effect'> = {
  amount: 60,
  scale: 1,
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
}

function settings(patch: Partial<TextureSettings> = {}): TextureSettings {
  return { effect: 'grain', ...DEFAULTS, seed: 1, ...patch }
}

/** One 0.88-wide rounded pixel centered in tile (3,2), sub = 1. */
function singleCell(over: Partial<TextureCell> = {}): TextureCell[] {
  return [
    {
      x: 3.06,
      y: 2.06,
      w: 0.88,
      h: 0.88,
      radii: [0.37, 0.37, 0.37, 0.37],
      chamfer: false,
      cx0: 3,
      cy0: 2,
      cx1: 4,
      cy1: 3,
      connectedL: false,
      connectedT: false,
      connectedR: false,
      connectedB: false,
      ...over,
    },
  ]
}

/** Two horizontal neighbors, fill rects 0.88 wide in tiles (3,2) and (4,2). */
function pairCells(): TextureCell[] {
  const shared = {
    y: 2.06,
    h: 0.88,
    radii: [0.37, 0.37, 0.37, 0.37],
    chamfer: false,
    cy0: 2,
    cy1: 3,
    connectedT: false,
    connectedB: false,
  }
  return [
    { ...shared, x: 3.06, w: 0.88, cx0: 3, cx1: 4, connectedL: false, connectedR: true },
    { ...shared, x: 4.06, w: 0.88, cx0: 4, cx1: 5, connectedL: true, connectedR: false },
  ]
}

/** Absolute M points of every fleck (works for squares, dots and chips). */
function fleckPoints(frag: string): [number, number][] {
  const pts: [number, number][] = []
  for (const m of frag.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)) {
    pts.push([Number(m[1]), Number(m[2])])
  }
  return pts
}

/** Bounding box per fleck, parsed from its leading fragment. */
function fleckBoxes(frag: string): number[][] {
  return frag
    .split(/(?=M)/)
    .filter(Boolean)
    .map((f) => {
      const sq = f.match(/^M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v/)
      if (sq) {
        const [fx, fy, s] = [Number(sq[1]), Number(sq[2]), Number(sq[3])]
        return [fx, fy, fx + s, fy + s]
      }
      const ci = f.match(/^M(-?[\d.]+) (-?[\d.]+)a(-?[\d.]+)/)
      if (ci) {
        const [fx, fy, r] = [Number(ci[1]), Number(ci[2]), Number(ci[3])]
        return [fx, fy - r, fx + 2 * r, fy + r]
      }
      const pts = [...f.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ])
      const xs = pts.map((q) => q[0])
      const ys = pts.map((q) => q[1])
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    })
}

describe('regionTextureFragments', () => {
  it('returns nothing for none, zero amount or empty regions', () => {
    expect(regionTextureFragments(singleCell(), settings({ effect: 'none' }), 5)).toBe('')
    expect(regionTextureFragments(singleCell(), settings({ amount: 0 }), 5)).toBe('')
    expect(regionTextureFragments([], settings(), 5)).toBe('')
  })

  it('is deterministic per seed and differs between seeds', () => {
    const a = regionTextureFragments(singleCell(), settings({ seed: 7 }), 42)
    const b = regionTextureFragments(singleCell(), settings({ seed: 7 }), 42)
    const c = regionTextureFragments(singleCell(), settings({ seed: 8 }), 42)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toBe('')
  })

  it(
    'keeps every fleck inside the placement area and clear of rounded corners',
    { timeout: 30000 },
    () => {
      const EPS = 0.002 // fragment coords are rounded to 3 decimals
      const R = 0.37
      for (const effect of ['grain', 'grunge', 'halftone'] as const) {
        for (const scale of [0.1, 1, 8]) {
          for (const shape of ['square', 'dot', 'chip'] as const) {
            for (const dist of ['scatter', 'clumps', 'streaks', 'perlin', 'voronoi'] as const) {
              for (const chamfer of [false, true]) {
                const frag = regionTextureFragments(
                  singleCell({ chamfer }),
                  settings({
                    effect,
                    scale,
                    shape,
                    dist,
                    amount: 100,
                    sizeMin: 0.05,
                    sizeMax: 0.6,
                  }),
                  9,
                )
                for (const [x0, y0, x1, y1] of fleckBoxes(frag)) {
                  expect(x0).toBeGreaterThanOrEqual(RECT_X - EPS)
                  expect(x1).toBeLessThanOrEqual(RECT_X + RECT_W + EPS)
                  expect(y0).toBeGreaterThanOrEqual(RECT_Y - EPS)
                  expect(y1).toBeLessThanOrEqual(RECT_Y + RECT_H + EPS)
                  const qx0 = x0 < RECT_X + R
                  const qx1 = x1 > RECT_X + RECT_W - R
                  const qy0 = y0 < RECT_Y + R
                  const qy1 = y1 > RECT_Y + RECT_H - R
                  const checks: [boolean, number, number, number, number][] = [
                    [qx0 && qy0, RECT_X + R, RECT_Y + R, x0, y0], // tl
                    [qx1 && qy0, RECT_X + RECT_W - R, RECT_Y + R, x1, y0], // tr
                    [qx1 && qy1, RECT_X + RECT_W - R, RECT_Y + RECT_H - R, x1, y1], // br
                    [qx0 && qy1, RECT_X + R, RECT_Y + RECT_H - R, x0, y1], // bl
                  ]
                  for (const [active, ccx, ccy, px, py] of checks) {
                    if (!active) continue
                    if (chamfer) {
                      const u = px < RECT_X + RECT_W / 2 ? px - RECT_X : RECT_X + RECT_W - px
                      const v = py < RECT_Y + RECT_H / 2 ? py - RECT_Y : RECT_Y + RECT_H - py
                      expect(u + v + 1e-9).toBeGreaterThanOrEqual(R - EPS)
                    } else {
                      const d2 = (px - ccx) ** 2 + (py - ccy) ** 2
                      expect(d2).toBeLessThanOrEqual((R + EPS) ** 2)
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
  )

  it('runs continuously across connected cells (no inner gap)', () => {
    // fully tiled fills (size 100%): specks cross the shared tile edge
    const tiled: TextureCell[] = pairCells().map((c) => ({
      ...c,
      x: c.cx0,
      y: c.cy0,
      w: 1,
      h: 1,
      radii: [0.12, 0.12, 0.12, 0.12],
    }))
    const frag = regionTextureFragments(tiled, settings({ amount: 100, seed: 3 }), 5)
    const boxes = fleckBoxes(frag)
    expect(boxes.some(([x0, , x1]) => x0 < 4 && x1 > 4)).toBe(true)
    // gapped fills (size 88%): specks still reach the fill edges — no clean band
    const frag2 = regionTextureFragments(pairCells(), settings({ amount: 100, seed: 3 }), 5)
    const cell0 = fleckBoxes(frag2).filter(([x0]) => x0 < 4)
    expect(cell0.length).toBeGreaterThan(0)
    expect(Math.max(...cell0.map(([, , x1]) => x1))).toBeGreaterThanOrEqual(3.9)
    const cell1 = fleckBoxes(frag2).filter(([x0]) => x0 >= 4)
    expect(Math.min(...cell1.map(([x0]) => x0))).toBeLessThanOrEqual(4.14)
  })

  it('applies the gap only on open sides', () => {
    const gap = 0.3
    const lone = regionTextureFragments(singleCell(), settings({ amount: 100, gap, seed: 3 }), 5)
    for (const [x0, y0, x1, y1] of fleckBoxes(lone)) {
      expect(x0).toBeGreaterThanOrEqual(3.06 + gap - 0.002)
      expect(x1).toBeLessThanOrEqual(3.94 - gap + 0.002)
      expect(y0).toBeGreaterThanOrEqual(2.06 + gap - 0.002)
      expect(y1).toBeLessThanOrEqual(2.94 - gap + 0.002)
    }
    // connected side: no margin, texture reaches the tile edge
    const joined = regionTextureFragments(pairCells(), settings({ amount: 100, gap, seed: 3 }), 5)
    const cell0 = fleckBoxes(joined).filter(([x0]) => x0 < 4)
    expect(Math.max(...cell0.map(([x1]) => x1))).toBeGreaterThan(4 - gap)
  })

  it('halftone ignores the seed', () => {
    expect(regionTextureFragments(singleCell(), settings({ effect: 'halftone', seed: 1 }), 5)).toBe(
      regionTextureFragments(singleCell(), settings({ effect: 'halftone', seed: 999 }), 5),
    )
  })

  it('halftone at zero distress emits plain circles on an unrotated grid', () => {
    const frag = regionTextureFragments(
      singleCell(),
      settings({ effect: 'halftone', angle: 0, amount: 40 }),
      5,
    )
    expect(frag).not.toBe('')
    for (const sub of frag.split(/(?=M)/).filter(Boolean)) {
      expect(sub).toMatch(/^M-?[\d.]+ -?[\d.]+a[\d.]+ [\d.]+ 0 1 0/)
    }
  })

  it('halftone rotates the grid with the angle setting', () => {
    const args = { effect: 'halftone' as const, amount: 100 }
    const a0 = regionTextureFragments(singleCell(), settings({ ...args, angle: 0 }), 5)
    const a45 = regionTextureFragments(singleCell(), settings({ ...args, angle: 45 }), 5)
    expect(a0).not.toBe(a45)
    expect(a45).toBe(regionTextureFragments(singleCell(), settings({ ...args, angle: 45 }), 5))
  })

  it('halftone distress knobs are deterministic per seed and seed-dependent', () => {
    for (const patch of [
      { jitter: 60 },
      { variation: 60 },
      { wobble: 60 },
      { dropout: 40 },
      { spray: 60 },
    ]) {
      const args = { effect: 'halftone' as const, angle: 0, amount: 80, ...patch }
      const a = regionTextureFragments(singleCell(), settings(args), 7)
      const b = regionTextureFragments(singleCell(), settings(args), 7)
      const c = regionTextureFragments(singleCell(), settings({ ...args, seed: 2 }), 7)
      expect(a).toBe(b)
      expect(a).not.toBe('')
      expect(a).not.toBe(c)
    }
    // ramp is purely geometric, so it stays seed-independent
    const rampArgs = { effect: 'halftone' as const, angle: 0, amount: 80, ramp: 70 }
    expect(regionTextureFragments(singleCell(), settings(rampArgs), 7)).toBe(
      regionTextureFragments(singleCell(), settings({ ...rampArgs, seed: 2 }), 7),
    )
  })

  it('halftone wobble replaces circles with wobbled outlines', () => {
    const plain = regionTextureFragments(
      singleCell(),
      settings({ effect: 'halftone', angle: 0, amount: 80 }),
      7,
    )
    const wobbled = regionTextureFragments(
      singleCell(),
      settings({ effect: 'halftone', angle: 0, amount: 80, wobble: 80 }),
      7,
    )
    expect(plain).toMatch(/a[\d.]+ [\d.]+/)
    expect(wobbled).not.toMatch(/a[\d.]+ [\d.]+/)
    expect(wobbled).toMatch(/Q/)
    expect(wobbled.split('M').length).toBe(plain.split('M').length)
  })

  it('halftone dropout removes dots, spray adds them', () => {
    const args = { effect: 'halftone' as const, angle: 0, amount: 80, seed: 4 }
    const plain = regionTextureFragments(singleCell(), settings(args), 7)
    const worn = regionTextureFragments(singleCell(), settings({ ...args, dropout: 60 }), 7)
    const dirty = regionTextureFragments(singleCell(), settings({ ...args, spray: 80 }), 7)
    const n = (s: string) => s.split('M').length - 1
    expect(n(worn)).toBeLessThan(n(plain))
    expect(n(dirty)).toBeGreaterThan(n(plain))
  })

  it('halftone merge fuses touching dots into fewer, bigger subpaths', () => {
    const args = { effect: 'halftone' as const, angle: 0, amount: 100, seed: 3 }
    const plain = regionTextureFragments(singleCell(), settings(args), 7)
    const merged = regionTextureFragments(singleCell(), settings({ ...args, merge: 100 }), 7)
    const n = (s: string) => s.split('M').length - 1
    expect(n(merged)).toBeLessThan(n(plain))
    // fused blobs are smooth single-subpath outlines (quadratic segments)
    expect(merged).toMatch(/M[^M]*Q/)
  })

  it('halftone keeps big distressed regions under the fleck budget', () => {
    const cells: TextureCell[] = []
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        cells.push({
          x: x + 0.06,
          y: y + 0.06,
          w: 0.88,
          h: 0.88,
          radii: [0.1, 0.1, 0.1, 0.1],
          chamfer: false,
          cx0: x,
          cy0: y,
          cx1: x + 1,
          cy1: y + 1,
          connectedL: x > 0,
          connectedT: y > 0,
          connectedR: x < 29,
          connectedB: y < 29,
        })
      }
    }
    const frag = regionTextureFragments(
      cells,
      settings({
        effect: 'halftone',
        amount: 100,
        jitter: 50,
        variation: 60,
        wobble: 70,
        merge: 60,
        dropout: 30,
        spray: 50,
        ramp: 80,
        seed: 9,
      }),
      1,
    )
    expect(frag.split('M').length - 1).toBeLessThanOrEqual(20000)
    expect(frag).not.toBe('')
  })

  it('grunge wears the edges more than the center', () => {
    const frag = regionTextureFragments(
      singleCell(),
      settings({ effect: 'grunge', amount: 90, seed: 11 }),
      13,
    )
    let edgeN = 0
    let coreN = 0
    for (const [fx] of fleckPoints(frag)) {
      if (fx >= 3.06 && fx <= 3.31) edgeN++
      if (fx >= 3.38 && fx <= 3.62) coreN++
    }
    expect(edgeN).toBeGreaterThan(coreN)
  })

  it('edge focus 0 makes grunge uniform', () => {
    const focused = regionTextureFragments(
      singleCell(),
      settings({ effect: 'grunge', amount: 90, seed: 11 }),
      13,
    )
    const uniform = regionTextureFragments(
      singleCell(),
      settings({ effect: 'grunge', amount: 90, seed: 11, edge: 0 }),
      13,
    )
    expect(uniform).not.toBe(focused)
    let coreFocused = 0
    let coreUniform = 0
    for (const [fx] of fleckPoints(uniform)) {
      if (fx >= 3.38 && fx <= 3.62) coreUniform++
    }
    for (const [fx] of fleckPoints(focused)) {
      if (fx >= 3.38 && fx <= 3.62) coreFocused++
    }
    expect(coreUniform).toBeGreaterThan(coreFocused)
  })

  it('distributions are deterministic and pairwise distinct', () => {
    const dists = [
      'scatter',
      'clumps',
      'streaks',
      'perlin',
      'voronoi',
      'waves',
      'sunburst',
      'spiral',
      'honeycomb',
      'scales',
      'weave',
      'checker',
      'fade',
      'bayer',
    ] as const
    for (const effect of ['grain', 'grunge'] as const) {
      for (let k = 0; k < dists.length; k++) {
        const out = regionTextureFragments(
          singleCell(),
          settings({ effect, dist: dists[k], amount: 80, seed: 21 }),
          17,
        )
        expect(out).toBe(
          regionTextureFragments(
            singleCell(),
            settings({ effect, dist: dists[k], amount: 80, seed: 21 }),
            17,
          ),
        )
      }
    }
    for (let a = 0; a < dists.length; a++) {
      for (let b = a + 1; b < dists.length; b++) {
        const differ = [21, 22, 23].some(
          (seed) =>
            regionTextureFragments(
              singleCell(),
              settings({ dist: dists[a], amount: 80, seed }),
              17,
            ) !==
            regionTextureFragments(
              singleCell(),
              settings({ dist: dists[b], amount: 80, seed }),
              17,
            ),
        )
        expect(differ).toBe(true)
      }
    }
  })

  it('streaks follow the angle setting', () => {
    const args = { dist: 'streaks' as const, amount: 90, seed: 5 }
    const a0 = regionTextureFragments(singleCell(), settings({ ...args, angle: 0 }), 21)
    const a90 = regionTextureFragments(singleCell(), settings({ ...args, angle: 90 }), 21)
    expect(a0).not.toBe(a90)
    expect(a0).toBe(regionTextureFragments(singleCell(), settings({ ...args, angle: 0 }), 21))
  })

  it('keeps density on rounded corners (fit, not reject)', () => {
    const sharp = regionTextureFragments(
      singleCell({ radii: [0, 0, 0, 0] }),
      settings({ amount: 100, seed: 6 }),
      31,
    )
    const rounded = regionTextureFragments(
      singleCell({ radii: [0.44, 0.44, 0.44, 0.44] }),
      settings({ amount: 100, seed: 6 }),
      31,
    )
    const nSharp = fleckPoints(sharp).length
    const nRound = fleckPoints(rounded).length
    expect(nSharp).toBeGreaterThan(0)
    expect(nRound).toBeGreaterThanOrEqual(nSharp * 0.75)
  })

  it('emits the configured speck shape', () => {
    const square = regionTextureFragments(
      singleCell(),
      settings({ amount: 100, shape: 'square', seed: 2 }),
      8,
    )
    const dot = regionTextureFragments(
      singleCell(),
      settings({ amount: 100, shape: 'dot', seed: 2 }),
      8,
    )
    const chip = regionTextureFragments(
      singleCell(),
      settings({ amount: 100, shape: 'chip', seed: 2 }),
      8,
    )
    expect(square).toMatch(/h[\d.]+v/)
    expect(square).not.toMatch(/M[^M]*L/)
    expect(dot).toMatch(/a[\d.]+ [\d.]+/)
    expect(dot).not.toMatch(/h[\d.]+v/)
    expect(chip).toMatch(/M[^M]*L/)
    expect(chip.split('M').length - 1).toBeGreaterThan(0)
  })

  it('keeps large regions under the fleck budget', () => {
    const cells: TextureCell[] = []
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        cells.push({
          x: x + 0.06,
          y: y + 0.06,
          w: 0.88,
          h: 0.88,
          radii: [0.1, 0.1, 0.1, 0.1],
          chamfer: false,
          cx0: x,
          cy0: y,
          cx1: x + 1,
          cy1: y + 1,
          connectedL: x > 0,
          connectedT: y > 0,
          connectedR: x < 39,
          connectedB: y < 39,
        })
      }
    }
    const frag = regionTextureFragments(cells, settings({ amount: 100, seed: 2 }), 1)
    const n = frag.split('M').length - 1
    expect(n).toBeLessThanOrEqual(20000)
    expect(n).toBeGreaterThan(5000)
  })

  it('emits the new speck silhouettes inside the fill', () => {
    const EPS = 0.002
    for (const shape of ['triangle', 'diamond', 'cross', 'star', 'hex', 'ring', 'dash'] as const) {
      const frag = regionTextureFragments(
        singleCell(),
        settings({ amount: 100, shape, seed: 2 }),
        8,
      )
      expect(frag).not.toBe('')
      for (const [x0, y0, x1, y1] of fleckBoxes(frag)) {
        expect(x0).toBeGreaterThanOrEqual(RECT_X - EPS)
        expect(x1).toBeLessThanOrEqual(RECT_X + RECT_W + EPS)
        expect(y0).toBeGreaterThanOrEqual(RECT_Y - EPS)
        expect(y1).toBeLessThanOrEqual(RECT_Y + RECT_H + EPS)
      }
      if (shape === 'triangle') expect(frag).toMatch(/M[^M]*L/)
      if (shape === 'ring') expect(frag).toMatch(/a[^M]*a/)
    }
    // rotated silhouettes differ per seed
    const a = regionTextureFragments(
      singleCell(),
      settings({ amount: 100, shape: 'star', seed: 2 }),
      8,
    )
    const b = regionTextureFragments(
      singleCell(),
      settings({ amount: 100, shape: 'star', seed: 3 }),
      8,
    )
    expect(a).not.toBe(b)
  })

  it('figure gap hugs the merged outline and ignores internal color borders', () => {
    // 2×2 figure: color A fills the left column, color B the right (size 100%)
    const cell = (x: number, y: number, connectedT: boolean, connectedB: boolean): TextureCell => ({
      x,
      y,
      w: 1,
      h: 1,
      radii: [0, 0, 0, 0],
      chamfer: false,
      cx0: x,
      cy0: y,
      cx1: x + 1,
      cy1: y + 1,
      connectedL: false,
      connectedT,
      connectedR: false,
      connectedB,
    })
    const aCells = [cell(3, 2, false, true), cell(3, 3, true, false)]
    const bCells = [cell(4, 2, false, true), cell(4, 3, true, false)]
    const fig = figureSpace([...aCells, ...bCells], 1)
    const args = { amount: 100, gap: 0.3, seed: 3 }

    // cell mode: every open side insets — the A/B border carries the margin
    const lone = regionTextureFragments(aCells, settings(args), 5)
    for (const box of fleckBoxes(lone)) expect(box[2]).toBeLessThanOrEqual(4 - 0.3 + 0.002)
    // figure mode: texture reaches the internal border from both sides
    const figA = regionTextureFragments(aCells, settings(args), 5, fig)
    for (const [x0, y0, , y1] of fleckBoxes(figA)) {
      expect(x0).toBeGreaterThanOrEqual(3 + 0.3 - 0.002)
      expect(y0).toBeGreaterThanOrEqual(2 + 0.3 - 0.002)
      expect(y1).toBeLessThanOrEqual(4 - 0.3 + 0.002)
    }
    expect(Math.max(...fleckBoxes(figA).map((box) => box[2]))).toBeGreaterThan(4 - 0.3)
    const figB = regionTextureFragments(bCells, settings(args), 5, fig)
    expect(Math.min(...fleckBoxes(figB).map(([x0]) => x0))).toBeLessThan(4 + 0.3)
  })

  it('even spread enforces a minimum distance between fleck centers', () => {
    const cells: TextureCell[] = []
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        cells.push({
          x,
          y,
          w: 1,
          h: 1,
          radii: [0, 0, 0, 0],
          chamfer: false,
          cx0: x,
          cy0: y,
          cx1: x + 1,
          cy1: y + 1,
          connectedL: x > 0,
          connectedT: y > 0,
          connectedR: x < 5,
          connectedB: y < 5,
        })
      }
    }
    const args = { amount: 100, scale: 1, seed: 5 }
    const plain = fleckBoxes(regionTextureFragments(cells, settings(args), 3))
    const even = fleckBoxes(regionTextureFragments(cells, settings({ ...args, even: true }), 3))
    expect(even.length).toBeGreaterThan(20)
    expect(even.length).toBeLessThan(plain.length)
    const minD = 0.8 * 0.14 // 0.8 lattice pitches at scale 1, sub 1
    let minPair = Infinity
    for (let i = 0; i < even.length; i++) {
      for (let j = i + 1; j < even.length; j++) {
        const d = Math.hypot(
          (even[j][0] + even[j][2]) / 2 - (even[i][0] + even[i][2]) / 2,
          (even[j][1] + even[j][3]) / 2 - (even[i][1] + even[i][3]) / 2,
        )
        if (d < minPair) minPair = d
      }
    }
    expect(minPair).toBeGreaterThanOrEqual(minD - 0.002)
  })
})

describe('fieldTextureFragments (metaball)', () => {
  // 1.0 blob inside a zero border; 24 nodes cover 1.2 doc units at scale 0.05
  function blobField(): { f: Float32Array; fw: number; fh: number; scale: number } {
    const fw = 24
    const fh = 24
    const f = new Float32Array(fw * fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const dx = (x - 11.5) / 7
        const dy = (y - 11.5) / 7
        f[y * fw + x] = dx * dx + dy * dy < 1 ? 1 : 0
      }
    }
    return { f, fw, fh, scale: 0.05 }
  }

  it('skips none/zero-amount and keeps flecks strictly inside the blob', () => {
    const field = blobField()
    expect(fieldTextureFragments(field, settings({ effect: 'none' }), 3)).toBe('')
    expect(fieldTextureFragments(field, settings({ amount: 0 }), 3)).toBe('')
    const frag = fieldTextureFragments(field, settings({ amount: 90, seed: 5 }), 3)
    expect(frag).not.toBe('')
    const valueAt = (x: number, y: number) => {
      const gx = Math.max(0, Math.min(23, x / 0.05))
      const gy = Math.max(0, Math.min(23, y / 0.05))
      return field.f[Math.round(gy) * 24 + Math.round(gx)]
    }
    for (const [fx, fy] of fleckPoints(frag)) {
      expect(valueAt(fx, fy)).toBeGreaterThan(0.5)
    }
  })

  it('keeps flecks near the blob boundary (fit, not reject)', () => {
    const field = blobField()
    const frag = fieldTextureFragments(field, settings({ amount: 90, seed: 5 }), 3)
    expect(frag).not.toBe('')
    // blob = circle r=7 nodes (=0.35 doc) around node (11.5, 11.5)
    const C = 11.5 * 0.05
    let inOuterRing = 0
    for (const [fx, fy] of fleckPoints(frag)) {
      const d = Math.hypot(fx - C, fy - C)
      if (d > 0.24 && d < 0.36) inOuterRing++
    }
    expect(inOuterRing).toBeGreaterThan(3)
  })

  it('halftone on a blob is regular and deterministic', () => {
    const field = blobField()
    const a = fieldTextureFragments(field, settings({ effect: 'halftone', amount: 70 }), 3)
    const b = fieldTextureFragments(
      field,
      settings({ effect: 'halftone', amount: 70, seed: 99 }),
      3,
    )
    expect(a).toBe(b)
    expect(a).not.toBe('')
  })

  it('halftone distress works on blobs too', () => {
    const field = blobField()
    const args = { effect: 'halftone' as const, amount: 80, angle: 30 }
    const plain = fieldTextureFragments(field, settings(args), 3)
    const distressed = fieldTextureFragments(
      field,
      settings({
        ...args,
        jitter: 50,
        variation: 50,
        wobble: 60,
        merge: 60,
        dropout: 25,
        spray: 50,
        seed: 5,
      }),
      3,
    )
    expect(distressed).toBe(
      fieldTextureFragments(
        field,
        settings({
          ...args,
          jitter: 50,
          variation: 50,
          wobble: 60,
          merge: 60,
          dropout: 25,
          spray: 50,
          seed: 5,
        }),
        3,
      ),
    )
    expect(distressed).not.toBe(plain)
    const n = (s: string) => s.split('M').length - 1
    expect(n(distressed)).toBeGreaterThan(0)
    expect(fieldTextureFragments(field, settings({ ...args, dropout: 100 }), 3)).toBe('')
  })

  it('keeps big blobs under the fleck budget without fading out', () => {
    const fw = 85
    const fh = 73
    const f = new Float32Array(fw * fh).fill(1)
    const field = { f, fw, fh, scale: 1 / 6 }
    for (const effect of ['grain', 'halftone'] as const) {
      const frag = fieldTextureFragments(field, settings({ effect, amount: 60, seed: 2 }), 4)
      expect(frag).not.toBe('')
      const n = frag.split('M').length - 1
      expect(n).toBeLessThanOrEqual(20000)
      expect(n).toBeGreaterThan(500)
    }
  })
})

describe('texture in geometry', () => {
  function docWithTexture(effect: 'none' | 'grain' | 'grunge' | 'halftone') {
    const doc = defaultDoc()
    doc.cols = 4
    doc.rows = 4
    doc.cells = new Uint16Array(16)
    doc.cells[5] = 1
    doc.texture = { effect, ...DEFAULTS, seed: 1 }
    return doc
  }

  it('none leaves geometry unchanged; grain adds hole subpaths', () => {
    const plain = buildGeometry(docWithTexture('none')).paths[0].d
    const grained = buildGeometry(docWithTexture('grain')).paths[0].d
    expect(grained.startsWith(plain)).toBe(true)
    expect(grained.length).toBeGreaterThan(plain.length)
  })

  it('exports stay pure vector: no filters, holes ride the existing evenodd path', () => {
    const svg = buildSvg(docWithTexture('grain'), { includeBg: false })
    expect(svg).not.toContain('<defs>')
    expect(svg).not.toContain('filter')
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('survives a project save/load roundtrip and migrates legacy size', () => {
    const doc = docWithTexture('halftone')
    doc.texture = {
      effect: 'grunge',
      amount: 66,
      scale: 1.4,
      sizeMin: 0.15,
      sizeMax: 0.5,
      shape: 'chip',
      edge: 40,
      dist: 'clumps',
      gap: 0.2,
      gapMode: 'figure',
      even: true,
      angle: 90,
      seed: 12,
      jitter: 25,
      variation: 30,
      wobble: 45,
      merge: 50,
      dropout: 15,
      spray: 20,
      ramp: 35,
    }
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.texture).toEqual(doc.texture)
    // legacy `size` migrates to the min/max range
    const migrated = deserialize({ texture: { effect: 'grain', size: 1.4 } })
    expect(migrated.texture.sizeMin).toBeCloseTo(0.252, 3)
    expect(migrated.texture.sizeMax).toBeCloseTo(0.49, 3)
    // garbage values are clamped/validated like every other deserialized field
    const fallback = deserialize({ texture: { effect: 'sparkle', amount: 1e9, scale: -5 } })
    expect(fallback.texture).toEqual({
      effect: 'none',
      amount: 100,
      scale: 0.1,
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
    })
  })

  it('textures outline silhouettes (corner-guarded, continuous)', () => {
    const doc = docWithTexture('none')
    doc.renderMode = 'outline'
    doc.cols = 6
    doc.rows = 6
    doc.cells = new Uint16Array(36)
    doc.cells[2 * 6 + 2] = 1
    doc.cells[2 * 6 + 3] = 1
    doc.cells[3 * 6 + 2] = 1
    doc.cells[3 * 6 + 3] = 1
    const plain = buildGeometry(doc).paths[0].d
    doc.texture = { effect: 'grain', ...DEFAULTS, amount: 100, seed: 1 }
    const grained = buildGeometry(doc).paths[0].d
    expect(grained.startsWith(plain)).toBe(true)
    expect(grained.length).toBeGreaterThan(plain.length)
  })

  it('figure gap textures multi-color figures in pixels and outline modes', () => {
    for (const renderMode of ['pixels', 'outline'] as const) {
      const doc = docWithTexture('none')
      doc.renderMode = renderMode
      doc.cols = 4
      doc.rows = 4
      // 2×2 figure: color 1 left column, color 2 right column
      doc.cells = new Uint16Array(16)
      doc.cells[1 * 4 + 1] = 1
      doc.cells[2 * 4 + 1] = 1
      doc.cells[1 * 4 + 2] = 2
      doc.cells[2 * 4 + 2] = 2
      const plain = buildGeometry(doc).paths.map((p) => p.d.length)
      doc.texture = {
        effect: 'grain',
        ...DEFAULTS,
        amount: 100,
        gap: 0.3,
        gapMode: 'figure',
        seed: 3,
      }
      const fig = buildGeometry(doc)
      expect(fig.paths.length).toBe(2)
      for (const [k, p] of fig.paths.entries()) expect(p.d.length).toBeGreaterThan(plain[k])
    }
  })

  it('textures metaball blobs via the field', () => {
    const doc = docWithTexture('none')
    doc.renderMode = 'metaball'
    doc.metaball = { strength: 60, perColor: true, quality: 6, squareEdges: false }
    doc.cols = 8
    doc.rows = 8
    doc.cells = new Uint16Array(64)
    for (let y = 2; y < 6; y++) {
      for (let x = 2; x < 6; x++) doc.cells[y * 8 + x] = 1
    }
    const plain = buildGeometry(doc).paths[0].d
    doc.texture = { effect: 'grain', ...DEFAULTS, amount: 100, seed: 1 }
    const grained = buildGeometry(doc).paths[0].d
    expect(grained.startsWith(plain)).toBe(true)
    expect(grained.length).toBeGreaterThan(plain.length)
  })
})

const RECT_X = 3.06
const RECT_Y = 2.06
const RECT_W = 0.88
const RECT_H = 0.88
