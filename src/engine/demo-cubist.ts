/**
 * Demo «Кубистский портрет» — a 128×76 faceted portrait on a triangle grid: each triangle takes one
 * flat color from its center, so planes cut the face into bold two-tone halves with diagonal
 * facets, mismatched eyes and a geometric collar. Shows the triangular lattice and a wide
 * seventeen-color palette.
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
import { BAYER4 } from './dither-matrices.ts'
import { makeGrid as makeLattice } from './grids.ts'
import type { Grid } from './grids.ts'
import type { ProjectJSON } from './project.ts'

export const CUBIST_COLS = 128
export const CUBIST_ROWS = 76

const PALETTE = [
  '#2a9d8f',
  '#e9c46a',
  '#ef476f',
  '#457b9d',
  '#ffd166',
  '#f4a261',
  '#8ecae6',
  '#ffb703',
  '#219ebc',
  '#fb8500',
  '#126782',
  '#1d3557',
  '#06d6a0',
  '#073b4c',
  '#e63946',
  '#e76f51',
  '#d8e2dc',
] as const
const V = {
  teal: 1,
  mustard: 2,
  pink: 3,
  blue: 4,
  sun: 5,
  sand: 6,
  faceL: 7,
  faceR: 8,
  facetL: 9,
  facetR: 10,
  facetD: 11,
  hair: 12,
  irisL: 13,
  ink: 14,
  mouth: 15,
  nose: 16,
  cheek: 17,
}

const FACE = { x: 0, y: -2, rx: 16.5, ry: 21.5 }

type Pt2 = readonly [number, number]

/** Signed side of the point against the line through a-b; > 0 = left of it. */
function sideOf(px: number, py: number, a: Pt2, b: Pt2): number {
  return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])
}

/** A flat color for the quadrant ground, dithered across the quadrant seams. */
function paintGround(g: InkGrid, grid: Grid): void {
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const seam = Math.abs(p.x - grid.w / 2) < 1.6 || Math.abs(p.y - 40) < 1.6
    const flip = seam && screenValue(BAYER4, i % CUBIST_COLS, Math.floor(i / CUBIST_COLS)) < 0.5
    const top = p.y < 40 !== flip
    const left = p.x < grid.w / 2 !== flip
    paintIdx(g, i, top ? (left ? V.teal : V.mustard) : left ? V.pink : V.blue)
  }
  // a small geometric sun in the upper right quadrant
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const d = Math.hypot(p.x - (grid.w - 12), p.y - 10)
    if (d < 4.5) paintIdx(g, i, V.sun)
    else if (d < 6) paintIdx(g, i, V.sand)
  }
}

/** The face planes: asymmetric halves, two diagonal facet chords, striped hair. */
function paintFace(g: InkGrid, grid: Grid): void {
  const cx = grid.w / 2
  const cy = 34 + FACE.y
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const dx = p.x - cx
    const dy = p.y - cy
    if ((Math.abs(dx) / FACE.rx) ** 2.4 + (Math.abs(dy) / FACE.ry) ** 2.4 > 1) continue
    const leftHalf = dx < 0
    let v = leftHalf ? V.faceL : V.faceR
    if (sideOf(p.x, p.y, [cx - 12, cy - 16], [cx + 13, cy + 15]) > 0)
      v = leftHalf ? V.facetL : V.facetR
    if (sideOf(p.x, p.y, [cx - 21, cy + 8], [cx + 20, cy - 12]) > 0) v = V.facetD
    if (dy < -13) v = (dx + dy) % 7 < 3.5 ? V.hair : V.ink
    paintIdx(g, i, v)
  }
}

/** Mismatched ring eyes, a wedge nose, a bar mouth and two dithered cheek dots. */
function paintFeatures(g: InkGrid, grid: Grid): void {
  const cx = grid.w / 2
  const cy = 34 + FACE.y
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const dx = p.x - cx
    const dy = p.y - cy
    const dL = Math.hypot(dx + 7.5, dy + 3)
    const dR = Math.hypot(dx - 7.5, dy - 2)
    if (dL < 1.8 || dR < 1.8) paintIdx(g, i, V.ink)
    else if (dL < 4 || dR < 4) paintIdx(g, i, dL < dR ? V.irisL : V.pink)
    if (Math.abs(dx) < 2.6 && dy > 2 && dy < 9) paintIdx(g, i, V.nose)
    if (Math.abs(dx) < 6 && dy > 13.5 && dy < 16) paintIdx(g, i, V.mouth)
    if (
      Math.hypot(dx + 10, dy - 8) < 3 &&
      screenValue(BAYER4, i % CUBIST_COLS, Math.floor(i / CUBIST_COLS)) < 0.6
    )
      paintIdx(g, i, V.cheek)
    if (Math.hypot(dx - 10, dy - 7) < 3 && hash01(i, 13) < 0.6) paintIdx(g, i, V.sun)
  }
}

/** Neck and a pinstriped geometric collar filling the bottom of the canvas. */
function paintCollar(g: InkGrid, grid: Grid): void {
  const cx = grid.w / 2
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    if (p.y < grid.h - 16) continue
    const neck = Math.abs(p.x - cx) < 5 && p.y < grid.h - 12
    const stripe = p.x % 6 < 1.3
    paintIdx(g, i, neck ? V.nose : stripe ? V.hair : V.ink)
  }
}

/** The cubist portrait as a fresh v3 scene document; deterministic down to the last cell. */
export function cubistProjectJSON(): ProjectJSON {
  const grid = makeLattice('triangle', CUBIST_COLS, CUBIST_ROWS)
  const ground = makeGrid(CUBIST_COLS, CUBIST_ROWS)
  const face = makeGrid(CUBIST_COLS, CUBIST_ROWS)
  const features = makeGrid(CUBIST_COLS, CUBIST_ROWS)
  const collar = makeGrid(CUBIST_COLS, CUBIST_ROWS)
  paintGround(ground, grid)
  paintFace(face, grid)
  paintFeatures(features, grid)
  paintCollar(collar, grid)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(CUBIST_COLS, CUBIST_ROWS, PALETTE),
    gridType: 'triangle',
    layers: [
      makeLayer(nextId(), 'Портрет', [
        makeObj(nextId(), 'Фон', ground),
        makeObj(nextId(), 'Воротник', collar),
        makeObj(nextId(), 'Лицо', face),
        makeObj(nextId(), 'Черты', features),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
