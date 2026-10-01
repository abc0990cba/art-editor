import type { Grid } from './grids.ts'
import type { Pt } from './marching-squares.ts'

/**
 * Whole-grid rotation: wraps a base lattice so it turns by `deg` around the canvas center. Geometry
 * (centers, polygons) rotates; `cellAt` rotates the point back into base space; the polar symmetry
 * helpers shift their angles by the same amount. Edge adjacency is index-based and computed on the
 * unrotated base, so it passes through untouched.
 *
 * The canvas extent grows to the bounding box of the turned rect (re-centered, so the lattice stays
 * symmetric in it): a 45° square ends exactly on the edge midpoints of a larger plate instead of
 * being cut mid-cell by the old rect. Like the radial grid, a rotated lattice still leaves the
 * canvas corners uncovered — `cellAt` returns -1 there. The radial lattice itself is a circle:
 * turning only shifts the sector phase, so its extent keeps the base size.
 */
export function rotatedGrid(base: Grid, deg: number): Grid {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const circle = base.type === 'radial'
  const w = circle ? base.w : base.w * Math.abs(cos) + base.h * Math.abs(sin)
  const h = circle ? base.h : base.w * Math.abs(sin) + base.h * Math.abs(cos)
  const dx = (w - base.w) / 2
  const dy = (h - base.h) / 2
  const cx = base.w / 2
  const cy = base.h / 2
  const rot = (p: Pt): Pt => ({
    x: dx + cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: dy + cy + (p.x - cx) * sin + (p.y - cy) * cos,
  })
  const unrot = (x: number, y: number): Pt => ({
    x: cx + (x - dx - cx) * cos + (y - dy - cy) * sin,
    y: cy - (x - dx - cx) * sin + (y - dy - cy) * cos,
  })
  return {
    type: base.type,
    cols: base.cols,
    rows: base.rows,
    w,
    h,
    count: base.count,
    center: (i) => rot(base.center(i)),
    polygon: (i) => base.polygon(i).map(rot),
    cellAt: (x, y) => {
      const p = unrot(x, y)
      return base.cellAt(p.x, p.y)
    },
    edgeNeighbors: base.edgeNeighbors,
    radiusOf: base.radiusOf,
    angleOf: (i) => base.angleOf(i) + a,
    // base scans by its own angles: query with the target un-rotated
    cellByAngle: (i, target) => base.cellByAngle(i, target - a),
    ringSectorOf: base.ringSectorOf ? (i) => base.ringSectorOf!(i) : undefined,
  }
}
