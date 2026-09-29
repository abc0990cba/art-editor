/**
 * Demo «Сюзане» — a 128×128 seamless ornamental tile in the spirit of Central Asian suzani
 * embroidery: a large eight-petal rosette, corner fans, a wavy vine border and a dotted trellis,
 * all on a cream ground. Shows decorative repeat pattern work and multi-tone ornament dithering.
 */

import { hash01, makeGrid, makeLayer, makeObj, paint, sceneHead, screenValue } from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import type { ProjectJSON } from './project.ts'

export const SUZANI_COLS = 128
export const SUZANI_ROWS = 128

const PALETTE = ['#f2e8d5', '#b23a48', '#dfa43a', '#2f4271', '#c96f4a', '#4a2545'] as const
const V = { ground: 1, red: 2, gold: 3, indigo: 4, terracotta: 5, plum: 6 }

const N = SUZANI_COLS
const CENTER = (N - 1) / 2

/** Distance from the nearest of the four corners — for the corner fan rosettes. */
function cornerDist(x: number, y: number): number {
  const dx = Math.min(x, N - 1 - x)
  const dy = Math.min(y, N - 1 - y)
  return Math.hypot(dx, dy)
}

/** The big central rosette: indigo rim, eight red petals with gold tips, plum core. */
function paintRosette(g: ReturnType<typeof makeGrid>): void {
  for (let y = 0; y < SUZANI_ROWS; y++) {
    for (let x = 0; x < SUZANI_COLS; x++) {
      const dx = x - CENTER
      const dy = y - CENTER
      const r = Math.hypot(dx, dy)
      if (r > 32 || r < 5) continue
      const t = (((Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
      const s = Math.min(t, 8 - t) / 4 // 0 at petal edges, 1 at the petal heart
      const petalEdge = 0.3 + ((r - 5) / 27) * 0.5
      if (r > 27) paint(g, x, y, screenValue(BAYER8, x, y) < 0.2 ? V.gold : V.indigo)
      else if (r > 22 && s > petalEdge) paint(g, x, y, V.gold)
      else if (s > petalEdge - 0.34) paint(g, x, y, V.red)
      else if (r > 9) paint(g, x, y, V.terracotta)
      else paint(g, x, y, V.plum)
    }
  }
  paint(g, Math.round(CENTER), Math.round(CENTER), V.gold)
}

/** Quarter fans anchored in the four corners, alternating indigo and terracotta rings. */
function paintCorners(g: ReturnType<typeof makeGrid>): void {
  for (let y = 0; y < SUZANI_ROWS; y++) {
    for (let x = 0; x < SUZANI_COLS; x++) {
      const r = cornerDist(x, y)
      if (r > 14) continue
      const ring = Math.floor(r)
      if (ring % 2 === 0) paint(g, x, y, r < 4 ? V.red : V.indigo)
      else if (screenValue(BAYER8, x, y) < 0.35) paint(g, x, y, V.gold)
      else paint(g, x, y, V.terracotta)
    }
  }
}

/** Wavy vine stems with gold leaf pairs and red berries running along all four edges. */
function paintVines(g: ReturnType<typeof makeGrid>): void {
  for (let x = 0; x < SUZANI_COLS; x++) {
    const stem = 11 + Math.sin(x * 0.24) * 3
    for (let dy = -1; dy <= 1; dy++) paint(g, x, Math.round(stem) + dy, V.indigo)
    const bottom = SUZANI_ROWS - 12 + Math.sin(x * 0.24 + 2) * 3
    for (let dy = -1; dy <= 1; dy++) paint(g, x, Math.round(bottom) + dy, V.indigo)
    if (x % 7 === 3) {
      paint(g, x, Math.round(stem) - 3, V.gold)
      paint(g, x, Math.round(stem) + 3, V.gold)
      paint(g, x, Math.round(bottom) - 3, V.gold)
      paint(g, x, Math.round(bottom) + 3, V.gold)
    }
    if (x % 11 === 6) {
      paint(g, x, Math.round(stem) - 5, V.red)
      paint(g, x, Math.round(bottom) + 5, V.red)
    }
  }
  for (let y = 0; y < SUZANI_ROWS; y++) {
    const stem = 11 + Math.sin(y * 0.24 + 1) * 3
    for (let dx = -1; dx <= 1; dx++) paint(g, Math.round(stem) + dx, y, V.indigo)
    const right = SUZANI_COLS - 12 + Math.sin(y * 0.24 + 3) * 3
    for (let dx = -1; dx <= 1; dx++) paint(g, Math.round(right) + dx, y, V.indigo)
  }
}

/** A sparse gold trellis of diagonal dotted lines filling the ground between the motifs. */
function paintTrellis(g: ReturnType<typeof makeGrid>): void {
  for (let y = 16; y < SUZANI_ROWS - 16; y++) {
    for (let x = 16; x < SUZANI_COLS - 16; x++) {
      if (Math.hypot(x - CENTER, y - CENTER) < 36) continue
      if (cornerDist(x, y) < 18) continue
      const on = (x + y) % 14 === 0 || (x - y + SUZANI_COLS) % 14 === 0
      if (on && hash01(x, y) < 0.72)
        paint(g, x, y, screenValue(BAYER8, x, y) < 0.85 ? V.gold : V.red)
    }
  }
}

/** The suzani tile as a fresh v3 scene document; deterministic down to the last cell. */
export function wallpaperProjectJSON(): ProjectJSON {
  const g = makeGrid(SUZANI_COLS, SUZANI_ROWS)
  paintRosette(g)
  paintCorners(g)
  paintVines(g)
  paintTrellis(g)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(SUZANI_COLS, SUZANI_ROWS, PALETTE),
    bg: '#f2e8d5',
    layers: [makeLayer(nextId(), 'Сюзане', [makeObj(nextId(), 'Узор', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
