/**
 * Demo «Лава» — a 96×128 lava lamp: neon blob clusters in four colors rise and fuse into liquid
 * amoebas. Shows the metaball render mode with `perColor` fields — painted discs are just seeds;
 * the gooey shapes come from the metaball field at render time.
 */

import type { ProjectJSON } from '../core/project.ts'
import { hash01, makeGrid, makeLayer, makeObj, paint, sceneHead } from './kit.ts'
import type { InkGrid } from './kit.ts'

export const LAVA_COLS = 96
export const LAVA_ROWS = 128

const PALETTE = ['#150a20', '#ff2d95', '#22d3ee', '#fbbf24', '#a78bfa', '#3b1d54'] as const
const V = { pink: 2, cyan: 3, amber: 4, violet: 5, vessel: 6 }

/** One filled disc — a metaball seed; the lava shape itself appears at render time. */
function blob(g: InkGrid, cx: number, cy: number, r: number, v: number): void {
  const ri = Math.ceil(r)
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy <= r * r) paint(g, Math.round(cx + dx), Math.round(cy + dy), v)
    }
  }
}

/** A rising cluster: big blobs wobbling up a spine plus small satellites ahead of them. */
function cluster(
  g: InkGrid,
  spec: { v: number; count: number; seed: number; cx: number; yTop: number; yBottom: number },
): void {
  const { v, count, seed, cx, yTop, yBottom } = spec
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 0.5 : k / (count - 1)
    const y = yBottom + (yTop - yBottom) * t
    const sway = Math.sin(t * Math.PI * 1.5 + seed) * 9
    blob(g, cx + sway, y, 6 + hash01(k, seed) * 3, v)
    if (k < count - 1)
      blob(
        g,
        cx + Math.sin((t + 0.12) * Math.PI * 1.5 + seed) * 9,
        y - 9 - hash01(k, seed + 3) * 4,
        2.5,
        v,
      )
  }
}

/** The glass vessel: slim side rails, a cap and a base in one pass. */
function paintVessel(g: InkGrid): void {
  for (let y = 0; y < LAVA_ROWS; y++) {
    for (let x = 0; x < LAVA_COLS; x++) {
      if (x < 3 || x >= LAVA_COLS - 3 || y < 5 || y >= LAVA_ROWS - 6) paint(g, x, y, V.vessel)
    }
  }
}

/** The lava lamp as a fresh v3 scene document; deterministic down to the last cell. */
export function lavaProjectJSON(): ProjectJSON {
  const vessel = makeGrid(LAVA_COLS, LAVA_ROWS)
  const lava = makeGrid(LAVA_COLS, LAVA_ROWS)
  paintVessel(vessel)
  cluster(lava, { v: V.pink, count: 4, seed: 2, cx: 30, yTop: 96, yBottom: 118 })
  cluster(lava, { v: V.cyan, count: 4, seed: 9, cx: 58, yTop: 58, yBottom: 84 })
  cluster(lava, { v: V.amber, count: 3, seed: 16, cx: 42, yTop: 22, yBottom: 44 })
  cluster(lava, { v: V.violet, count: 2, seed: 23, cx: 14, yTop: 44, yBottom: 66 })

  let id = 0
  const nextId = () => ++id
  const head = sceneHead(LAVA_COLS, LAVA_ROWS, PALETTE)
  return {
    ...head,
    renderMode: 'metaball',
    metaball: { ...head.metaball, strength: 58, perColor: true },
    bg: '#150a20',
    layers: [
      makeLayer(nextId(), 'Лампа', [
        makeObj(nextId(), 'Колба', vessel),
        makeObj(nextId(), 'Лава', lava),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
