import type { Grid } from '../../engine/grids.ts'

/**
 * Canvas grid overlays, kept out of CanvasStage to keep the component under its size ratchet: the
 * cached cell-polygon outline (non-square grids) and the prebuilt square-grid line paths. Overlays
 * never reach export — they are stroked on the canvas only.
 */

/** One Path2D containing every cell polygon of a non-square grid. */
export function cellPolygonOverlayPath(grid: Grid): Path2D {
  const p = new Path2D()
  for (let i = 0; i < grid.count; i++) {
    const poly = grid.polygon(i)
    p.moveTo(poly[0].x, poly[0].y)
    for (let k = 1; k < poly.length; k++) p.lineTo(poly[k].x, poly[k].y)
    p.closePath()
  }
  return p
}

/** Half-pitch guide lines between square-grid cells (midpoints of every sub-cell). */
export function halfCellGridPath(sub: number, w: number, h: number): Path2D {
  const pitch = 1 / (2 * sub)
  const p = new Path2D()
  for (let g = pitch; g < w - 1e-9; g += 2 * pitch) {
    p.moveTo(g, 0)
    p.lineTo(g, h)
  }
  for (let g = pitch; g < h - 1e-9; g += 2 * pitch) {
    p.moveTo(0, g)
    p.lineTo(w, g)
  }
  return p
}

/**
 * Square-grid lines as one prebuilt Path2D per role: up to ~3000 moveTo/lineTo segments per
 * direction on a 500×500 grid are far too costly to rebuild on every rendered frame. `half`
 * (diffusion guides) and `pixel` (sub-cells) are null when not applicable.
 */
export function squareGridLines(opts: {
  bw: number
  bh: number
  sub: number
  w: number
  h: number
  emphasis: number
  half: boolean
}): {
  cell: Path2D
  pixel: Path2D | null
  major: Path2D | null
  half: Path2D | null
} {
  const { bw, bh, sub, w, h, emphasis } = opts
  const cell = new Path2D()
  for (let x = 1; x < bw; x++) {
    cell.moveTo(x / sub, 0)
    cell.lineTo(x / sub, h)
  }
  for (let y = 1; y < bh; y++) {
    cell.moveTo(0, y / sub)
    cell.lineTo(w, y / sub)
  }
  let pixel: Path2D | null = null
  if (sub > 1) {
    pixel = new Path2D()
    for (let x = 1; x < w; x++) {
      pixel.moveTo(x, 0)
      pixel.lineTo(x, h)
    }
    for (let y = 1; y < h; y++) {
      pixel.moveTo(0, y)
      pixel.lineTo(w, y)
    }
  }
  // graph-paper major lines every N doc cells (gridEmphasis ≥ 2)
  let major: Path2D | null = null
  if (emphasis >= 2) {
    major = new Path2D()
    for (let x = emphasis; x < w; x += emphasis) {
      major.moveTo(x, 0)
      major.lineTo(x, h)
    }
    for (let y = emphasis; y < h; y += emphasis) {
      major.moveTo(0, y)
      major.lineTo(w, y)
    }
  }
  return {
    cell,
    pixel,
    major,
    half: opts.half ? halfCellGridPath(sub, w, h) : null,
  }
}
