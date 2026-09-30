import type { Grid } from './grids.ts'
import type { Pt } from './marching-squares.ts'

/**
 * Whole-grid rotation: wraps a base lattice so it turns by `deg` around the canvas center. Geometry
 * (centers, polygons) rotates; `cellAt` rotates the point back into base space; the polar symmetry
 * helpers shift their angles by the same amount. Edge adjacency is index-based and computed on the
 * unrotated base, so it passes through untouched. The canvas extent stays the base rect — like the
 * radial grid, a rotated lattice simply leaves the corners uncovered.
 */
export function rotatedGrid(base: Grid, deg: number): Grid {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const cx = base.w / 2
  const cy = base.h / 2
  const rot = (p: Pt): Pt => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  })
  const unrot = (x: number, y: number): Pt => ({
    x: cx + (x - cx) * cos + (y - cy) * sin,
    y: cy - (x - cx) * sin + (y - cy) * cos,
  })
  return {
    type: base.type,
    cols: base.cols,
    rows: base.rows,
    w: base.w,
    h: base.h,
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
