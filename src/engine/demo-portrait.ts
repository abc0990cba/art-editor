/**
 * Demo «Портрет» — a 64×64 stylized bust: flat pixel-art face with dithered hair shading over a
 * dithered backdrop. Shows the editor at sprite-portrait scale, between icon and illustration.
 */

import {
  fillRect,
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  paint,
  sceneHead,
  screenValue,
} from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import type { ProjectJSON } from './project.ts'

export const PORTRAIT_COLS = 64
export const PORTRAIT_ROWS = 64

const PALETTE = [
  '#241631', // backdrop — top
  '#472953', // backdrop — bottom
  '#e8b08a', // skin
  '#c9825f', // skin shadow
  '#241a2e', // hair / eyes
  '#b0475a', // lips
  '#2e5f63', // shirt
  '#1d3a3d', // shirt shadow
] as const

const V = { bgLo: 1, bgHi: 2, skin: 3, skinShade: 4, hair: 5, lips: 6, shirt: 7, shirtShade: 8 }

const CX = 32

/** Inside the face oval (superellipse-ish, slightly narrower at the chin). */
const inFace = (x: number, y: number): boolean => {
  const dx = (x - CX) / 13.5
  const dy = y < 26 ? (y - 25) / 15 : (y - 25) / 16.5
  return dx * dx + dy * dy <= 1
}

/** Hair cap: everything above the hairline curve, plus side masses framing the face. */
const inHair = (x: number, y: number): boolean => {
  const dx = Math.abs(x - CX)
  if (y < 14) return inFace(x, y - 2) || (dx <= 15 && y >= 8)
  if (y < 20) {
    // fringe dips lower at the sides, higher over the forehead center
    const fringe = 15 + 4 * hash01(Math.floor(x / 3), 7)
    return inFace(x, y) && y < fringe
  }
  return dx >= 12 && dx <= 16 && y < 46 && inFace(x + 2 * (x > CX ? 1 : -1), y - 6)
}

function portrait(bg: ReturnType<typeof makeGrid>, figure: ReturnType<typeof makeGrid>): void {
  // dithered backdrop
  for (let y = 0; y < PORTRAIT_ROWS; y++) {
    for (let x = 0; x < PORTRAIT_COLS; x++) {
      paint(bg, x, y, y / (PORTRAIT_ROWS - 1) < screenValue(BAYER8, x, y) ? V.bgLo : V.bgHi)
    }
  }
  // bust: shoulders + neck
  for (let y = 48; y < PORTRAIT_ROWS; y++) {
    const half = 10 + (y - 48) * 1.4
    for (let x = Math.round(CX - half); x <= Math.round(CX + half); x++) {
      paint(figure, x, y, hash01(x, y) < 0.12 ? V.shirtShade : V.shirt)
    }
  }
  fillRect(figure, { x: 28, y: 38, w: 8, h: 12 }, V.skin)
  fillRect(figure, { x: 28, y: 46, w: 8, h: 2 }, V.skinShade)
  // head: flat skin, dithered shade on the right side
  for (let y = 10; y < 44; y++) {
    for (let x = 17; x < 48; x++) {
      if (!inFace(x, y)) continue
      const shade = x > CX + 3 && screenValue(BAYER8, x, y) < (x - CX - 3) / 11
      paint(figure, x, y, shade ? V.skinShade : V.skin)
    }
  }
  // hair over and around the face
  for (let y = 6; y < 46; y++) {
    for (let x = 14; x < 51; x++) {
      const dithered = screenValue(BAYER8, x, y) < 0.35 && inFace(x, y + 3)
      if (inHair(x, y) || (y < 46 && dithered && inHair(x, y - 2))) paint(figure, x, y, V.hair)
    }
  }
  // eyes, brows, nose, lips
  fillRect(figure, { x: 23, y: 27, w: 4, h: 2 }, V.hair)
  fillRect(figure, { x: 37, y: 27, w: 4, h: 2 }, V.hair)
  fillRect(figure, { x: 23, y: 24, w: 4, h: 1 }, V.hair)
  fillRect(figure, { x: 37, y: 24, w: 4, h: 1 }, V.hair)
  fillRect(figure, { x: 31, y: 29, w: 2, h: 4 }, V.skinShade)
  fillRect(figure, { x: 28, y: 37, w: 8, h: 2 }, V.lips)
}

/** The portrait as a fresh v3 scene document; deterministic down to the last cell. */
export function portraitProjectJSON(): ProjectJSON {
  const bg = makeGrid(PORTRAIT_COLS, PORTRAIT_ROWS)
  const figure = makeGrid(PORTRAIT_COLS, PORTRAIT_ROWS)
  portrait(bg, figure)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(PORTRAIT_COLS, PORTRAIT_ROWS, PALETTE),
    layers: [
      makeLayer(nextId(), 'Фон', [makeObj(nextId(), 'Градиент', bg)]),
      makeLayer(nextId(), 'Портрет', [makeObj(nextId(), 'Фигура', figure)]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
