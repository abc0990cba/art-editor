/**
 * Selection transforms (scale / rotate / flip) as nearest-neighbor cell remapping. Pure buffer
 * math: everything happens in the square sub-grid buffer (cell units), the caller owns reading the
 * doc and writing results back into the scene tree.
 *
 * The mapping is inverse-sampling: every target cell in the transformed bounding region asks "which
 * source cell owns my center?" — so upscaling fills solid instead of scattering holes.
 */

/** Buffer-space box: [x0, x1) × [y0, y1) in sub-grid cells. */
export interface CellBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * One committed transform of the selection's ink. Scale is anchored at `ax`/`ay` (buffer cells):
 * the box corner the drag pulled away from — without it the ink would always scale about the
 * center. Rotation and flips are about the box center.
 */
export type SelectionXform =
  | { kind: 'scale'; sx: number; sy: number; ax: number; ay: number }
  | { kind: 'rotate'; angle: number }
  | { kind: 'flip'; axis: 'x' | 'y' }

/** Inverse transform accessors in buffer cell coordinates. */
export interface XformMatrices {
  /** Source cell center → target position (for region bounds, link endpoints) */
  fwd: (x: number, y: number) => [number, number]
  /** Target cell center → source position (for sampling) */
  inv: (x: number, y: number) => [number, number]
}

/** Bounding box of every painted cell owned by the given ids, or null when there is no ink. */
export function selectionBox(
  cells: Uint16Array,
  cellObj: Uint32Array | null,
  ids: readonly number[],
  bw: number,
  bh: number,
): CellBox | null {
  if (!cellObj) return null
  const set = new Set(ids)
  let x0 = bw
  let y0 = bh
  let x1 = 0
  let y1 = 0
  let any = false
  for (let i = 0; i < cellObj.length; i++) {
    if (cells[i] <= 0 || !set.has(cellObj[i])) continue
    const x = i % bw
    const y = (i - x) / bw
    any = true
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x + 1 > x1) x1 = x + 1
    if (y + 1 > y1) y1 = y + 1
  }
  return any ? { x0, y0, x1, y1 } : null
}

/** Buffer-space matrices of one transform relative to the box (rotation is about the box center). */
export function xformMatrices(x: SelectionXform, box: CellBox): XformMatrices {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  if (x.kind === 'scale') {
    return {
      fwd: (px, py) => [x.ax + (px - x.ax) * x.sx, x.ay + (py - x.ay) * x.sy],
      inv: (px, py) => [x.ax + (px - x.ax) / x.sx, x.ay + (py - x.ay) / x.sy],
    }
  }
  if (x.kind === 'flip') {
    const fx = x.axis === 'x' ? -1 : 1
    const fy = x.axis === 'y' ? -1 : 1
    // a mirror is its own inverse
    return {
      fwd: (px, py) => [cx + (px - cx) * fx, cy + (py - cy) * fy],
      inv: (px, py) => [cx + (px - cx) * fx, cy + (py - cy) * fy],
    }
  }
  const cos = Math.cos(x.angle)
  const sin = Math.sin(x.angle)
  return {
    fwd: (px, py) => {
      const dx = px - cx
      const dy = py - cy
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
    },
    inv: (px, py) => {
      const dx = px - cx
      const dy = py - cy
      return [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos]
    },
  }
}

/** Target buffer region covering the transformed box (clamped to the buffer, at least 1 cell). */
export function xformRegion(box: CellBox, m: XformMatrices, bw: number, bh: number): CellBox {
  const corners: [number, number][] = [
    m.fwd(box.x0, box.y0),
    m.fwd(box.x1, box.y0),
    m.fwd(box.x1, box.y1),
    m.fwd(box.x0, box.y1),
  ]
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const x1 = Math.min(bw, Math.ceil(Math.max(...xs)))
  const y1 = Math.min(bh, Math.ceil(Math.max(...ys)))
  return { x0, y0, x1: Math.max(x0 + 1, x1), y1: Math.max(y0 + 1, y1) }
}

/** Flat snapshot of the selected ink: buffer index → palette value + owner id. */
export interface InkCell {
  v: number
  o: number
}

/** Snapshot of every painted cell owned by the given ids, or null when the selection has no ink. */
export function selectionInk(
  cells: Uint16Array,
  cellObj: Uint32Array | null,
  ids: readonly number[],
): Map<number, InkCell> | null {
  if (!cellObj) return null
  const sel = new Set(ids)
  const src = new Map<number, InkCell>()
  for (let i = 0; i < cellObj.length; i++) {
    const o = cellObj[i]
    if (o > 0 && sel.has(o) && cells[i] > 0) src.set(i, { v: cells[i], o })
  }
  return src.size === 0 ? null : src
}

/**
 * Nearest-neighbor remap: for every target cell in the region, sample the source cell under the
 * inverse-mapped center and keep its value + owner. Sampling outside the box picks nothing.
 */
export function mapInk(
  src: Map<number, InkCell>,
  m: XformMatrices,
  box: CellBox,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const region = xformRegion(box, m, bw, bh)
  const out = new Map<number, InkCell>()
  for (let ty = region.y0; ty < region.y1; ty++) {
    for (let tx = region.x0; tx < region.x1; tx++) {
      const [sx, sy] = m.inv(tx + 0.5, ty + 0.5)
      const fx = Math.floor(sx)
      const fy = Math.floor(sy)
      if (fx < box.x0 || fx >= box.x1 || fy < box.y0 || fy >= box.y1) continue
      const hit = src.get(fy * bw + fx)
      if (hit) out.set(ty * bw + tx, hit)
    }
  }
  return out
}
