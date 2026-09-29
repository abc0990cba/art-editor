/**
 * Demo «Спиральная галактика» — a spiral galaxy on a radial grid (128 sectors × 64 rings, graded so
 * cells stay square across rings). Shows the polar lattice with `radialEven`: rings of flat polar
 * cells build a glowing core, two logarithmic arms and a scattered star field.
 */

import {
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  paintIdx,
  sceneHead,
  screenValue,
} from './demo-kit.ts'
import type { InkGrid } from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import { makeGrid as makeLattice } from './grids.ts'
import type { Grid } from './grids.ts'
import type { ProjectJSON } from './project.ts'

export const GALAXY_SECTORS = 128
export const GALAXY_RINGS = 64

const PALETTE = [
  '#060a18',
  '#1e1b4b',
  '#312e81',
  '#818cf8',
  '#c4b5fd',
  '#e0e7ff',
  '#fcd34d',
  '#f59e0b',
  '#fff7ed',
  '#f0abfc',
] as const
const V = {
  bg: 1,
  disc: 2,
  discLit: 3,
  arm: 4,
  armLit: 5,
  star: 6,
  bulge: 7,
  bulgeLit: 8,
  core: 9,
  nebula: 10,
}

const RINGS = 2.6 // twist of the logarithmic arms: radians of wind per unit of ln(radius)

/** Angular distance from the k-th spiral arm at radius r, normalized to a 0..1 gaussian-ish fall. */
function armGlow(a: number, r: number, k: number): number {
  const s =
    (((a - k * Math.PI - Math.log(0.06 + r) * RINGS) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const d = Math.min(s, Math.PI * 2 - s)
  return Math.exp(-((d / 0.62) ** 2))
}

/** Paints the whole galaxy: core, bulge, dust disc, two arms, star knots and pink nebulae. */
function paintGalaxy(g: InkGrid, grid: Grid): void {
  const cx = grid.w / 2
  const cy = grid.h / 2
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const r = Math.hypot(p.x - cx, p.y - cy) / (grid.h / 2 - 1)
    if (r > 0.99) continue
    const a = Math.atan2(p.y - cy, p.x - cx)
    const dither = screenValue(BAYER8, i % GALAXY_SECTORS, Math.floor(i / GALAXY_SECTORS))
    const arm = Math.max(armGlow(a, r, 0), armGlow(a, r, 1))
    let v: number
    if (r < 0.13 + dither * 0.04) v = V.core
    else if (r < 0.32) v = dither < (0.32 - r) * 5 ? V.bulgeLit : V.bulge
    else if (arm > 0.24 + dither * 0.2) v = arm > 0.62 ? V.armLit : V.arm
    else v = dither < 0.45 + r * 0.3 ? V.discLit : V.disc
    paintIdx(g, i, v)
    // sprinkle stars over the arms and rare pink nurseries over the dust
    if (hash01(i, 17) < 0.045 + arm * 0.08) paintIdx(g, i, V.star)
    else if (hash01(i, 29) < 0.012) paintIdx(g, i, V.nebula)
  }
}

/** The galaxy as a fresh v3 scene document; deterministic down to the last cell. */
export function galaxyProjectJSON(): ProjectJSON {
  const grid = makeLattice('radial', GALAXY_SECTORS, GALAXY_RINGS, true)
  const g = makeGrid(GALAXY_SECTORS, GALAXY_RINGS)
  paintGalaxy(g, grid)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(GALAXY_SECTORS, GALAXY_RINGS, PALETTE),
    gridType: 'radial',
    radialEven: true,
    bg: '#060a18',
    layers: [makeLayer(nextId(), 'Галактика', [makeObj(nextId(), 'Млечный путь', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
