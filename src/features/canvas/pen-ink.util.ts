/**
 * Pen-tool ink pipeline shared by the live preview and the commit: resolve the ShapePaint styling
 * into palette values, rasterize the draft (engine raster on square grids, grid sampling on
 * lattices), expand symmetry orbits. Pure functions over the store snapshot — no React.
 */

import { resolveColor, type Doc, type SymmetryState } from '../../engine/core/doc.ts'
import { pathInk, pathToD, type CurvePath, type Pt } from '../../engine/curves/index.ts'
import type { Grid } from '../../engine/grids/index.ts'
import { useStore } from '../../state/editor.store.ts'
import { MAX_STAMPS } from './canvas-stage.util.ts'
import { penGridInk } from './stage-pen.util.ts'

export interface PenInkParams {
  doc: Doc
  isSquare: boolean
  grid: Grid
  bw: number
  bh: number
  symmetry: SymmetryState
  /** Symmetry orbit of one cell (pen ink expands through it like every stamping tool) */
  expand: (idx: number) => number[]
}

export interface PenInk {
  cells: Map<number, number>
  /** The doc with the stroke/fill colors resolved into its palette (commit passes it on) */
  resolved: Doc
}

/**
 * Ink cells + palette-resolved doc of the draft. Stroke paints over fill (outline wins at
 * overlaps); a fill with the stroke off paints the outline in the fill color, like the shapes do.
 */
export function buildPenInk(p: PenInkParams, path: CurvePath): PenInk {
  const s = useStore.getState()
  const strokeOn = s.shapePaint.stroke || s.shapePaint.fill === 'none'
  const fillOn = s.shapePaint.fill !== 'none' && path.closed
  const strokeColor = strokeOn ? s.shapePaint.strokeColor || s.color : s.color
  let resolved = s.doc
  const rStroke = resolveColor(resolved, strokeColor)
  resolved = rStroke.doc
  let vFill = 0
  if (fillOn) {
    const rFill = resolveColor(resolved, s.color)
    resolved = rFill.doc
    vFill = rFill.v
  }
  const vOut = strokeOn ? rStroke.v : vFill
  const cells = new Map<number, number>()
  if (p.isSquare) {
    const ink = pathInk(path, p.bw, p.bh, { width: s.toolOpts.penWidth, fill: fillOn })
    if (p.symmetry.mode === 'none') {
      for (const i of ink.fill) cells.set(i, vFill)
      for (const i of ink.stroke) cells.set(i, vOut)
    } else {
      expandSquareInk(ink, { vOut, vFill }, p, cells)
    }
  } else {
    inkLattice(p, path, { fillOn, vOut, vFill, width: s.toolOpts.penWidth }, cells)
  }
  return { cells, resolved }
}

/** Symmetry stamps plain pixels only: orbit copies of every ink cell, budget-capped. */
function expandSquareInk(
  ink: { stroke: ReadonlySet<number>; fill: ReadonlySet<number> },
  v: { vOut: number; vFill: number },
  p: PenInkParams,
  cells: Map<number, number>,
): void {
  let used = 0
  for (const i of ink.stroke) {
    if (used++ > MAX_STAMPS) break
    for (const si of p.expand(i)) cells.set(si, v.vOut)
  }
  for (const i of ink.fill) {
    if (used++ > MAX_STAMPS) break
    for (const si of p.expand(i)) cells.set(si, v.vFill)
  }
}

/** Non-square grids: doc-space sampling through `grid.cellAt`, single- or two-color. */
function inkLattice(
  p: PenInkParams,
  path: CurvePath,
  style: { fillOn: boolean; vOut: number; vFill: number; width: number },
  cells: Map<number, number>,
): void {
  const width = Math.max(1, Math.round(style.width))
  const line = penGridInk({
    path,
    grid: p.grid,
    width,
    fill: false,
    orbit: p.expand,
    budget: MAX_STAMPS,
  })
  if (style.fillOn) {
    const fill = penGridInk({
      path,
      grid: p.grid,
      width: 1,
      fill: true,
      orbit: p.expand,
      budget: MAX_STAMPS,
    })
    for (const i of fill) if (!line.has(i)) cells.set(i, style.vFill)
  }
  for (const i of line) cells.set(i, style.vOut)
}

/** The `source.bezier` param payload of a path (also the re-edit round-trip format). */
export function penSourceParams(path: CurvePath): Record<string, number | string | boolean> {
  const s = useStore.getState()
  return {
    d: pathToD(path),
    w: s.toolOpts.penWidth,
    stroke: s.shapePaint.stroke,
    fillMode: s.shapePaint.fill,
    strokeColor: s.shapePaint.strokeColor,
    fillColor: s.color,
  }
}

/** Anchor placement snaps to cell centers; Alt places freely (the brush's own convention). */
export function snapPenAnchor(p: Pt, sub: number, cols: number, rows: number, free: boolean): Pt {
  if (free) return [p[0], p[1]]
  const cx = Math.min(Math.max(0, Math.floor(p[0] * sub)), cols * sub - 1)
  const cy = Math.min(Math.max(0, Math.floor(p[1] * sub)), rows * sub - 1)
  return [(cx + 0.5) / sub, (cy + 0.5) / sub]
}

/** Ctrl-dragged handles snap their angle around the anchor to 15° steps. */
export function snapHandle15(origin: Pt, h: Pt): Pt {
  const dx = h[0] - origin[0]
  const dy = h[1] - origin[1]
  const step = Math.PI / 12
  const a = Math.round(Math.atan2(dy, dx) / step) * step
  const len = Math.hypot(dx, dy)
  return [origin[0] + Math.cos(a) * len, origin[1] + Math.sin(a) * len]
}
