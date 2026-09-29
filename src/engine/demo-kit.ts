/**
 * Shared drawing kit for the demo projects (engine/demo-*.ts): sparse ink on a fixed-size square
 * grid, ordered-dither screens and small deterministic noise — everything pure so demos build the
 * same pixel-for-pixel on every client. The assembled scene JSON mirrors what the serializer
 * emits.
 */

import { type OrderedMatrix } from './dither-matrices.ts'
import { defaultDoc, type ElementStyle, type Link } from './doc'
import type { ProjectJSON } from './project.ts'

/** Sparse ink of one paint object: buffer index (y·cols + x) → palette value (1-based). */
export type Ink = Map<number, number>

export interface InkGrid {
  cols: number
  rows: number
  ink: Ink
}

export function makeGrid(cols: number, rows: number): InkGrid {
  return { cols, rows, ink: new Map() }
}

export function paint(g: InkGrid, x: number, y: number, v: number): void {
  if (x >= 0 && x < g.cols && y >= 0 && y < g.rows) g.ink.set(y * g.cols + x, v)
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Solid w×h block with its top-left corner at (x, y). */
export function fillRect(g: InkGrid, rect: Rect, v: number): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) paint(g, x, y, v)
  }
}

/** Bayer screen threshold at (x, y): tone below it takes the light color. */
export function screenValue(m: OrderedMatrix, x: number, y: number): number {
  const n = m.length
  return (m[((y % n) + n) % n][((x % n) + n) % n] + 0.5) / (n * n)
}

/** Deterministic 0..1 hash of two integers (the same primitive the grain ramp uses). */
export function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth 1D value noise in 0..1 — two octaves of hashed lattice points with smoothstep blending. */
export function noise1D(x: number, seed: number): number {
  const lattice = (t: number): number => {
    const i = Math.floor(t)
    const f = t - i
    const s = f * f * (3 - 2 * f)
    const a = hash01(i, seed)
    const b = hash01(i + 1, seed)
    return a + (b - a) * s
  }
  return lattice(x) * 0.65 + lattice(x * 2.7 + 13.1) * 0.35
}

/** Stamp '#' cells of a bitmap (one char per cell) at an integer scale, top-left at (x, y). */
export function stampBitmap(
  g: InkGrid,
  rows: readonly string[],
  at: { readonly x: number; readonly y: number },
  scale: number,
  v: number,
): void {
  for (let ry = 0; ry < rows.length; ry++) {
    for (let rx = 0; rx < rows[ry].length; rx++) {
      if (rows[ry][rx] === '#') {
        fillRect(g, { x: at.x + rx * scale, y: at.y + ry * scale, w: scale, h: scale }, v)
      }
    }
  }
}

/** Structured like the scene JSON the serializer emits; storage persists it verbatim. */
export interface DemoObjJSON {
  kind: 'obj'
  id: number
  name: string
  visible: boolean
  locked: boolean
  style: ElementStyle
  cells: number[]
  links: Link[]
}

export interface DemoLayerJSON {
  kind: 'layer'
  id: number
  name: string
  visible: boolean
  locked: boolean
  children: DemoObjJSON[]
}

/** Frozen default pixel style — demos speak through dithering, not styles. */
const STYLE: ElementStyle = (() => {
  const base = defaultDoc()
  return {
    style: base.style,
    renderMode: base.renderMode,
    connectivity: base.connectivity,
    metaball: base.metaball,
    texture: base.texture,
  }
})()

export function makeObj(id: number, name: string, g: InkGrid): DemoObjJSON {
  const cells: number[] = []
  for (const [i, v] of [...g.ink.entries()].sort((a, b) => a[0] - b[0])) cells.push(i, v)
  return { kind: 'obj', id, name, visible: true, locked: false, cells, links: [], style: STYLE }
}

export const makeLayer = (id: number, name: string, children: DemoObjJSON[]): DemoLayerJSON => ({
  kind: 'layer',
  id,
  name,
  visible: true,
  locked: false,
  children,
})

/** Head of a fresh scene document: grid + palette + default rendering knobs. */
export function sceneHead(
  cols: number,
  rows: number,
  palette: readonly string[],
): Omit<ProjectJSON, 'layers' | 'nextNodeId' | 'links'> & { links: Link[] } {
  const base = defaultDoc()
  return {
    v: 3,
    cols,
    rows,
    sub: 1,
    radialEven: false,
    links: [],
    palette: [...palette],
    style: base.style,
    gridType: 'square',
    renderMode: 'pixels',
    connectivity: 'edge',
    metaball: base.metaball,
    texture: base.texture,
    styleScope: 'global',
    bg: '',
    connectorWidth: base.connectorWidth,
  }
}
