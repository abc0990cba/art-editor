/**
 * Demo «Вторженец» — a 32×32 icon project: the classic crab invader as a two-color bitmap with
 * dithered star sparkles. Shows the editor at icon scale, where every cell is visible.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER4 } from '../dither/matrices.ts'
import {
  fillRect,
  makeGrid,
  makeLayer,
  makeObj,
  paint,
  sceneHead,
  screenValue,
  stampBitmap,
} from './kit.ts'

export const INVADER_COLS = 32
export const INVADER_ROWS = 32

const PALETTE = ['#101024', '#9ef01a', '#f0abfc'] as const
const V = { bg: 1, body: 2, star: 3 }

const INVADER = [
  '..#.....#..',
  '...#...#...',
  '..#######..',
  '.##.###.##.',
  '###########',
  '#.#######.#',
  '#.#.....#.#',
  '...##.##...',
]

/** The invader icon as a fresh v3 scene document; deterministic down to the last cell. */
export function invaderProjectJSON(): ProjectJSON {
  const bg = makeGrid(INVADER_COLS, INVADER_ROWS)
  const body = makeGrid(INVADER_COLS, INVADER_ROWS)
  const details = makeGrid(INVADER_COLS, INVADER_ROWS)

  fillRect(bg, { x: 0, y: 0, w: INVADER_COLS, h: INVADER_ROWS }, V.bg)
  stampBitmap(body, INVADER, { x: 5, y: 9 }, 2, V.body)
  // a few dithered sparkles so the emptiness around the sprite is alive too
  const stars: readonly (readonly [number, number])[] = [
    [4, 3],
    [26, 5],
    [7, 26],
    [25, 24],
  ]
  for (const [sx, sy] of stars) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (screenValue(BAYER4, sx + dx, sy + dy) < 0.5) paint(details, sx + dx, sy + dy, V.star)
      }
    }
  }

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(INVADER_COLS, INVADER_ROWS, PALETTE),
    layers: [
      makeLayer(nextId(), 'Фон', [makeObj(nextId(), 'Заливка', bg)]),
      makeLayer(nextId(), 'Спрайт', [
        makeObj(nextId(), 'Вторженец', body),
        makeObj(nextId(), 'Звёзды', details),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
