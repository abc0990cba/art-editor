import type { Doc, SymmetryState } from '../../engine/core/doc.ts'
import { symmetryPoints, symmetryTransforms } from '../../engine/effects/symmetry.ts'
import { PENDING_OBJ } from '../../engine/geometry/index.ts'
import { fillCellsEvenOdd, regionMask, regionMaskScratch } from '../../engine/shapes/fill.ts'
import {
  ellipsePoints,
  linePoints,
  rectPoints,
  shapePathLoops,
  shapePathPoints,
} from '../../engine/shapes/index.ts'
import { applyFillStyle, patternCoord } from '../../engine/texture/fill.ts'
import type { State } from '../../state/editor.store.ts'
import { MAX_STAMPS } from './canvas-stage.util.ts'

/**
 * Typed shape-drag staging: the square-grid rasterizer of `stampShape`, rewritten around one pooled
 * Uint16Array overlay instead of per-move Map/Set churn. A filled shape restamps its whole area on
 * every pointer move — at 2000² that used to mean millions of Map.set + Set.add calls (hundreds of
 * milliseconds per move); the buffer turns each stamp into a typed-array write and the flood into
 * mask bytes, and the Maps materialize once at commit (or when a legacy preview path needs them).
 * Emits exactly the cells the previous Set-based emitter staged.
 */

/** Full-buffer overlay of one shape drag: palette values, 0 = unstaged (ink only, no erases). */
export interface ShapeDragBuffer {
  cells: Uint16Array
  bw: number
  bh: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

let bufPool: Uint16Array | null = null

/** Start (or restart) a shape drag on the pooled buffer — O(grid) fill once per drag. */
export function beginShapeDrag(len: number, bw: number, bh: number): ShapeDragBuffer {
  if (!bufPool || bufPool.length !== len) bufPool = new Uint16Array(len)
  bufPool.fill(0)
  return { cells: bufPool, bw, bh, minX: bw, minY: bh, maxX: -1, maxY: -1 }
}

/** Materialize the drag buffer into the commit Map (once per drag, never per move). */
export function materializeShapeCells(buf: ShapeDragBuffer): Map<number, number> {
  const m = new Map<number, number>()
  const { cells, bw } = buf
  for (let y = buf.minY; y <= buf.maxY; y++) {
    const row = y * bw
    for (let x = buf.minX; x <= buf.maxX; x++) {
      const v = cells[row + x]
      if (v !== 0) m.set(row + x, v)
    }
  }
  return m
}

/** Everything the square-grid rasterizer reads from the stage for one drag. */
export interface SquareShapeParams {
  tool: string
  toolOpts: State['toolOpts']
  concentricRadii: number[]
  shapePaint: State['shapePaint']
  fillStyle: State['fillStyle']
  /** Doc with the future palette (colors pre-resolved by the caller). */
  resolved: Doc
  vStroke: number
  vFillMain: number
  vFillSecond: number
  tipOffsets: [number, number][]
  symmetry: SymmetryState
  radialOpts: { fill: number; phase: number; twist: number } | undefined
  shapeLike: boolean
  hasHoles: boolean
}

function stampCell(buf: ShapeDragBuffer, i: number, v: number): void {
  buf.cells[i] = v
  const x = i % buf.bw
  const y = (i - x) / buf.bw
  if (x < buf.minX) buf.minX = x
  if (x > buf.maxX) buf.maxX = x
  if (y < buf.minY) buf.minY = y
  if (y > buf.maxY) buf.maxY = y
}

function stampTip(
  buf: ShapeDragBuffer,
  v: number,
  ax: number,
  ay: number,
  tips: [number, number][],
): void {
  const { bw, bh } = buf
  for (const [dx, dy] of tips) {
    const x = ax + dx
    const y = ay + dy
    if (x >= 0 && y >= 0 && x < bw && y < bh) stampCell(buf, y * bw + x, v)
  }
}

function holeFillFor(
  p: SquareShapeParams,
  buf: ShapeDragBuffer,
  a: [number, number],
  b: [number, number],
) {
  return p.shapeLike && p.hasHoles
    ? fillCellsEvenOdd(
        shapePathLoops(p.tool as never, a[0], a[1], b[0], b[1], {
          ...p.toolOpts,
          circles: p.concentricRadii,
        }),
        buf.bw,
        buf.bh,
      )
    : null
}

/** Fill + aligned stroke of one rasterized copy (the typed emitSquareCopy). */
function emitCopy(
  buf: ShapeDragBuffer,
  p: SquareShapeParams,
  outlinePts: [number, number][],
  holeInside: Set<number> | null,
): void {
  const { bw } = buf
  const outlineSet = new Set(outlinePts.map(([x, y]) => y * bw + x))
  const needRegion = p.shapePaint.fill !== 'none' || p.shapePaint.align !== 'center'
  const mask =
    holeInside === null && needRegion
      ? regionMask(outlineSet, bw, buf.bh, regionMaskScratch(bw * buf.bh))
      : null
  const ctx = { buf, p, outlineSet, mask, holeInside }
  if (p.shapePaint.fill !== 'none') fillCopy(ctx, outlinePts)
  if (p.shapePaint.stroke) strokeCopy(ctx, outlinePts)
}

/** Region context one copy's fill/stroke emitters share. */
interface CopyCtx {
  buf: ShapeDragBuffer
  p: SquareShapeParams
  outlineSet: Set<number>
  mask: ReturnType<typeof regionMask> | null
  holeInside: Set<number> | null
}

/** Exterior test: outside the flood window counts as exterior. */
function outsideAt(ctx: CopyCtx, x: number, y: number): boolean {
  const { mask } = ctx
  if (!mask) return true
  const lx = x - mask.minX
  const ly = y - mask.minY
  if (lx < 0 || ly < 0 || lx >= mask.w || ly >= mask.h) return true
  return mask.outside[ly * mask.w + lx] === 1
}

/** Interior test: hole shapes use their even-odd set, the rest the flood complement. */
function insideAt(ctx: CopyCtx, x: number, y: number): boolean {
  const { holeInside, outlineSet } = ctx
  const i = y * ctx.buf.bw + x
  if (holeInside) return holeInside.has(i)
  return !outsideAt(ctx, x, y) && !outlineSet.has(i)
}

/**
 * Cells the fill covers: hole shapes fill by their even-odd set (flood-inside would include the
 * holes); regular shapes cover the flood interior plus the outline — the boundary belongs to the
 * fill, so with the stroke off the silhouette stays closed.
 */
function fillTargets(ctx: CopyCtx): number[] {
  const { holeInside, outlineSet, mask, buf } = ctx
  const out: number[] = []
  if (holeInside) {
    for (const i of holeInside) out.push(i)
    for (const i of outlineSet) out.push(i)
    return out
  }
  if (!mask) return out
  for (let ly = 0; ly < mask.h; ly++) {
    for (let lx = 0; lx < mask.w; lx++) {
      if (mask.outside[ly * mask.w + lx] !== 0) continue
      out.push((mask.minY + ly) * buf.bw + mask.minX + lx)
    }
  }
  return out
}

function fillCopy(ctx: CopyCtx, outlinePts: [number, number][]): void {
  const { buf, p } = ctx
  if (p.shapePaint.fill === 'pattern') {
    const seed = outlinePts[0][1] * buf.bw + outlinePts[0][0]
    const picks = applyFillStyle(p.fillStyle, fillTargets(ctx), seed, patternCoord(p.resolved))
    for (const [i, pick] of picks) stampCell(buf, i, pick === 1 ? p.vFillSecond : p.vFillMain)
    return
  }
  for (const i of fillTargets(ctx)) stampCell(buf, i, p.vFillMain)
}

function strokeCopy(ctx: CopyCtx, outlinePts: [number, number][]): void {
  const { buf, p } = ctx
  const { bw, bh } = buf
  for (const [px, py] of outlinePts) {
    for (const [dx, dy] of p.tipOffsets) {
      const x = px + dx
      const y = py + dy
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue
      // alignment filters the tip blob against the shape's own regions
      const keep =
        p.shapePaint.align === 'center'
          ? true
          : p.shapePaint.align === 'inner'
            ? !outsideAt(ctx, x, y)
            : !insideAt(ctx, x, y)
      if (keep) stampCell(buf, y * bw + x, p.vStroke)
    }
  }
}

function rasterize(p: SquareShapeParams, a: [number, number], b: [number, number]) {
  return p.tool === 'line'
    ? linePoints(a[0], a[1], b[0], b[1])
    : p.tool === 'rect'
      ? rectPoints(a[0], a[1], b[0], b[1], p.toolOpts)
      : p.shapeLike
        ? shapePathPoints(p.tool as never, a[0], a[1], b[0], b[1], {
            ...p.toolOpts,
            circles: p.concentricRadii,
          })
        : ellipsePoints(a[0], a[1], b[0], b[1], p.toolOpts)
}

/**
 * Rasterize the square-grid shape into the drag buffer: finite symmetry modes re-rasterize a
 * correctly drawn copy per transform, repeat/wallpaper modes classify the primary copy and expand
 * every kept cell through its orbit (orbit cap preserved). Endpoints must be snapped already.
 */
export function rasterSquareShape(
  buf: ShapeDragBuffer,
  s0: [number, number],
  s1: [number, number],
  p: SquareShapeParams,
): void {
  const transforms = symmetryTransforms(buf.bw, buf.bh, p.symmetry.mode, p.symmetry.n, p.radialOpts)
  if (transforms) {
    // finite modes: map the defining points through every copy and re-rasterize,
    // so each copy is a correctly drawn shape instead of a mirrored raster
    const copies: [number, number, number, number][] = [[s0[0], s0[1], s1[0], s1[1]]]
    for (const t of transforms) {
      const a = t(s0[0], s0[1])
      const b = t(s1[0], s1[1])
      copies.push([a[0], a[1], b[0], b[1]])
    }
    for (const [ax, ay, bx, by] of copies) {
      const a: [number, number] = [ax, ay]
      const b: [number, number] = [bx, by]
      if (p.shapeLike) {
        emitCopy(buf, p, rasterize(p, a, b), holeFillFor(p, buf, a, b))
      } else {
        for (const [px, py] of rasterize(p, a, b)) stampTip(buf, p.vStroke, px, py, p.tipOffsets)
      }
    }
    return
  }
  repeatShape(buf, s0, s1, p)
}

/**
 * Repeat/wallpaper modes: classify the primary copy, then expand every kept cell through its
 * symmetry orbit (the per-orbit stamp cap bounds a flick across the whole canvas).
 */
/**
 * Fill coverage of the primary repeat copy: hole shapes use their even-odd set, the rest the flood
 * interior plus the outline (the boundary belongs to the fill).
 */
function repeatFillTargets(
  buf: ShapeDragBuffer,
  mask: ReturnType<typeof regionMask>,
  hf: Set<number> | null,
  outlineSet: Set<number>,
): number[] {
  const out: number[] = []
  if (hf) {
    for (const i of hf) out.push(i)
    for (const i of outlineSet) out.push(i)
    return out
  }
  for (let ly = 0; ly < mask.h; ly++) {
    for (let lx = 0; lx < mask.w; lx++) {
      if (mask.outside[ly * mask.w + lx] !== 0) continue
      out.push((mask.minY + ly) * buf.bw + mask.minX + lx)
    }
  }
  return out
}

/** Line/outline-only repeat: every sampled outline cell expands through its orbit. */
function repeatTips(
  buf: ShapeDragBuffer,
  p: SquareShapeParams,
  outlinePts: [number, number][],
): void {
  const cap = Math.max(64, Math.floor(MAX_STAMPS / p.tipOffsets.length))
  for (const [px, py] of outlinePts) {
    const orbit = symmetryPoints(
      px,
      py,
      buf.bw,
      buf.bh,
      p.symmetry.mode,
      p.symmetry.n,
      p.symmetry.cell,
      p.radialOpts,
    )
    for (const [ox, oy] of orbit.slice(0, cap)) stampTip(buf, p.vStroke, ox, oy, p.tipOffsets)
  }
}

/** Aligned stroke of the primary repeat copy, expanded through orbits. */
function repeatStroke(
  buf: ShapeDragBuffer,
  p: SquareShapeParams,
  outlinePts: [number, number][],
  insideAt: (x: number, y: number) => boolean,
  outsideAt: (x: number, y: number) => boolean,
): void {
  const cap = Math.max(64, Math.floor(MAX_STAMPS / Math.max(1, p.tipOffsets.length)))
  for (const [px, py] of outlinePts) {
    for (const [dx, dy] of p.tipOffsets) {
      const x = px + dx
      const y = py + dy
      if (x < 0 || y < 0 || x >= buf.bw || y >= buf.bh) continue
      const keep =
        p.shapePaint.align === 'center'
          ? true
          : p.shapePaint.align === 'inner'
            ? !outsideAt(x, y)
            : !insideAt(x, y)
      if (!keep) continue
      for (const [ox, oy] of orbitOf(buf, p, x, y).slice(0, cap))
        stampCell(buf, oy * buf.bw + ox, p.vStroke)
    }
  }
}

/** Symmetry orbit of one cell, bounded by the repeat cap. */
function orbitOf(
  buf: ShapeDragBuffer,
  p: SquareShapeParams,
  x: number,
  y: number,
): [number, number][] {
  return symmetryPoints(
    x,
    y,
    buf.bw,
    buf.bh,
    p.symmetry.mode,
    p.symmetry.n,
    p.symmetry.cell,
    p.radialOpts,
  )
}

function repeatShape(
  buf: ShapeDragBuffer,
  s0: [number, number],
  s1: [number, number],
  p: SquareShapeParams,
): void {
  const outlinePts = rasterize(p, s0, s1)
  if (!p.shapeLike) return repeatTips(buf, p, outlinePts)
  const cap = Math.max(64, Math.floor(MAX_STAMPS / Math.max(1, p.tipOffsets.length)))
  const outlineSet = new Set(outlinePts.map(([x, y]) => y * buf.bw + x))
  const mask = regionMask(outlineSet, buf.bw, buf.bh, regionMaskScratch(buf.bw * buf.bh))
  const hf = holeFillFor(p, buf, s0, s1)
  const insideAt = (x: number, y: number): boolean => {
    if (hf) return hf.has(y * buf.bw + x)
    const i = y * buf.bw + x
    if (outlineSet.has(i)) return false
    const lx = x - mask.minX
    const ly = y - mask.minY
    if (lx < 0 || ly < 0 || lx >= mask.w || ly >= mask.h) return false
    return mask.outside[ly * mask.w + lx] === 0
  }
  const outsideAt = (x: number, y: number): boolean => {
    const lx = x - mask.minX
    const ly = y - mask.minY
    if (lx < 0 || ly < 0 || lx >= mask.w || ly >= mask.h) return true
    return mask.outside[ly * mask.w + lx] === 1
  }
  if (p.shapePaint.fill !== 'none') {
    const fillTargets = repeatFillTargets(buf, mask, hf, outlineSet)
    if (p.shapePaint.fill === 'pattern') {
      const seed = outlinePts[0][1] * buf.bw + outlinePts[0][0]
      const picks = applyFillStyle(p.fillStyle, fillTargets, seed, patternCoord(p.resolved))
      for (const [i, pick] of picks) {
        const x = i % buf.bw
        const y = (i - x) / buf.bw
        for (const [ox, oy] of orbitOf(buf, p, x, y).slice(0, cap))
          stampCell(buf, oy * buf.bw + ox, pick === 1 ? p.vFillSecond : p.vFillMain)
      }
    } else {
      for (const i of fillTargets) {
        const x = i % buf.bw
        const y = (i - x) / buf.bw
        for (const [ox, oy] of orbitOf(buf, p, x, y).slice(0, cap))
          stampCell(buf, oy * buf.bw + ox, p.vFillMain)
      }
    }
  }
  if (p.shapePaint.stroke) repeatStroke(buf, p, outlinePts, insideAt, outsideAt)
}

/** Materialize a shape drag's typed buffer into its commit Maps (once per drag). */
export function materializeShapeStaging(st: {
  cellsBuf?: { cells: Uint16Array; minX: number; minY: number; maxX: number; maxY: number }
  cells?: ReadonlyMap<number, number | null>
  objs?: ReadonlyMap<number, number | null>
}): void {
  const buf = st.cellsBuf
  if (!buf) return
  const cells = materializeShapeCells(buf as ShapeDragBuffer)
  const objs = new Map<number, number | null>()
  for (const i of cells.keys()) objs.set(i, PENDING_OBJ)
  st.cells = cells
  st.objs = objs
  st.cellsBuf = undefined
}
