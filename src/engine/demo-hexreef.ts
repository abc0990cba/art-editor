/**
 * Demo «Гекс-риф» — a 96×80 hex-grid mosaic: a top-view turtle cruising over dithered tropical
 * water with coral clusters in the corners. Shows the hexagonal lattice: every hex cell is flat
 * filled from its center, so the mosaic keeps the honeycomb seams.
 */

import {
  makeGrid,
  makeLayer,
  makeObj,
  paintIdx,
  sceneHead,
  screenValue,
  hash01,
} from './demo-kit.ts'
import type { InkGrid } from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import { makeGrid as makeLattice } from './grids.ts'
import type { Grid } from './grids.ts'
import type { ProjectJSON } from './project.ts'

export const REEF_COLS = 96
export const REEF_ROWS = 80

const PALETTE = [
  '#0b4f6c',
  '#0e7490',
  '#67e8f9',
  '#f59e0b',
  '#d97706',
  '#b45309',
  '#fde68a',
  '#ec4899',
  '#fb7185',
  '#7c2d12',
] as const
const V = {
  deep: 1,
  mid: 2,
  aqua: 3,
  amber: 4,
  darkAmber: 5,
  brown: 6,
  cream: 7,
  pink: 8,
  coral: 9,
  espresso: 10,
}

const SHELL = { x: 0, y: -2, rx: 30, ry: 21 }

/** Point-in-rotated-ellipse: `rot` turns the ellipse's long axis from horizontal. */
function inEllipse(dx: number, dy: number, rx: number, ry: number, rot = 0): boolean {
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const u = cos * dx + sin * dy
  const v = -sin * dx + cos * dy
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1
}

/** Depth-graded teal water with a few deterministic caustic glints. */
function paintWater(g: InkGrid, grid: Grid): void {
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const t = p.y / grid.h
    const dither = screenValue(BAYER8, i % REEF_COLS, Math.floor(i / REEF_COLS))
    paintIdx(g, i, dither < t * 0.85 ? V.deep : V.mid)
    if (hash01(i, 9) < 0.015) paintIdx(g, i, V.aqua)
  }
}

/** Shell dome with six-fold scute seams, cream rim, head, four flippers and a tail. */
function paintTurtle(g: InkGrid, grid: Grid): void {
  const cx = grid.w / 2 + SHELL.x
  const cy = grid.h / 2 + SHELL.y
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const dx = p.x - cx
    const dy = p.y - cy
    const rr = Math.hypot(dx / SHELL.rx, dy / SHELL.ry)
    if (rr <= 1) {
      const t = (((Math.atan2(dy, dx) / (Math.PI / 3)) % 6) + 6) % 6
      const s = Math.min(t, 6 - t)
      const band = rr * 3.4
      let color: number
      if (rr < 0.3) color = V.amber
      else if (band % 1 < 0.14 || s < 0.2) color = V.cream
      else color = Math.floor(band) % 2 ? V.brown : V.darkAmber
      paintIdx(g, i, color)
    } else if (rr <= 1.14) {
      paintIdx(g, i, V.cream)
    }
  }
  // head with two eyes, looking up the reef
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    if (inEllipse(p.x - cx, p.y - cy + 33, 7, 9.5)) paintIdx(g, i, V.amber)
    if (inEllipse(p.x - cx - 3, p.y - cy + 35, 1.4, 1.4)) paintIdx(g, i, V.espresso)
    if (inEllipse(p.x - cx + 3, p.y - cy + 35, 1.4, 1.4)) paintIdx(g, i, V.espresso)
  }
  // four flippers on the diagonals, the front pair (toward the head) stretched a little longer
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const fx = cx + Math.cos(a) * 27
    const fy = cy + Math.sin(a) * 21
    const len = k >= 2 ? 17 : 14
    for (let i = 0; i < grid.count; i++) {
      const p = grid.center(i)
      if (inEllipse(p.x - fx, p.y - fy, len, 7.5, a)) paintIdx(g, i, V.darkAmber)
    }
  }
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    if (inEllipse(p.x - cx, p.y - cy - 31, 3.5, 4.5, Math.PI / 2)) paintIdx(g, i, V.darkAmber)
  }
}

/** Pink and coral fan-corals anchored in the two bottom corners. */
function paintCoral(g: InkGrid, grid: Grid): void {
  const fans = [
    { x: grid.w * 0.1, y: grid.h - 12, c: V.pink },
    { x: grid.w * 0.16, y: grid.h - 6, c: V.coral },
    { x: grid.w * 0.9, y: grid.h - 10, c: V.coral },
    { x: grid.w * 0.84, y: grid.h - 5, c: V.pink },
  ]
  for (const fan of fans) {
    for (let i = 0; i < grid.count; i++) {
      const p = grid.center(i)
      if (inEllipse(p.x - fan.x, p.y - fan.y, 5.5, 4.5)) paintIdx(g, i, fan.c)
      if (inEllipse(p.x - fan.x, p.y - fan.y - 7, 3, 3)) paintIdx(g, i, fan.c)
    }
  }
  // a few bubbles drifting up from the reefs
  for (let k = 0; k < 14; k++) {
    const x = hash01(k, 41) < 0.5 ? 8 + hash01(k, 43) * 22 : grid.w - 30 + hash01(k, 43) * 22
    const y = grid.h - 30 - hash01(k, 47) * 60
    for (let i = 0; i < grid.count; i++) {
      const p = grid.center(i)
      if (inEllipse(p.x - x, p.y - y, 1.6, 1.6)) paintIdx(g, i, V.aqua)
    }
  }
}

/** The hex mosaic as a fresh v3 scene document; deterministic down to the last cell. */
export function hexreefProjectJSON(): ProjectJSON {
  const grid = makeLattice('hex', REEF_COLS, REEF_ROWS)
  const water = makeGrid(REEF_COLS, REEF_ROWS)
  const turtle = makeGrid(REEF_COLS, REEF_ROWS)
  const coral = makeGrid(REEF_COLS, REEF_ROWS)
  paintWater(water, grid)
  paintTurtle(turtle, grid)
  paintCoral(coral, grid)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(REEF_COLS, REEF_ROWS, PALETTE),
    gridType: 'hex',
    bg: '#0b4f6c',
    layers: [
      makeLayer(nextId(), 'Риф', [
        makeObj(nextId(), 'Вода', water),
        makeObj(nextId(), 'Черепаха', turtle),
        makeObj(nextId(), 'Кораллы', coral),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
