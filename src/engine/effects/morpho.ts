/**
 * Pixel-art morphology post-ops on ink maps: block quantize, dilate/erode, stair cleanup, speck
 * removal, outline extraction, silhouette flatten, long shadow and CRT scanlines. Like `stylize`,
 * every function takes the selection's ink snapshot (the `selection-xform` shape) and the added/
 * replacement cells are baked by the caller through the usual selection path. All ops are
 * deterministic and integer-exact — no randomness, no anti-aliasing.
 */

import type { InkCell } from './selection-xform.ts'

/** One-click pixel ops offered by the selection menu. */
export type PixelOp =
  | 'blockify'
  | 'dilate'
  | 'erode'
  | 'pixelPerfect'
  | 'despeckle'
  | 'outlineOnly'
  | 'silhouette'
  | 'longShadow'
  | 'scanlines'

export interface PixelOpParams {
  /** Blockify block edge (2..8) · scanlines row period (2..8) · despeckle min blob size (2..6) */
  size: number
  /** Dilate/erode single-cell passes (1..4) */
  steps: number
  /** Long-shadow ray direction per axis, -1|0|1 (never both 0) */
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
}

export const DEFAULT_PIXEL_OP_PARAMS: PixelOpParams = { size: 2, steps: 1, dx: 1, dy: 1 }

const NEIGHBORS8: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

/** Quantize the ink to n×n snapped blocks: any painted cells turn the block into the majority value. */
export function blockifyInk(
  src: Map<number, InkCell>,
  n: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const out = new Map<number, InkCell>()
  const block = Math.max(2, Math.min(8, Math.round(n)))
  // per block: value → count, plus a representative owner per value (block keys: gy<<14 | gx,
  // safe — the largest buffer is 12288 cells wide, so gx < 6144)
  const counts = new Map<number, Map<number, number>>()
  const owners = new Map<number, Map<number, number>>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    const key = Math.floor(y / block) * 16384 + Math.floor(x / block)
    let per = counts.get(key)
    if (!per) counts.set(key, (per = new Map()))
    per.set(cell.v, (per.get(cell.v) ?? 0) + 1)
    let own = owners.get(key)
    if (!own) owners.set(key, (own = new Map()))
    if (!own.has(cell.v)) own.set(cell.v, cell.o)
  }
  for (const [key, per] of counts) {
    let bestV = 0
    let bestN = 0
    for (const [v, c] of per) {
      // ties resolve to the smaller palette value: stable and independent of map order
      if (c > bestN || (c === bestN && v < bestV)) {
        bestV = v
        bestN = c
      }
    }
    const gy = Math.floor(key / 16384)
    const gx = key - gy * 16384
    for (let y = gy * block; y < Math.min((gy + 1) * block, bh); y++) {
      for (let x = gx * block; x < Math.min((gx + 1) * block, bw); x++) {
        out.set(y * bw + x, { v: bestV, o: owners.get(key)!.get(bestV)! })
      }
    }
  }
  return out
}

/** Grow the ink into empty 8-neighbors, one cell per pass; new cells inherit value + owner. */
export function dilateInk(
  src: Map<number, InkCell>,
  steps: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  let cur = src
  for (let s = 0; s < clampInt(steps, 1, 4); s++) {
    const next = new Map(cur)
    for (const [i, cell] of cur) {
      const x = i % bw
      const y = (i - x) / bw
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const ni = ny * bw + nx
        if (!next.has(ni)) next.set(ni, cell)
      }
    }
    cur = next
  }
  return cur
}

/** Shrink the ink by removing border cells (any empty 8-neighbor), one layer per pass. */
export function erodeInk(
  src: Map<number, InkCell>,
  steps: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  let cur = src
  for (let s = 0; s < clampInt(steps, 1, 4); s++) {
    const next = new Map<number, InkCell>()
    for (const [i, cell] of cur) {
      const x = i % bw
      const y = (i - x) / bw
      let border = false
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !cur.has(ny * bw + nx)) {
          border = true
          break
        }
      }
      if (!border) next.set(i, cell)
    }
    cur = next
  }
  return cur
}

/**
 * Classic pixel-perfect stair cleanup: drop every pixel whose two orthogonal neighbors are inked
 * while the diagonal between them is empty — the corner pixel that turns a clean diagonal into a
 * jaggy step. Removals are judged against the input snapshot, so one pass never cascades.
 */
export function pixelPerfectInk(
  src: Map<number, InkCell>,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const inked = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && src.has(y * bw + x)
  const out = new Map(src)
  for (const [i] of src) {
    const x = i % bw
    const y = (i - x) / bw
    const stair =
      (inked(x - 1, y) && inked(x, y - 1) && !inked(x - 1, y - 1)) ||
      (inked(x + 1, y) && inked(x, y - 1) && !inked(x + 1, y - 1)) ||
      (inked(x + 1, y) && inked(x, y + 1) && !inked(x + 1, y + 1)) ||
      (inked(x - 1, y) && inked(x, y + 1) && !inked(x - 1, y + 1))
    if (stair) out.delete(i)
  }
  return out
}

/** Remove connected components (8-neighborhood, per value) smaller than `min` cells. */
export function despeckleInk(
  src: Map<number, InkCell>,
  min: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const keep = new Map<number, InkCell>()
  const seen = new Set<number>()
  for (const start of src.keys()) {
    if (seen.has(start)) continue
    const v = src.get(start)!.v
    const comp: number[] = [start]
    seen.add(start)
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k]
      const x = i % bw
      const y = (i - x) / bw
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const ni = ny * bw + nx
        if (seen.has(ni) || src.get(ni)?.v !== v) continue
        seen.add(ni)
        comp.push(ni)
      }
    }
    if (comp.length >= clampInt(min, 2, 6)) {
      for (const i of comp) keep.set(i, src.get(i)!)
    }
  }
  return keep
}

/** Keep only the boundary cells — every pixel with at least one empty 8-neighbor. */
export function outlineOnlyInk(
  src: Map<number, InkCell>,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !src.has(ny * bw + nx)) {
        out.set(i, cell)
        break
      }
    }
  }
  return out
}

/** Flatten every cell to one palette value (owners survive for per-element styling). */
export function silhouetteInk(src: Map<number, InkCell>, v: number): Map<number, InkCell> {
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) out.set(i, { v, o: cell.o })
  return out
}

/** Project a hard ray from every ink cell along (dx, dy) until the bounds or other ink stop it. */
export function longShadowInk(
  src: Map<number, InkCell>,
  v: number,
  p: PixelOpParams,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const dx = Math.max(-1, Math.min(1, Math.round(p.dx)))
  const dy = Math.max(-1, Math.min(1, Math.round(p.dy)))
  const out = new Map<number, InkCell>()
  if (dx === 0 && dy === 0) return out
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    for (
      let cx = x + dx, cy = y + dy;
      cx >= 0 && cy >= 0 && cx < bw && cy < bh;
      cx += dx, cy += dy
    ) {
      const ci = cy * bw + cx
      if (src.has(ci)) break
      out.set(ci, { v, o: cell.o })
    }
  }
  return out
}

/** CRT scanlines: recolor every `period`-th buffer row of the ink to `v`. */
export function scanlinesInk(
  src: Map<number, InkCell>,
  v: number,
  period: number,
  bw: number,
): Map<number, InkCell> {
  const step = clampInt(period, 2, 8)
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const y = (i - (i % bw)) / bw
    out.set(i, y % step === 0 ? { v, o: cell.o } : cell)
  }
  return out
}

/** Apply one pixel op to an ink snapshot; returns the merged full ink (source + modifications). */
export function pixelOpInk(
  op: PixelOp,
  src: Map<number, InkCell>,
  v: number,
  p: PixelOpParams,
  space: { bw: number; bh: number },
): Map<number, InkCell> {
  const { bw, bh } = space
  let result: Map<number, InkCell>
  switch (op) {
    case 'blockify': {
      result = blockifyInk(src, p.size, bw, bh)
      break
    }
    case 'dilate': {
      result = dilateInk(src, p.steps, bw, bh)
      break
    }
    case 'erode': {
      result = erodeInk(src, p.steps, bw, bh)
      break
    }
    case 'pixelPerfect': {
      result = pixelPerfectInk(src, bw, bh)
      break
    }
    case 'despeckle': {
      result = despeckleInk(src, p.size, bw, bh)
      break
    }
    case 'outlineOnly': {
      result = outlineOnlyInk(src, bw, bh)
      break
    }
    case 'silhouette': {
      result = silhouetteInk(src, v)
      break
    }
    case 'longShadow': {
      result = longShadowInk(src, v, p, bw, bh)
      break
    }
    case 'scanlines': {
      result = scanlinesInk(src, v, p.size, bw)
      break
    }
  }
  // shrinking ops replace the ink wholesale; additive ops merge over the source
  const replacing =
    op === 'blockify' ||
    op === 'pixelPerfect' ||
    op === 'despeckle' ||
    op === 'outlineOnly' ||
    op === 'silhouette' ||
    op === 'erode'
  if (replacing) return result
  const full = new Map(src)
  for (const [i, cell] of result) full.set(i, cell)
  return full
}
