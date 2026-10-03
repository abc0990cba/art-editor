import { resolveColor, type Doc } from '../core/doc'
import type { FillStyle } from './fill-data.ts'
import {
  gradientAt,
  patternAt,
  patternCoord,
  type Box,
  type FillCoord,
  type PatternOpts,
} from './fill-patterns.ts'

export * from './fill-data.ts'
export * from './fill-patterns.ts'

/**
 * Assign 0 (active color) or 1 (second color) to every cell of a fill region. `seed` anchors radial
 * gradients and concentric patterns; linear gradients span the region's bounding box.
 */
export function applyFillStyle(
  style: FillStyle,
  region: readonly number[],
  seed: number,
  coordOf: FillCoord,
): Map<number, 0 | 1> {
  const out = new Map<number, 0 | 1>()
  if (region.length === 0) return out
  const s = coordOf(seed)
  let box: Box | null = null
  if (style.gradient !== 'none') {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const i of region) {
      const p = coordOf(i)
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    box = { x0, y0, x1, y1 }
  }
  const opts: PatternOpts = {
    scale: style.scale,
    grain: style.grain,
    seed: s,
    glyph: style.glyphSet,
    htShape: style.htShape,
    htAngle: style.htAngle,
    htLattice: style.htLattice,
    htJitter: style.htJitter,
    htDropout: style.htDropout,
  }
  for (const i of region) {
    const p = coordOf(i)
    const t =
      style.gradient === 'none' ? style.density : gradientAt(style.gradient, p.x, p.y, s, box!)
    out.set(i, patternAt(style.pattern, p.x, p.y, t, opts) ? 1 : 0)
  }
  return out
}

/**
 * Re-fill every painted cell owned by the selected elements — solid `colorA` or a two-color
 * pattern, exactly what a fill click paints but over the whole selection. Cell→element attribution
 * is untouched (cells keep their owners). Returns the new cell buffer with the (possibly extended)
 * palette, or null when the selection owns no painted cells.
 */
export function fillSelectionCells(
  doc: Doc,
  selection: readonly number[],
  style: FillStyle,
  colorA: string,
): { cells: Uint16Array; palette: string[] } | null {
  if (selection.length === 0 || !doc.cellObj) return null
  const sel = new Set(selection)
  const region: number[] = []
  for (let i = 0; i < doc.cells.length; i++) {
    if (doc.cells[i] > 0 && sel.has(doc.cellObj[i])) region.push(i)
  }
  if (region.length === 0) return null
  const rA = resolveColor(doc, colorA)
  const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
  const cells = doc.cells.slice()
  if (style.mode === 'pattern') {
    const coordOf = patternCoord(rB.doc)
    const bw = rB.doc.gridType === 'square' ? rB.doc.cols * rB.doc.sub : rB.doc.cols
    // anchor concentric patterns at the middle of the selection's bounding box
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const i of region) {
      const p = coordOf(i)
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    const seed = Math.round((y0 + y1) / 2) * bw + Math.round((x0 + x1) / 2)
    for (const [i, pick] of applyFillStyle(style, region, seed, coordOf)) {
      cells[i] = pick === 1 ? rB.v : rA.v
    }
  } else {
    for (const i of region) cells[i] = rA.v
  }
  return { cells, palette: rB.doc.palette }
}
