/**
 * Demo «Неоновый город» — a 128×96 night skyline rendered in outline mode: tower masses, a crescent
 * moon and dithered window lights, all with rounded silhouette joins (`convexRadius`/
 * `concaveRadius`). Shows the outline render mode over a layered procedural city.
 */

import {
  fillRect,
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  noise1D,
  paint,
  sceneHead,
  type InkGrid,
} from './demo-kit.ts'
import type { ProjectJSON } from './project.ts'

export const CITY_COLS = 128
export const CITY_ROWS = 96

const PALETTE = [
  '#0a0e1d',
  '#31406e',
  '#1b2a52',
  '#0d1321',
  '#ffb703',
  '#4cc9f0',
  '#f4f1de',
  '#6d7bb3',
  '#8899cc',
] as const
const V = { far: 2, near: 3, street: 4, amber: 5, cyan: 6, moon: 7, glow: 8, star: 9 }

const STREET_Y = 78

interface Block {
  x: number
  w: number
  top: number
}

/** Deterministic tower run along the street: hashed widths, noise-driven heights. */
function skyline(seed: number, hMin: number, hSpan: number, wMin: number, wSpan: number): Block[] {
  const blocks: Block[] = []
  let x = -2
  let k = 0
  while (x < CITY_COLS) {
    const w = wMin + Math.floor(hash01(k, seed) * wSpan)
    const h = hMin + Math.floor(noise1D(k * 3.7, seed + 11) * hSpan)
    blocks.push({ x, w, top: STREET_Y - h })
    x += w
    k++
  }
  return blocks
}

function fillBlocks(g: InkGrid, blocks: Block[], v: number): void {
  for (const b of blocks) fillRect(g, { x: b.x, y: b.top, w: b.w, h: STREET_Y - b.top }, v)
}

/** Dithered lit windows scattered over the faces of the near towers. */
function paintWindows(g: InkGrid, blocks: Block[]): void {
  for (const b of blocks) {
    for (let wy = b.top + 2; wy < STREET_Y - 2; wy += 3) {
      for (let wx = b.x + 1; wx < b.x + b.w - 1; wx += 2) {
        if (hash01(wx * 7, wy * 13) > 0.4) continue
        paint(g, wx, wy, hash01(wx, wy * 5) < 0.25 ? V.cyan : V.amber)
      }
    }
  }
}

/** Crescent moon with a dithered halo, sparse stars, street band and wet reflections. */
function paintSkyAndStreet(g: InkGrid): void {
  for (let y = 0; y < CITY_ROWS; y++) {
    for (let x = 0; x < CITY_COLS; x++) {
      const dMoon = Math.hypot(x - 104, y - 14)
      const dBite = Math.hypot(x - 100, y - 11)
      if (dMoon < 8 && dBite > 7.5) paint(g, x, y, V.moon)
      else if (dMoon < 12 && dBite > 7.5 && hash01(x, y) < 0.3) paint(g, x, y, V.glow)
      else if (hash01(x * 5, y * 3) < 0.02 && y < STREET_Y - 30) paint(g, x, y, V.star)
      if (y >= STREET_Y) {
        paint(g, x, y, V.street)
        const wet = hash01(Math.floor(x / 9), 77) < 0.55 && (x + y * 3) % 7 < 2
        if (wet && y < STREET_Y + 10) paint(g, x, y, hash01(x, 91) < 0.3 ? V.cyan : V.amber)
      }
    }
  }
}

/** The neon city as a fresh v3 scene document; deterministic down to the last cell. */
export function neonCityProjectJSON(): ProjectJSON {
  const far = makeGrid(CITY_COLS, CITY_ROWS)
  const near = makeGrid(CITY_COLS, CITY_ROWS)
  const windows = makeGrid(CITY_COLS, CITY_ROWS)
  const sky = makeGrid(CITY_COLS, CITY_ROWS)
  fillBlocks(far, skyline(3, 14, 26, 6, 9), V.far)
  const nearBlocks = skyline(8, 8, 24, 8, 11)
  fillBlocks(near, nearBlocks, V.near)
  paintWindows(windows, nearBlocks)
  paintSkyAndStreet(sky)

  let id = 0
  const nextId = () => ++id
  const head = sceneHead(CITY_COLS, CITY_ROWS, PALETTE)
  return {
    ...head,
    renderMode: 'outline',
    style: { ...head.style, convexRadius: 0.35, concaveRadius: 0.3 },
    bg: '#0a0e1d',
    layers: [
      makeLayer(nextId(), 'Город', [
        makeObj(nextId(), 'Звёзды и улица', sky),
        makeObj(nextId(), 'Дальний план', far),
        makeObj(nextId(), 'Ближний план', near),
        makeObj(nextId(), 'Окна', windows),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
