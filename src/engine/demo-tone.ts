/**
 * Demo «Тоновое солнце» — a 96×96 halftone sunrise. Shows the tone-size effect: every cell is a
 * circle whose figure shrinks as its color lightens (`toneSize` + `toneSizeMin`), so a five-step
 * navy ramp reads as a smooth photographic gradient — sun, sky and sea of dots.
 */

import { makeGrid, makeLayer, makeObj, paint, sceneHead, screenValue } from './demo-kit.ts'
import type { InkGrid } from './demo-kit.ts'
import { BAYER8 } from './dither-matrices.ts'
import type { ProjectJSON } from './project.ts'

export const TONE_COLS = 96
export const TONE_ROWS = 96

const PALETTE = ['#f6efe1', '#12263f', '#1d4e6b', '#3d7ea6', '#8fc1d4', '#cde6f0'] as const
const V = { ink: 2, deep: 3, mid: 4, soft: 5, pale: 6 }
const RAMP = [V.ink, V.deep, V.mid, V.soft, V.pale] as const

const HORIZON = 62
const SUN = { x: 48, y: 34, r: 26 }

/** Tone 0..1 → one of the five ramp colors, ordered-dithered so bands melt into each other. */
function tone(t: number, x: number, y: number): number {
  const pos = Math.min(4, Math.max(0, t * 4 + (screenValue(BAYER8, x, y) - 0.5) * 1.4))
  return RAMP[Math.round(pos)]
}

function paintSky(g: InkGrid): void {
  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < TONE_COLS; x++) {
      const d = Math.hypot(x - SUN.x, y - SUN.y)
      const glow = Math.max(0, 1 - d / 42)
      // pale airy sky at the top, deepening toward the horizon, with a bright halo around the sun
      const t = 0.92 - (y / HORIZON) * 0.38 + glow * 0.25
      paint(g, x, y, tone(t, x, y))
    }
  }
}

function paintSun(g: InkGrid): void {
  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < TONE_COLS; x++) {
      const d = Math.hypot(x - SUN.x, y - SUN.y)
      if (d > SUN.r) continue
      // dense dark core dissolving toward the rim — the classic halftone sun
      paint(g, x, y, tone((d / SUN.r) * 0.92, x, y))
    }
  }
}

function paintSea(g: InkGrid): void {
  for (let y = HORIZON; y < TONE_ROWS; y++) {
    for (let x = 0; x < TONE_COLS; x++) {
      const wave = Math.sin(x * 0.32 + y * 1.7) * 0.05 + Math.sin(x * 0.13 - y * 0.9) * 0.04
      // bright where the horizon glows, dark in the foreground
      const t = 0.72 - ((y - HORIZON) / (TONE_ROWS - HORIZON)) * 0.42 + wave
      paint(g, x, y, tone(t, x, y))
    }
  }
  // crisp horizon
  for (let x = 0; x < TONE_COLS; x++) paint(g, x, HORIZON, V.ink)
}

/** A tiny fishing boat in front of the sun, dark against the pale water. */
function paintBoat(g: InkGrid): void {
  const bx = 28
  const by = 70
  for (let x = bx; x < bx + 9; x++) paint(g, x, by, V.ink)
  for (let x = bx + 2; x < bx + 7; x++) paint(g, x, by + 1, V.ink)
  for (let y = by - 7; y < by; y++) paint(g, bx + 4, y, V.ink)
  paint(g, bx + 3, by - 6, V.ink)
  paint(g, bx + 5, by - 6, V.ink)
}

/** The halftone sunrise as a fresh v3 scene document; deterministic down to the last cell. */
export function toneProjectJSON(): ProjectJSON {
  const sky = makeGrid(TONE_COLS, TONE_ROWS)
  const sun = makeGrid(TONE_COLS, TONE_ROWS)
  const sea = makeGrid(TONE_COLS, TONE_ROWS)
  paintSky(sky)
  paintSun(sun)
  paintSea(sea)
  paintBoat(sea)

  let id = 0
  const nextId = () => ++id
  const head = sceneHead(TONE_COLS, TONE_ROWS, PALETTE)
  return {
    ...head,
    style: { ...head.style, shape: 'circle', toneSize: true, toneSizeMin: 0.1 },
    bg: '#f6efe1',
    layers: [
      makeLayer(nextId(), 'Рассвет', [
        makeObj(nextId(), 'Небо', sky),
        makeObj(nextId(), 'Солнце', sun),
        makeObj(nextId(), 'Море', sea),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
