/**
 * The first-launch demo project: a 200×100 dither poster — «DITHER LAB» lettering over a dithered
 * sunset — that shows what the editor does (ordered dithering, tone ramps, scene layers) before the
 * user paints anything. Pure data; seeded once per install by storage/demo-seed.ts.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER4, BAYER8 } from '../dither/matrices.ts'
import {
  makeGrid,
  makeLayer,
  makeObj,
  paint,
  sceneHead,
  screenValue,
  stampBitmap,
  type DemoLayerJSON,
  type InkGrid,
} from './kit.ts'

export const DEMO_PROJECT_NAME = 'Ditherlab Demo'

export const COLS = 200
export const ROWS = 100
const HORIZON = 78

/** Palette order is fixed; cell values in the scene objects are index + 1. */
const PALETTE = [
  '#1e1b4b', // sky — top
  '#a78bfa', // sky — horizon
  '#4c1d95', // sea — horizon
  '#2e1065', // sea — bottom
  '#fde047', // sun core
  '#fb923c', // sun rim
  '#ffffff', // lettering
  '#312e81', // lettering shadow
  '#f0abfc', // sparkles
] as const

const V = {
  skyLo: 1,
  skyHi: 2,
  seaLo: 3,
  seaHi: 4,
  sunCore: 5,
  sunEdge: 6,
  ink: 7,
  shadow: 8,
  sparkle: 9,
}

/** 5×7 chunky bitmap font — only the letters the poster needs. */
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  D: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
}

/** Stamp one word at an integer scale with its top-left corner at (x, y). */
function word(
  g: InkGrid,
  spec: {
    readonly text: string
    readonly x: number
    readonly y: number
    readonly scale: number
    readonly v: number
  },
): void {
  let pen = spec.x
  for (const ch of spec.text) {
    const rows = FONT[ch]
    if (rows) stampBitmap(g, rows, { x: pen, y: spec.y }, spec.scale, spec.v)
    pen += 6 * spec.scale
  }
}

function sun(g: InkGrid): void {
  const cx = 46
  const R = 24
  for (let y = HORIZON - R; y < HORIZON; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - HORIZON)
      if (d > R) continue
      paint(g, x, y, d / R < screenValue(BAYER4, x, y) ? V.sunCore : V.sunEdge)
    }
  }
}

/** Discrete shrinking slivers of the sun reflection, dotted down the sea with gaps. */
function shimmer(g: InkGrid): void {
  const cx = 46
  const slivers: readonly (readonly [number, number])[] = [
    [81, 13],
    [84, 9],
    [86, 6],
    [88, 4],
    [90, 3],
    [92, 2],
    [94, 1],
  ]
  for (const [y, w] of slivers) {
    for (let x = cx - w; x <= cx + w; x++) paint(g, x, y, V.sunEdge)
  }
}

function sparkles(g: InkGrid): void {
  const stars: readonly (readonly [number, number, number])[] = [
    [150, 58, 2],
    [172, 63, 1],
    [140, 68, 1],
    [26, 5, 1],
    [64, 4, 2],
  ]
  for (const [cx, cy, r] of stars) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= r) paint(g, x, y, V.sparkle)
      }
    }
  }
}

/** The demo poster as a fresh v3 scene document; deterministic down to the last cell. */
export function demoProjectJSON(): ProjectJSON {
  const sky = makeGrid(COLS, ROWS)
  const sea = makeGrid(COLS, ROWS)
  const sunInk = makeGrid(COLS, ROWS)
  const textShadow = makeGrid(COLS, ROWS)
  const text = makeGrid(COLS, ROWS)
  const details = makeGrid(COLS, ROWS)

  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < COLS; x++) {
      paint(sky, x, y, y / (HORIZON - 1) < screenValue(BAYER8, x, y) ? V.skyLo : V.skyHi)
    }
  }
  for (let y = HORIZON; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      paint(
        sea,
        x,
        y,
        (y - HORIZON) / (ROWS - HORIZON) < screenValue(BAYER8, x, y) ? V.seaLo : V.seaHi,
      )
    }
  }
  sun(sunInk)
  shimmer(details)
  sparkles(details)
  // big word, small word, one shared drop shadow three cells down-right
  word(textShadow, { text: 'DITHER', x: 15, y: 15, scale: 5, v: V.shadow })
  word(text, { text: 'DITHER', x: 12, y: 12, scale: 5, v: V.ink })
  word(textShadow, { text: 'LAB', x: 77, y: 55, scale: 3, v: V.shadow })
  word(text, { text: 'LAB', x: 74, y: 52, scale: 3, v: V.ink })

  let id = 0
  const nextId = () => ++id
  const layers: DemoLayerJSON[] = [
    makeLayer(nextId(), 'Фон', [makeObj(nextId(), 'Небо', sky), makeObj(nextId(), 'Море', sea)]),
    makeLayer(nextId(), 'Солнце', [makeObj(nextId(), 'Диск', sunInk)]),
    makeLayer(nextId(), 'Надпись', [
      makeObj(nextId(), 'Тень', textShadow),
      makeObj(nextId(), 'Буквы', text),
    ]),
    makeLayer(nextId(), 'Детали', [makeObj(nextId(), 'Блики', details)]),
  ]

  return { ...sceneHead(COLS, ROWS, PALETTE), layers, nextNodeId: id + 1, fuseObjects: true }
}
