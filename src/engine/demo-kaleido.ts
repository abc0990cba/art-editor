/**
 * Demo «Калейдо-цвет» — a 128×128 kaleidoscope bloom: twelve mirrored sectors wound into a spiral
 * by a radius-proportional twist, colored in six neon bands through a Bayer screen. Shows high-fold
 * rotational symmetry with a twist — the wilder sibling of the classic mandala.
 */

import { makeGrid, makeLayer, makeObj, paint, sceneHead, screenValue } from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import type { ProjectJSON } from './project.ts'

export const KALEIDO_COLS = 128
export const KALEIDO_ROWS = 128

const PALETTE = [
  '#120726',
  '#f472b6',
  '#c084fc',
  '#818cf8',
  '#22d3ee',
  '#34d399',
  '#fde047',
  '#fff7ed',
] as const
const V = { bg: 1, pink: 2, violet: 3, indigo: 4, cyan: 5, mint: 6, gold: 7, cream: 8 }

const BANDS = [V.pink, V.violet, V.indigo, V.cyan, V.mint, V.gold] as const
const FOLDS = 12
const TWIST = 2.4 // radians of swirl across the full radius — the kaleidoscope's signature

/**
 * The bloom as a fresh v3 scene document; deterministic down to the last cell. The deep ground
 * stays unpainted — it lives in the document background.
 */
export function kaleidoProjectJSON(): ProjectJSON {
  const g = makeGrid(KALEIDO_COLS, KALEIDO_ROWS)
  const c = (KALEIDO_COLS - 1) / 2
  const maxR = KALEIDO_COLS / 2
  for (let y = 0; y < KALEIDO_ROWS; y++) {
    for (let x = 0; x < KALEIDO_COLS; x++) {
      const dx = x - c
      const dy = y - c
      const r = Math.hypot(dx, dy) / maxR
      if (r > 0.97) continue
      if (r < 0.07) {
        paint(g, x, y, V.cream)
        continue
      }
      // wind the angle by radius, then fold it into one mirrored sector of twelve
      const a = Math.atan2(dy, dx) + r * TWIST
      const t = (((a / (Math.PI / FOLDS)) % FOLDS) + FOLDS) % FOLDS
      const s = Math.min(t, FOLDS - t) / (FOLDS / 2) // 0 at petal edges, 1 at the sector heart
      const petal = Math.sin(s * Math.PI)
      const bandF = r * 10 - petal * 2.4 + Math.sin(r * 36 + s * 4.2) * 0.24
      const band = Math.floor(bandF)
      if (band < 0) {
        paint(g, x, y, V.gold)
        continue
      }
      const frac = bandF - band
      const cur = BANDS[band % BANDS.length]
      const next = BANDS[(band + 1) % BANDS.length]
      paint(g, x, y, screenValue(BAYER8, x, y) < 1 - frac ? cur : next)
    }
  }
  // thin gold halo keeps the bloom crisp against the night ground
  for (let y = 0; y < KALEIDO_ROWS; y++) {
    for (let x = 0; x < KALEIDO_COLS; x++) {
      const r = Math.hypot(x - c, y - c) / maxR
      if (r > 0.955 && r <= 0.97) paint(g, x, y, V.gold)
    }
  }

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(KALEIDO_COLS, KALEIDO_ROWS, PALETTE),
    bg: '#120726',
    layers: [makeLayer(nextId(), 'Калейдоскоп', [makeObj(nextId(), 'Цветение', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
