/**
 * Demo «Треугольные пики» — a 128×88 low-poly sunset on a triangle grid: every triangle takes one
 * flat color sampled at its center, so a four-stop sky dithers into smooth bands and three noise
 * ridges stack into a mountain range. Shows the triangular lattice over a classic landscape.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER8 } from '../dither/matrices.ts'
import { makeGrid as makeLattice } from '../grids/index.ts'
import type { Grid } from '../grids/index.ts'
import {
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  noise1D,
  paint,
  paintIdx,
  sceneHead,
  screenValue,
  type InkGrid,
} from './kit.ts'

export const PEAKS_COLS = 128
export const PEAKS_ROWS = 88

const PALETTE = [
  '#1b1f3b',
  '#3d2b56',
  '#8f3e63',
  '#e05263',
  '#ffb45e',
  '#fff3c4',
  '#ffd670',
  '#b56576',
  '#6d597a',
  '#355070',
  '#d9a5b3',
  '#9a8c98',
  '#6c7ea7',
  '#ffe8cc',
] as const
const V = {
  pine: 1,
  skyTop: 2,
  skyMid: 3,
  skyLow: 4,
  horizon: 5,
  sunCore: 6,
  sunRim: 7,
  ridgeFar: 8,
  ridgeMid: 9,
  ridgeNear: 10,
  rimFar: 11,
  rimMid: 12,
  rimNear: 13,
  star: 14,
}

const SKY_BANDS = [V.skyTop, V.skyMid, V.skyLow, V.horizon] as const
const SUN = { x: 26, y: 42, r: 5.5 }

/** Ridge silhouette heights: noise-drunk polylines, one per depth layer. */
function ridgeY(x: number, k: number): number {
  const base = [46, 54, 64]
  const freq = [0.14, 0.1, 0.07]
  const amp = [8, 10, 12]
  return base[k] + (noise1D(x * freq[k], 40 + k * 7) - 0.5) * amp[k]
}

/** Four-stop sunset sky with a handful of early stars. */
function paintSky(g: InkGrid, grid: Grid): void {
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const t = Math.min(0.999, Math.max(0, p.y / ridgeY(p.x, 0))) * 3
    const band = Math.floor(t)
    const frac = t - band
    const dither = screenValue(BAYER8, i % PEAKS_COLS, Math.floor(i / PEAKS_COLS))
    paintIdx(g, i, dither < 1 - frac ? SKY_BANDS[band] : SKY_BANDS[Math.min(3, band + 1)])
    if (p.y < 16 && hash01(i % PEAKS_COLS, Math.floor(i / PEAKS_COLS)) < 0.05)
      paintIdx(g, i, V.star)
  }
}

/** The sun sinking to the ridgeline, core and dithered rim. */
function paintSun(g: InkGrid, grid: Grid): void {
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const d = Math.hypot(p.x - SUN.x, p.y - SUN.y)
    if (d < SUN.r) paintIdx(g, i, V.sunCore)
    else if (
      d < SUN.r + 2 &&
      screenValue(BAYER8, i % PEAKS_COLS, Math.floor(i / PEAKS_COLS)) < 0.55
    )
      paintIdx(g, i, V.sunRim)
  }
}

/** Three overlapping ridges with lit top edges, then a row of pines on the near one. */
function paintRidges(g: InkGrid, grid: Grid): void {
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const facet = screenValue(BAYER8, i % PEAKS_COLS, Math.floor(i / PEAKS_COLS)) < 0.3
    for (let k = 2; k >= 0; k--) {
      const yTh = ridgeY(p.x, k)
      if (p.y <= yTh) continue
      const rim = [V.rimFar, V.rimMid, V.rimNear]
      const fill = [V.ridgeFar, V.ridgeMid, V.ridgeNear]
      paintIdx(g, i, p.y < yTh + 1.4 ? rim[k] : facet ? rim[k] : fill[k])
      break
    }
  }
  for (let j = 0; j < 7; j++) {
    const px = 5 + j * 9.4 + hash01(j, 5) * 4
    const h = 7 + Math.floor(hash01(j, 9) * 4)
    for (let r = 0; r < h; r++) {
      const half = Math.max(0.6, (r / h) * 2.4)
      for (let x = Math.round(px - half); x <= Math.round(px + half); x++) {
        paint(g, x, Math.round(73 - h + r), V.pine)
      }
    }
  }
}

/** The low-poly sunset as a fresh v3 scene document; deterministic down to the last cell. */
export function tripeaksProjectJSON(): ProjectJSON {
  const grid = makeLattice('triangle', PEAKS_COLS, PEAKS_ROWS)
  const sky = makeGrid(PEAKS_COLS, PEAKS_ROWS)
  const sun = makeGrid(PEAKS_COLS, PEAKS_ROWS)
  const ridges = makeGrid(PEAKS_COLS, PEAKS_ROWS)
  paintSky(sky, grid)
  paintSun(sun, grid)
  paintRidges(ridges, grid)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(PEAKS_COLS, PEAKS_ROWS, PALETTE),
    gridType: 'triangle',
    layers: [
      makeLayer(nextId(), 'Закат', [
        makeObj(nextId(), 'Небо', sky),
        makeObj(nextId(), 'Солнце', sun),
        makeObj(nextId(), 'Горы и ели', ridges),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
