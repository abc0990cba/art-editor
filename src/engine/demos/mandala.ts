/**
 * Demo «Мандала» — a 128×128 polar mandala: eight-fold mirrored petal bands, ring indices picked
 * through a Bayer screen. Shows large-canvas symmetry and multi-color dithering.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER8 } from '../dither/matrices.ts'
import { makeGrid, makeLayer, makeObj, paint, sceneHead, screenValue } from './kit.ts'

export const MANDALA_COLS = 128
export const MANDALA_ROWS = 128

const PALETTE = ['#160d29', '#818cf8', '#e879f9', '#fbbf24', '#f0abfc'] as const
const V = { bg: 1, indigo: 2, fuchsia: 3, amber: 4, pink: 5 }

const RING: readonly number[] = [V.amber, V.fuchsia, V.indigo, V.pink, V.fuchsia, V.indigo]

/** The mandala as a fresh v3 scene document; deterministic down to the last cell. */
export function mandalaProjectJSON(): ProjectJSON {
  const g = makeGrid(MANDALA_COLS, MANDALA_ROWS)
  const c = (MANDALA_COLS - 1) / 2
  const maxR = MANDALA_COLS / 2
  for (let y = 0; y < MANDALA_ROWS; y++) {
    for (let x = 0; x < MANDALA_COLS; x++) {
      const dx = x - c
      const dy = y - c
      const r = Math.hypot(dx, dy) / maxR
      if (r > 1) {
        paint(g, x, y, V.bg)
        continue
      }
      // fold the angle into one mirrored sector: strict eight-fold symmetry
      let a = Math.atan2(dy, dx) / (Math.PI / 4)
      a = ((a % 8) + 8) % 8
      a = Math.min(a, 8 - a)
      const wave = Math.sin(a * Math.PI * 2.2 + r * 21) * (0.35 + 0.3 * r)
      const ringF = r * 6.2 + wave
      const ring = Math.floor(ringF)
      const frac = ringF - ring
      let color = V.bg
      if (ring >= 0 && ring < RING.length) {
        const next = ring + 1 < RING.length ? RING[ring + 1] : V.bg
        color = screenValue(BAYER8, x, y) < 1 - frac ? RING[ring] : next
      }
      paint(g, x, y, color)
    }
  }
  // thin ring border + center dot keep the medallion crisp at any zoom
  for (let y = 0; y < MANDALA_ROWS; y++) {
    for (let x = 0; x < MANDALA_COLS; x++) {
      const r = Math.hypot(x - c, y - c) / maxR
      if (r > 0.985) paint(g, x, y, V.pink)
    }
  }
  paint(g, c, c, V.amber)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(MANDALA_COLS, MANDALA_ROWS, PALETTE),
    layers: [makeLayer(nextId(), 'Мандала', [makeObj(nextId(), 'Медальон', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
