/** Rasterized shape outlines in integer buffer coordinates. */

import { boxShapePolylines } from './shape-box.ts'
import { arrowPolylines, wavePolylines, zigzagPolylines } from './shape-flow.ts'
import { polylineCells } from './shape-lines.ts'
import type { ShapeOpts, ShapeToolId } from './shape-tools.ts'
import type { Polyline } from './shape-util.ts'

export { ellipsePoints, linePoints, rectPoints } from './shape-lines.ts'
export { DEFAULT_CONCENTRIC_RADII, hasDefaultConcentricRadii } from './shape-radial.ts'
export { isShapeTool, SHAPE_TOOLS } from './shape-tools.ts'
export type { ShapeOpts, ShapeToolId } from './shape-tools.ts'

/**
 * Outline pieces of a shape in the coordinates of its defining drag (start a → end b). Parametric
 * shapes sample at `steps` vertices; when omitted the count adapts to the shape size.
 */
export function shapePathSegments(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): Polyline[] {
  if (tool === 'arrow') return arrowPolylines(ax, ay, bx, by, opts)
  if (tool === 'wave') return wavePolylines([ax, ay], [bx, by], opts, steps ?? 128)
  if (tool === 'zigzag') return zigzagPolylines(ax, ay, bx, by, opts)
  const x0 = Math.min(ax, bx)
  const y0 = Math.min(ay, by)
  const w = Math.abs(bx - ax)
  const h = Math.abs(by - ay)
  const n = steps ?? Math.max(32, Math.min(512, Math.ceil((w + h) * 3)))
  return boxShapePolylines(tool, opts, n).map((poly) =>
    poly.map(([nx, ny]) => [x0 + nx * w, y0 + ny * h] as [number, number]),
  )
}

/** Integer-cell outline of a shape for the square grid, traced with Bresenham. */
export function shapePathPoints(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): [number, number][] {
  const segs = shapePathSegments(tool, ax, ay, bx, by, opts, steps)
  return polylineCells(segs)
}

/** Tools whose outline includes nested loops that must read as holes when filled. */
export function shapeHasHoles(tool: ShapeToolId): boolean {
  return tool === 'skull'
}

/**
 * Integer-cell outline loops of a shape, one entry per polyline (holes included as their own
 * loops). Union over the entries equals shapePathPoints; hole-aware fills run even-odd across the
 * entries instead.
 */
export function shapePathLoops(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): Polyline[] {
  return shapePathSegments(tool, ax, ay, bx, by, opts, steps).map((poly) => polylineCells([poly]))
}
