import { buildGrid } from './builders.ts'
import type { Grid, GridType } from './index.ts'
import { rotatedGrid } from './rotate.ts'

const cache = new Map<string, Grid>()

/**
 * Cell lattice for a grid type. Square keeps the historical cols×rows lattice used by the square
 * pipelines; the other grids expose per-cell centers, polygons, hit-testing and generic
 * edge-neighbor maps so tools and rendering work on any cell shape.
 */
export function makeGrid(
  type: GridType,
  cols: number,
  rows: number,
  even = false,
  rotation = 0,
): Grid {
  const rot = ((rotation % 360) + 360) % 360
  const key = `${type}:${cols}:${rows}:${even ? 'e' : 'u'}:${rot}`
  let g = cache.get(key)
  if (!g) {
    g = buildGrid(type, cols, rows, even)
    if (rot !== 0) g = rotatedGrid(g, rot)
    cache.set(key, g)
  }
  return g
}
