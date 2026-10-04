/**
 * Pen-tool canvas helpers: the overlay skeleton (path outline, anchor squares, handle knobs, rubber
 * band) and the doc-space ink sampling for non-square grids. Pure functions over the engine curves
 * domain — no React; colors come from the stage theme like every other overlay.
 */

import type { Doc, StageTheme } from '../../engine/core/doc.ts'
import { allObjs } from '../../engine/core/scene.ts'
import { flattenPath, type CurvePath, type PenHit, type Pt } from '../../engine/curves/index.ts'
import type { Grid } from '../../engine/grids/index.ts'
import type { ParamValue } from '../../engine/nodes/index.ts'
import { pointInPolys } from '../../engine/shapes/fill.ts'
import { blobCells } from './canvas-stage.util.ts'

/** Overlay metrics in screen px (converted to doc units by the caller's zoom). */
export const PEN_ANCHOR_PX = 8
export const PEN_HANDLE_PX = 7
/** Hit radiuses: touch doubles them, matching the transform-handle convention. */
export const PEN_HIT_PX = 9
export const PEN_HIT_TOUCH_PX = 18

export interface PenOverlayInput {
  path: CurvePath | null
  /** Live pointer in doc space — draws the dashed rubber band on an open draft */
  cursor: Pt | null
  /** Rubber band visible only between clicks (hidden mid-drag, where the handle tells the story) */
  rubber: boolean
  hover: PenHit | null
  selected: number | null
  /** The closing candidate: cursor within reach of the first anchor of an open ≥2-anchor path */
  closeHint: boolean
}

const KNOB_FILL = 'rgba(255,255,255,0.95)'
const KNOB_EDGE = 'rgba(0,0,0,0.65)'

/** The pen's vector skeleton on the overlay canvas; the caller has applied the doc transform. */
export function drawPenOverlay(
  ctx: CanvasRenderingContext2D,
  inp: PenOverlayInput,
  theme: StageTheme,
  zoom: number,
): void {
  const { path } = inp
  if (!path || path.anchors.length === 0) return
  const u = 1 / zoom
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // skeleton through the flattened curve
  ctx.strokeStyle = theme.guide
  ctx.lineWidth = 1.5 * u
  const poly = flattenPath(path)
  ctx.beginPath()
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.stroke()
  drawRubberBand(ctx, inp, path, u)
  drawHandleStems(ctx, path, u)
  drawHandleKnobs(ctx, inp, path, u)
  drawAnchorSquares(ctx, inp, path, theme, u)
  ctx.restore()
}

/** Dashed rubber band from the last anchor toward the pointer. */
function drawRubberBand(
  ctx: CanvasRenderingContext2D,
  inp: PenOverlayInput,
  path: CurvePath,
  u: number,
): void {
  if (!inp.rubber || !inp.cursor) return
  const lastA = path.anchors[path.anchors.length - 1]
  ctx.setLineDash([4 * u, 3 * u])
  ctx.beginPath()
  ctx.moveTo(lastA.x, lastA.y)
  ctx.lineTo(inp.cursor[0], inp.cursor[1])
  ctx.stroke()
  ctx.setLineDash([])
}

/** Stems from every anchor to its existing handles, under the knobs. */
function drawHandleStems(ctx: CanvasRenderingContext2D, path: CurvePath, u: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2 * u
  for (const a of path.anchors) {
    for (const h of [a.hIn, a.hOut]) {
      if (!h) continue
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(h[0], h[1])
      ctx.stroke()
    }
  }
}

function drawHandleKnobs(
  ctx: CanvasRenderingContext2D,
  inp: PenOverlayInput,
  path: CurvePath,
  u: number,
): void {
  ctx.strokeStyle = KNOB_EDGE
  ctx.lineWidth = u
  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i]
    for (const [which, h] of [
      ['in', a.hIn],
      ['out', a.hOut],
    ] as const) {
      if (!h) continue
      const hovered = inp.hover?.kind === 'handle' && inp.hover.i === i && inp.hover.which === which
      const r = (PEN_HANDLE_PX / 2 + (hovered ? 1.5 : 0)) * u
      ctx.beginPath()
      ctx.arc(h[0], h[1], r, 0, Math.PI * 2)
      ctx.fillStyle = KNOB_FILL
      ctx.fill()
      ctx.stroke()
    }
  }
}

function drawAnchorSquares(
  ctx: CanvasRenderingContext2D,
  inp: PenOverlayInput,
  path: CurvePath,
  theme: StageTheme,
  u: number,
): void {
  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i]
    const hovered = inp.hover?.kind === 'anchor' && inp.hover.i === i
    const closeHint = inp.closeHint && i === 0
    const side = (PEN_ANCHOR_PX + (hovered ? 2 : 0) + (closeHint ? 4 : 0)) * u
    ctx.fillStyle = inp.selected === i ? theme.guide : KNOB_FILL
    ctx.fillRect(a.x - side / 2, a.y - side / 2, side, side)
    ctx.strokeStyle = closeHint ? theme.guide : KNOB_EDGE
    ctx.lineWidth = (closeHint ? 2 : 1) * u
    ctx.strokeRect(a.x - side / 2, a.y - side / 2, side, side)
  }
}

/**
 * Params of an object's `source.bezier` node — the re-edit entry point. Null when the object has no
 * bezier source (plain pixels or another generator).
 */
export function bezierSourceOf(doc: Doc, objId: number): Record<string, ParamValue> | null {
  if (!doc.layers || objId <= 0) return null
  const obj = allObjs(doc.layers).find((o) => o.id === objId)
  const node = obj?.graph?.nodes.find((nd) => nd.op === 'source.bezier' && !nd.unknown)
  return node ? node.params : null
}

export interface PenGridInkParams {
  path: CurvePath
  grid: Grid
  /** Stroke thickness in cells (grid cells, stamped as brush blobs) */
  width: number
  /** Fill the interior of a closed path */
  fill: boolean
  /** Symmetry orbit of one grid cell (empty when symmetry is off) */
  orbit: (idx: number) => number[]
  /** Hard cap on produced cells (the shared stamp budget) */
  budget: number
}

/**
 * Doc-space ink of the path on any lattice: the flattened polyline is sampled through `grid.cellAt`
 * and stamped with width² blobs; closed fills test cell centers against the flattened loop
 * (even-odd). Returns grid cell indices — the square-grid path uses the engine rasterizer instead.
 */
export function penGridInk(p: PenGridInkParams): Set<number> {
  const out = new Set<number>()
  if (p.path.anchors.length === 0) return out
  const poly = flattenPath(p.path)
  const stamp = (idx: number): void => {
    for (const si of p.orbit(idx)) {
      if (si >= 0 && si < p.grid.count) out.add(si)
    }
  }
  const line = samplePenLine(p.grid, poly)
  let used = 0
  for (const idx of line) {
    if (used >= p.budget) break
    const blob = p.width > 1 ? blobCells(p.grid, idx, p.width * p.width) : [idx]
    for (const bi of blob) {
      if (used >= p.budget) break
      used++
      stamp(bi)
    }
  }
  if (p.fill && p.path.closed && poly.length > 2) {
    used += fillPenInterior(p, poly, out, p.budget - used)
  }
  return out
}

/** Grid cells the flattened polyline passes through, densely sampled in doc space. */
function samplePenLine(grid: Grid, poly: [number, number][]): Set<number> {
  const line = new Set<number>()
  let prev = poly[0]
  for (let i = 1; i < poly.length; i++) {
    const cur = poly[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) * 6))
    for (let s = 0; s <= steps; s++) {
      const x = prev[0] + ((cur[0] - prev[0]) * s) / steps
      const y = prev[1] + ((cur[1] - prev[1]) * s) / steps
      const idx = grid.cellAt(x, y)
      if (idx >= 0) line.add(idx)
    }
    prev = cur
  }
  if (poly.length === 1) {
    const idx = grid.cellAt(poly[0][0], poly[0][1])
    if (idx >= 0) line.add(idx)
  }
  return line
}

/** Even-odd interior cells of the closed flattened loop (bbox-rejected), budget-capped. */
function fillPenInterior(
  p: PenGridInkParams,
  poly: [number, number][],
  out: Set<number>,
  budget: number,
): number {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  let used = 0
  for (let gi = 0; gi < p.grid.count && used < budget; gi++) {
    const cellPoly = p.grid.polygon(gi)
    let cx = 0
    let cy = 0
    let inBox = false
    for (const pt of cellPoly) {
      cx += pt.x
      cy += pt.y
      if (pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1) inBox = true
    }
    if (!inBox) continue
    if (!pointInPolys([poly as never], cx / cellPoly.length, cy / cellPoly.length)) continue
    for (const si of p.orbit(gi)) {
      if (si >= 0 && si < p.grid.count && !out.has(si)) {
        out.add(si)
        used++
      }
    }
  }
  return used
}
