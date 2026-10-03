/**
 * Demo «Каскад» — a two-tone constructivist collage on a red ground, white shapes only. A scale
 * cascade of checkerboards (12 → 6 → 3 px cells, then a 1 px halftone crumb) runs across the top, a
 * slab with a square window and a lone disk hold the middle, and a run of 12×12 steps slides to the
 * bottom-right corner. Geometry carries the whole picture — Bauhaus / Swiss poster spirit.
 */

import type { ProjectJSON } from '../core/project.ts'
import {
  fillRect,
  makeGrid,
  makeLayer,
  makeObj,
  paint,
  sceneHead,
  type InkGrid,
  type Rect,
} from './kit.ts'

const COLS = 96
const ROWS = 120

/** Two inks only: white shapes over the red ground — the ground itself is `bg`, not ink. */
const PALETTE = ['#ffffff', '#e2231a'] as const
const V = { white: 1 }

/** Checkerboard of `cell`-sided squares; parity is global, so abutting patches interlock. */
function checker(g: InkGrid, rect: Rect, cell: number): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) paint(g, x, y, V.white)
    }
  }
}

/** 1 px checkerboard — reads as a 50% halftone swatch of the ground showing through. */
function halftone(g: InkGrid, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if ((x + y) % 2 === 0) paint(g, x, y, V.white)
    }
  }
}

/** Solid slab with one square window — four bars around the hole, no ink inside it. */
function windowSlab(g: InkGrid, o: Rect, hole: Rect): void {
  fillRect(g, { x: o.x, y: o.y, w: o.w, h: hole.y - o.y }, V.white)
  fillRect(g, { x: o.x, y: hole.y, w: hole.x - o.x, h: hole.h }, V.white)
  fillRect(g, { x: hole.x + hole.w, y: hole.y, w: o.x + o.w - hole.x - hole.w, h: hole.h }, V.white)
  fillRect(g, { x: o.x, y: hole.y + hole.h, w: o.w, h: o.y + o.h - hole.y - hole.h }, V.white)
}

/** Filled circle of cells. */
function fillDisk(g: InkGrid, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (Math.hypot(x - cx, y - cy) <= r + 0.5) paint(g, x, y, V.white)
    }
  }
}

/** N stair steps of 12×12 blocks descending to the right. */
function stairs(g: InkGrid, x0: number, y0: number, n: number): void {
  for (let k = 0; k < n; k++) {
    fillRect(g, { x: x0 + k * 12, y: y0 + k * 12, w: 12, h: 12 }, V.white)
  }
}

/** The checker cascade as a fresh v3 scene document; deterministic down to the last cell. */
export function cascadeProjectJSON(): ProjectJSON {
  const coarse = makeGrid(COLS, ROWS)
  const middle = makeGrid(COLS, ROWS)
  const fine = makeGrid(COLS, ROWS)
  const crumbs = makeGrid(COLS, ROWS)
  const slab = makeGrid(COLS, ROWS)
  const disk = makeGrid(COLS, ROWS)
  const steps = makeGrid(COLS, ROWS)
  const squares = makeGrid(COLS, ROWS)

  // the scale cascade across the top, coarse → fine, ending in a bare halftone swatch
  checker(coarse, { x: 0, y: 0, w: 48, h: 48 }, 12)
  checker(middle, { x: 48, y: 0, w: 24, h: 24 }, 6)
  checker(fine, { x: 72, y: 0, w: 24, h: 24 }, 3)
  halftone(crumbs, { x: 84, y: 24, w: 12, h: 24 })

  // middle weights: the holed slab on the left, a floating checker and the lone disk right
  checker(middle, { x: 48, y: 48, w: 24, h: 24 }, 6)
  windowSlab(slab, { x: 0, y: 48, w: 36, h: 36 }, { x: 12, y: 60, w: 12, h: 12 })
  fillDisk(disk, 62, 36, 9)
  halftone(crumbs, { x: 36, y: 60, w: 12, h: 12 })

  // the step run to the bottom-right corner, anchored by a corner checker and loose squares
  stairs(steps, 48, 72, 4)
  checker(middle, { x: 0, y: 96, w: 24, h: 24 }, 6)
  fillRect(squares, { x: 84, y: 48, w: 12, h: 24 }, V.white)
  fillRect(squares, { x: 36, y: 96, w: 12, h: 12 }, V.white)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(COLS, ROWS, PALETTE),
    bg: '#e2231a',
    layers: [
      makeLayer(nextId(), 'Каскад', [
        makeObj(nextId(), 'Шахматка · 12', coarse),
        makeObj(nextId(), 'Шахматка · 6', middle),
        makeObj(nextId(), 'Шахматка · 3', fine),
        makeObj(nextId(), 'Крошка', crumbs),
      ]),
      makeLayer(nextId(), 'Плита и диск', [
        makeObj(nextId(), 'Плита', slab),
        makeObj(nextId(), 'Диск', disk),
      ]),
      makeLayer(nextId(), 'Акценты', [
        makeObj(nextId(), 'Ступени', steps),
        makeObj(nextId(), 'Квадраты', squares),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: false,
  }
}
