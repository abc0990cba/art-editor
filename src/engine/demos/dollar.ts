/**
 * Demo «Банкнота» — a 192×96 banknote engraved with pure dithering: a wave-mesh guilloche field, a
 * double frame with corner rosettes, a hatched bust in an engine-turned oval and big shadowed "100"
 * numerals from a bitmap font. Shows fine line-screen engraving across four layers.
 */

import type { ProjectJSON } from '../core/project.ts'
import { BAYER4 } from '../dither/matrices.ts'
import { makeGrid, makeLayer, makeObj, paint, sceneHead, screenValue, stampBitmap } from './kit.ts'
import type { InkGrid } from './kit.ts'

export const NOTE_COLS = 192
export const NOTE_ROWS = 96

const PALETTE = ['#e9e4cf', '#b9c9ac', '#6f9b7a', '#2f5d46', '#17352a', '#c9a84c'] as const
const V = { paper: 1, pale: 2, mid: 3, deep: 4, ink: 5, gold: 6 }

const OVAL = { x: 58, y: 46, rx: 24, ry: 36 }

/** 5×7 bitmap digits for the denominations. */
const DIGITS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
}

/** Stamp a digit string at (x, y) with the given scale and color. */
function stampText(
  g: InkGrid,
  text: string,
  at: { x: number; y: number; scale: number; v: number },
): number {
  let cx = at.x
  for (const ch of text) {
    const glyph = DIGITS[ch]
    if (glyph) stampBitmap(g, glyph, { x: cx, y: at.y }, at.scale, at.v)
    cx += 6 * at.scale
  }
  return cx - 6 * at.scale - at.x
}

/** The engine-turned paper: two crossed families of thin sine-wave lines over cream stock. */
function paintGuilloche(g: InkGrid): void {
  for (let y = 0; y < NOTE_ROWS; y++) {
    for (let x = 0; x < NOTE_COLS; x++) {
      const warp = Math.abs(Math.sin(x * 0.5 + 1.8 * Math.sin(y * 0.21)))
      const weft = Math.abs(Math.sin(y * 0.5 + 1.6 * Math.sin(x * 0.18 + 2)))
      paint(g, x, y, warp < 0.13 ? V.pale : weft < 0.11 ? V.mid : V.paper)
    }
  }
}

/** A corner fan: ink hub, deep/mid/pale rings, gold dust and eight ink spokes. */
function paintRosetteAt(g: InkGrid, cx: number, cy: number): void {
  for (let dy = -9; dy <= 9; dy++) {
    for (let dx = -9; dx <= 9; dx++) {
      const r = Math.hypot(dx, dy)
      if (r > 9) continue
      const t = (((Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
      const spoke = Math.min(t, 8 - t) < 0.3
      let v: number
      if (r < 2.5 || spoke) v = V.ink
      else if (r < 4.5) v = V.deep
      else if (r < 6.5) v = V.mid
      else v = screenValue(BAYER4, cx + dx, cy + dy) < 0.22 ? V.gold : V.pale
      paint(g, cx + dx, cy + dy, v)
    }
  }
}

/** Double frame, corner rosettes and wave-mesh ribbon bands along the top and bottom. */
function paintFrame(g: InkGrid): void {
  for (let y = 0; y < NOTE_ROWS; y++) {
    for (let x = 0; x < NOTE_COLS; x++) {
      const edge = x < 2 || x >= NOTE_COLS - 2 || y < 2 || y >= NOTE_ROWS - 2
      const inner = x === 3 || x === NOTE_COLS - 4 || y === 3 || y === NOTE_ROWS - 4
      if (edge) paint(g, x, y, V.deep)
      else if (inner) paint(g, x, y, V.gold)
    }
  }
  paintRosetteAt(g, 11, 11)
  paintRosetteAt(g, NOTE_COLS - 12, 11)
  paintRosetteAt(g, 11, NOTE_ROWS - 12)
  paintRosetteAt(g, NOTE_COLS - 12, NOTE_ROWS - 12)
  for (const y0 of [6, NOTE_ROWS - 15]) {
    for (let y = y0; y < y0 + 9; y++) {
      for (let x = 48; x <= 144; x++) {
        if (Math.abs(Math.sin(x * 0.55) + Math.sin(y * 0.8 + x * 0.25)) < 0.18)
          paint(g, x, y, V.mid)
      }
    }
  }
}

/** The portrait: engine-turned oval ring, hatched ground, ink bust with a gold collar. */
function paintPortrait(g: InkGrid): void {
  for (let dy = -OVAL.ry; dy <= OVAL.ry; dy++) {
    for (let dx = -OVAL.rx; dx <= OVAL.rx; dx++) {
      const rr = Math.hypot(dx / OVAL.rx, dy / OVAL.ry)
      if (rr > 1) continue
      const x = OVAL.x + dx
      const y = OVAL.y + dy
      if (rr > 0.86) {
        paint(g, x, y, screenValue(BAYER4, x, y) < 0.3 ? V.ink : V.deep)
        continue
      }
      let v = y % 2 === 0 ? V.mid : V.pale
      const head = Math.hypot(dx, dy + 10) < 9.5
      const neck = Math.abs(dx) < 5 && dy > -2 && dy < 4
      const shoulder = dy >= 4 && Math.abs(dx) < 9 + (dy - 4) * 0.75
      if (head || neck) v = V.ink
      else if (shoulder) v = dy % 2 === 0 ? V.ink : V.deep
      if (dy === 4 && Math.abs(dx) < 12) v = V.gold
      paint(g, x, y, v)
    }
  }
}

/** Big shadowed "100" right of the portrait, small denominations top and bottom, three stars. */
function paintNumerals(g: InkGrid): void {
  stampText(g, '100', { x: 120, y: 32, scale: 3, v: V.gold })
  stampText(g, '100', { x: 118, y: 30, scale: 3, v: V.deep })
  stampText(g, '100', { x: 80, y: 6, scale: 2, v: V.deep })
  stampText(g, '100', { x: 80, y: NOTE_ROWS - 13, scale: 2, v: V.deep })
  for (const x of [128, 146, 164]) paint(g, x, 60, V.gold)
}

/** The banknote as a fresh v3 scene document; deterministic down to the last cell. */
export function dollarProjectJSON(): ProjectJSON {
  const guilloche = makeGrid(NOTE_COLS, NOTE_ROWS)
  const frame = makeGrid(NOTE_COLS, NOTE_ROWS)
  const portrait = makeGrid(NOTE_COLS, NOTE_ROWS)
  const numerals = makeGrid(NOTE_COLS, NOTE_ROWS)
  paintGuilloche(guilloche)
  paintFrame(frame)
  paintPortrait(portrait)
  paintNumerals(numerals)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(NOTE_COLS, NOTE_ROWS, PALETTE),
    layers: [
      makeLayer(nextId(), 'Банкнота', [
        makeObj(nextId(), 'Гильош', guilloche),
        makeObj(nextId(), 'Рамка', frame),
        makeObj(nextId(), 'Портрет', portrait),
        makeObj(nextId(), 'Цифры', numerals),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
