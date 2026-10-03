import type { Grid } from '../../engine/grids/index.ts'

/**
 * Inclusive integer Bresenham walk from one buffer cell to another: every cell the pointer crossed
 * between two move events, so fast drags lay a continuous stroke instead of sparse dots.
 */
export function lineAnchors(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    out.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return out
}

/**
 * Buffer cells a pencil/eraser stroke covers between two pointer positions: Bresenham anchors on
 * square grids, doc-space sampling through the grid lookup on lattices. Deduplicated, endpoints
 * included; invalid endpoints pass the target through so the caller still stamps one cell.
 */
export function strokeLineCells(
  fromIdx: number,
  toIdx: number,
  isSquare: boolean,
  bw: number,
  grid: Grid,
): number[] {
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return [toIdx]
  if (isSquare) {
    const fx = fromIdx % bw
    const fy = (fromIdx - fx) / bw
    const tx = toIdx % bw
    const ty = (toIdx - tx) / bw
    return lineAnchors(fx, fy, tx, ty).map(([x, y]) => y * bw + x)
  }
  const a = grid.center(fromIdx)
  const b = grid.center(toIdx)
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2))
  const out: number[] = []
  let last = -1
  for (let s = 0; s <= steps; s++) {
    const idx = grid.cellAt(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps)
    if (idx >= 0 && idx !== last) {
      last = idx
      out.push(idx)
    }
  }
  return out
}
