/**
 * Demo «Конфетти» — a 64×64 celebration burst on a dark ground. Shows the cell-form family with
 * per-element styles: four objects, each frozen with its own cell shape — circles, five-point
 * stars, diamonds and hearts — so every painted cell renders as a tiny figure.
 */

import { hash01, makeGrid, makeLayer, makeObj, paint, sceneHead, stylePatch } from './demo-kit.ts'
import type { ProjectJSON } from './project.ts'

export const CONFETTI_COLS = 64
export const CONFETTI_ROWS = 64

const PALETTE = [
  '#1a1035',
  '#ff5d8f',
  '#ffd166',
  '#06d6a0',
  '#4cc9f0',
  '#9b5de5',
  '#fff7ed',
] as const
const V = { pink: 2, gold: 3, green: 4, cyan: 5, violet: 6, cream: 7 }

const CYCLE = [V.pink, V.gold, V.green, V.cyan, V.violet] as const

/** Concentric rings of round confetti dots bursting from the center, each dot a 2×2 cluster. */
function paintRings(g: ReturnType<typeof makeGrid>): void {
  const c = (CONFETTI_COLS - 1) / 2
  const rings = [
    { r: 6, n: 5 },
    { r: 13, n: 10 },
    { r: 20, n: 16 },
    { r: 27, n: 22 },
  ]
  let k = 0
  for (const { r, n } of rings) {
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + k * 0.26
      const x = Math.round(c + Math.cos(a) * r)
      const y = Math.round(c + Math.sin(a) * r)
      paint(g, x, y, CYCLE[k % 5])
      paint(g, x + 1, y, CYCLE[k % 5])
      paint(g, x, y + 1, CYCLE[k % 5])
      paint(g, x + 1, y + 1, CYCLE[k % 5])
    }
    k++
  }
}

/** Nine five-point stars on hashed orbits, plus one bright star in the very center. */
function paintStars(g: ReturnType<typeof makeGrid>): void {
  const c = (CONFETTI_COLS - 1) / 2
  paint(g, c, c, V.cream)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.35
    const r = 8 + (k % 3) * 8 + hash01(k, 31) * 4
    paint(g, Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), CYCLE[(k + 2) % 5])
  }
}

/** Ten diamonds on the outer orbit, alternating cyan and violet. */
function paintDiamonds(g: ReturnType<typeof makeGrid>): void {
  const c = (CONFETTI_COLS - 1) / 2
  for (let j = 0; j < 10; j++) {
    const a = (j / 10) * Math.PI * 2 + Math.PI / 10
    paint(
      g,
      Math.round(c + Math.cos(a) * 31),
      Math.round(c + Math.sin(a) * 31),
      j % 2 ? V.violet : V.cyan,
    )
  }
}

/** Eight hearts drifting over the lower half, on hashed scatter positions. */
function paintHearts(g: ReturnType<typeof makeGrid>): void {
  for (let k = 0; k < 8; k++) {
    const x = 5 + Math.floor(hash01(k, 11) * 52)
    const y = 38 + Math.floor(hash01(k, 23) * 20)
    paint(g, x, y, k % 2 ? V.pink : V.gold)
  }
}

/** The confetti burst as a fresh v3 scene document; deterministic down to the last cell. */
export function confettiProjectJSON(): ProjectJSON {
  const rings = makeGrid(CONFETTI_COLS, CONFETTI_ROWS)
  const stars = makeGrid(CONFETTI_COLS, CONFETTI_ROWS)
  const diamonds = makeGrid(CONFETTI_COLS, CONFETTI_ROWS)
  const hearts = makeGrid(CONFETTI_COLS, CONFETTI_ROWS)
  paintRings(rings)
  paintStars(stars)
  paintDiamonds(diamonds)
  paintHearts(hearts)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(CONFETTI_COLS, CONFETTI_ROWS, PALETTE),
    styleScope: 'element',
    bg: '#1a1035',
    layers: [
      makeLayer(nextId(), 'Салют', [
        makeObj(nextId(), 'Кольца', rings, { style: stylePatch({ shape: 'circle' }) }),
        makeObj(nextId(), 'Звёзды', stars, {
          style: stylePatch({ shape: 'star', shapeParams: { points: 5, thickness: 0.32 } }),
        }),
        makeObj(nextId(), 'Ромбы', diamonds, { style: stylePatch({ shape: 'diamond' }) }),
        makeObj(nextId(), 'Сердца', hearts, { style: stylePatch({ shape: 'heart' }) }),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: false,
  }
}
