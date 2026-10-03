/**
 * Demo «Пейзаж» — a 512×256 halftone mountain landscape: three noise-drawn ridges over a dithered
 * sunset sky with a sun and sparse stars. Shows the editor at poster scale with a big grid.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER4, BAYER8 } from '../dither/matrices.ts'
import {
  fillRect,
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  paint,
  sceneHead,
  screenValue,
  noise1D,
} from './kit.ts'

export const LANDSCAPE_COLS = 512
export const LANDSCAPE_ROWS = 256

const PALETTE = [
  '#312e81', // sky — top
  '#f0abfc', // sky — horizon
  '#ffe066', // sun core
  '#ff9e7d', // sun rim
  '#7c5cb0', // back ridge
  '#4b3a8f', // mid ridge
  '#2a2461', // front ridge
  '#141230', // plain
  '#ffffff', // stars
] as const

const V = {
  skyLo: 1,
  skyHi: 2,
  sunCore: 3,
  sunEdge: 4,
  back: 5,
  mid: 6,
  front: 7,
  plain: 8,
  star: 9,
}

const RIDGES: readonly { base: number; amp: number; scale: number; v: number }[] = [
  { base: 118, amp: 26, scale: 0.012, v: V.back },
  { base: 150, amp: 38, scale: 0.008, v: V.mid },
  { base: 196, amp: 46, scale: 0.006, v: V.front },
]

const ridgeY = (x: number, ridge: { base: number; amp: number; scale: number }): number =>
  ridge.base + (noise1D(x * ridge.scale, 11 + ridge.base) - 0.5) * 2 * ridge.amp

function sky(g: ReturnType<typeof makeGrid>): void {
  for (let y = 0; y < LANDSCAPE_ROWS; y++) {
    for (let x = 0; x < LANDSCAPE_COLS; x++) {
      paint(g, x, y, y / (LANDSCAPE_ROWS * 0.62) < screenValue(BAYER8, x, y) ? V.skyLo : V.skyHi)
    }
  }
  // sparse stars in the darker top third
  for (let y = 0; y < 70; y++) {
    for (let x = 0; x < LANDSCAPE_COLS; x++) {
      if (hash01(x, y) > 0.9993) paint(g, x, y, V.star)
    }
  }
}

function sun(g: ReturnType<typeof makeGrid>): void {
  const cx = 366
  const cy = 128
  const R = 30
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > R) continue
      paint(g, x, y, d / R < screenValue(BAYER4, x, y) ? V.sunCore : V.sunEdge)
    }
  }
}

function ridges(g: ReturnType<typeof makeGrid>): void {
  // paint back-to-front; each ridge dithers 2 cells into the one behind it
  for (const [i, ridge] of RIDGES.entries()) {
    for (let x = 0; x < LANDSCAPE_COLS; x++) {
      const top = ridgeY(x, ridge)
      const blend = 2 * (noise1D(x * 0.09, 40 + i) - 0.5)
      for (let y = Math.floor(top + blend); y < LANDSCAPE_ROWS; y++) paint(g, x, y, ridge.v)
    }
  }
  fillRect(g, { x: 0, y: LANDSCAPE_ROWS - 34, w: LANDSCAPE_COLS, h: 34 }, V.plain)
}

/** The landscape as a fresh v3 scene document; deterministic down to the last cell. */
export function landscapeProjectJSON(): ProjectJSON {
  const skyGrid = makeGrid(LANDSCAPE_COLS, LANDSCAPE_ROWS)
  const sunGrid = makeGrid(LANDSCAPE_COLS, LANDSCAPE_ROWS)
  const landGrid = makeGrid(LANDSCAPE_COLS, LANDSCAPE_ROWS)
  sky(skyGrid)
  sun(sunGrid)
  ridges(landGrid)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(LANDSCAPE_COLS, LANDSCAPE_ROWS, PALETTE),
    layers: [
      makeLayer(nextId(), 'Небо', [makeObj(nextId(), 'Градиент', skyGrid)]),
      makeLayer(nextId(), 'Солнце', [makeObj(nextId(), 'Диск', sunGrid)]),
      makeLayer(nextId(), 'Горы', [makeObj(nextId(), 'Хребты', landGrid)]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
