/**
 * Stylize post-ops on ink maps: outline, drop shadow and a dithered glow. Every function takes the
 * selection's ink snapshot (buffer index → value + owner, the `selection-xform` shape) and returns
 * only the ADDED cells — the caller merges them over the source and bakes through the usual
 * selection path. All ops are deterministic: the glow's density falloff is an ordered Bayer screen,
 * not randomness.
 */

import { BAYER8, thresholdAt } from './dither-matrices.ts'
import type { InkCell } from './selection-xform.ts'

/** One-click stylize ops offered by the selection menu. */
export type StylizeOp = 'outline' | 'shadow' | 'glow'

export interface StylizeParams {
  /** Glow reach in cells (1..16) */
  radius: number
  /** Shadow offset in cells */
  dx: number
  dy: number
}

export const DEFAULT_STYLIZE_PARAMS: StylizeParams = { radius: 3, dx: 1, dy: 1 }

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

/**
 * One-cell outline in `v` around the ink silhouette. 8-neighbourhood, so diagonal steps get
 * covered; existing ink is never overwritten.
 */
export function outlineInk(
  src: Map<number, InkCell>,
  v: number,
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
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
      const ni = ny * bw + nx
      if (src.has(ni) || out.has(ni)) continue
      out.set(ni, { v, o: cell.o })
    }
  }
  return out
}

/** Offset copy of the ink in `v`, minus where the ink itself sits — the shadow stays behind. */
export function dropShadowInk(
  src: Map<number, InkCell>,
  v: number,
  p: StylizeParams,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    const nx = x + p.dx
    const ny = y + p.dy
    if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
    const ni = ny * bw + nx
    if (src.has(ni)) continue
    out.set(ni, { v, o: cell.o })
  }
  return out
}

/**
 * Halo in `v` around the ink: ring k out of `radius` is kept where an 8×8 Bayer screen falls under
 * the tone 1 − k/(radius+1), so the glow fades as sparse dots instead of extra palette colors.
 */
export function glowInk(
  src: Map<number, InkCell>,
  v: number,
  radius: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const out = new Map<number, InkCell>()
  if (radius < 1) return out
  // BFS frontier records the chebyshev ring and the ink cell that discovered each halo cell
  const seen = new Map<number, { ring: number; owner: number }>()
  let frontier = [...src.keys()]
  for (const i of frontier) {
    const o = src.get(i)!.o
    seen.set(i, { ring: 0, owner: o })
  }
  for (let ring = 1; ring <= radius && frontier.length > 0; ring++) {
    const next: number[] = []
    const tone = 1 - ring / (radius + 1)
    for (const i of frontier) {
      const x = i % bw
      const y = (i - x) / bw
      const owner = seen.get(i)!.owner
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const ni = ny * bw + nx
        if (seen.has(ni)) continue
        seen.set(ni, { ring, owner })
        next.push(ni)
        if (thresholdAt(BAYER8, 8, 64, nx, ny) < tone) out.set(ni, { v, o: owner })
      }
    }
    frontier = next
  }
  return out
}

/** Apply one stylize op to an ink snapshot; returns the merged full ink (source + additions). */
export function stylizeInk(
  op: StylizeOp,
  src: Map<number, InkCell>,
  v: number,
  p: StylizeParams,
  space: { bw: number; bh: number },
): Map<number, InkCell> {
  const { bw, bh } = space
  const adds =
    op === 'outline'
      ? outlineInk(src, v, bw, bh)
      : op === 'shadow'
        ? dropShadowInk(src, v, p, bw, bh)
        : glowInk(src, v, Math.max(1, Math.min(16, Math.round(p.radius))), bw, bh)
  const full = new Map(src)
  for (const [i, cell] of adds) full.set(i, cell)
  return full
}
