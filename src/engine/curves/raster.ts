/**
 * Path → cells rasterization: flatten to a dense polyline, Bresenham-walk it, and stamp the
 * centered circle brush of the requested width on every walked cell (so width N is exactly the
 * pencil's size-N circle tip). Closed paths fill their interior by flood classification around the
 * width-1 center line. Deterministic — the parametric `source.bezier` node replays this.
 */

import { brushOffsets, circleBrush } from '../paint/brush.ts'
import { regionCells } from '../shapes/fill.ts'
import { linePoints } from '../shapes/lines.ts'
import { flattenPath } from './flatten.ts'
import type { CurvePath } from './model.ts'

export interface PenRasterOpts {
  /** Stroke thickness in cells; 1 = the bare center line. */
  width?: number
  /** Fill the interior of a closed path in addition to the stroke. */
  fill?: boolean
}

/** The stroke skeleton's cells (width 1), Bresenham-connected through the flattened points. */
export function pathStrokeLine(path: CurvePath): [number, number][] {
  const poly = flattenPath(path)
  if (poly.length === 0) return []
  const pts = new Map<string, [number, number]>()
  let px = Math.round(poly[0][0])
  let py = Math.round(poly[0][1])
  pts.set(`${px},${py}`, [px, py])
  for (let i = 1; i < poly.length; i++) {
    const qx = Math.round(poly[i][0])
    const qy = Math.round(poly[i][1])
    if (qx === px && qy === py) continue
    for (const [lx, ly] of linePoints(px, py, qx, qy)) pts.set(`${lx},${ly}`, [lx, ly])
    px = qx
    py = qy
  }
  return [...pts.values()]
}

/**
 * Every cell the path inks on a square buffer of bw×bh: the width-W stroke, plus the interior when
 * `fill` is set and the path is closed. Clipped to the buffer.
 */
export function pathCells(
  path: CurvePath,
  bw: number,
  bh: number,
  opts: PenRasterOpts = {},
): Set<number> {
  const ink = pathInk(path, bw, bh, opts)
  for (const i of ink.fill) ink.stroke.add(i)
  return ink.stroke
}

/** Stroke and interior as separate cell sets, so callers can paint them in two colors. */
export interface PathInk {
  /** The width-W stroke */
  stroke: Set<number>
  /** Interior of a closed path, outline cells excluded (empty for open paths) */
  fill: Set<number>
}

/** The split variant of `pathCells`: fill is computed from the width-1 center line. */
export function pathInk(
  path: CurvePath,
  bw: number,
  bh: number,
  opts: PenRasterOpts = {},
): PathInk {
  const width = Math.max(1, Math.round(opts.width ?? 1))
  const wantFill = (opts.fill ?? false) && path.closed
  const stroke = new Set<number>()
  const fill = new Set<number>()
  if (path.anchors.length === 0 || bw <= 0 || bh <= 0) return { stroke, fill }
  const line = pathStrokeLine(path)
  const stamp = circleBrush(width)
  const off = Math.floor((stamp.size - 1) / 2)
  const put = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < bw && y < bh) stroke.add(y * bw + x)
  }
  for (const [x, y] of line) {
    for (const [ox, oy] of brushOffsets(stamp)) put(x + ox - off, y + oy - off)
  }
  if (wantFill && line.length > 0) {
    const lineSet = new Set<number>()
    for (const [x, y] of line) {
      if (x >= 0 && y >= 0 && x < bw && y < bh) lineSet.add(y * bw + x)
    }
    for (const i of regionCells(lineSet, bw, bh).inside) fill.add(i)
  }
  return { stroke, fill }
}
