import { fillPointOk, type TextureCell } from './texture-region'

/**
 * Whole-figure silhouette space for the figure-level texture gap (gapMode 'figure'): a combined
 * occupancy index over every painted cell (all colors) plus the outer boundary segments of the
 * merged figure. Distances are exact Euclidean point-to-segment queries against a spatial bucket
 * grid, so the clean margin hugs the figure outline as one smooth band — including staircase
 * diagonals — while texture flows across internal color borders without seams.
 */

export interface FigureSpace {
  /** Doc-unit point inside the figure's tile envelope? */
  inside: (px: number, py: number) => boolean
  /** Exact distance from a doc-unit point to the figure's outer boundary. */
  edgeDist: (px: number, py: number) => number
}

/** Squared distance from a point to the flat segment `seg[i]..seg[i + 3]` (x0,y0,x1,y1). */
function segDist2(px: number, py: number, seg: number[], i: number): number {
  const x0 = seg[i]
  const y0 = seg[i + 1]
  const dx = seg[i + 2] - x0
  const dy = seg[i + 3] - y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2))
  const qx = x0 + t * dx - px
  const qy = y0 + t * dy - py
  return qx * qx + qy * qy
}

/** Bucket key of a tile coordinate pair (buckets are one tile wide). */
const bucketKey = (bx: number, by: number) => bx * 65_536 + by

/**
 * Build the silhouette space of a whole figure from every painted cell of every color. Boundary
 * segments sit on the tile edges facing empty space, so internal color borders are not boundaries.
 */
export function figureSpace(cells: TextureCell[], sub: number): FigureSpace {
  const index = new Map<number, number>()
  cells.forEach((c, k) => {
    index.set(Math.floor(c.cx0 * sub) * 65_536 + Math.floor(c.cy0 * sub), k)
  })
  const at = (bx: number, by: number) => index.get(bucketKey(bx, by))
  const inside = (px: number, py: number): boolean => {
    const k = at(Math.floor(px * sub), Math.floor(py * sub))
    return k !== undefined && fillPointOk(cells[k], px, py)
  }

  // boundary segments bucketed by tile; segments are tile-sized, so each lands in 1-4 buckets
  const B = 1 / sub
  const buckets = new Map<number, number[]>()
  const pushSeg = (bx: number, by: number, seg: number[]) => {
    const key = bucketKey(bx, by)
    const arr = buckets.get(key)
    if (arr) arr.push(...seg)
    else buckets.set(key, seg)
  }
  for (const c of cells) {
    const bx = Math.floor(c.cx0 * sub)
    const by = Math.floor(c.cy0 * sub)
    if (!at(bx - 1, by)) pushSeg(bx, by, [c.cx0, c.cy0, c.cx0, c.cy1])
    if (!at(bx + 1, by)) pushSeg(bx, by, [c.cx1, c.cy0, c.cx1, c.cy1])
    if (!at(bx, by - 1)) pushSeg(bx, by, [c.cx0, c.cy0, c.cx1, c.cy0])
    if (!at(bx, by + 1)) pushSeg(bx, by, [c.cx0, c.cy1, c.cx1, c.cy1])
  }
  const edgeDist = (px: number, py: number): number => {
    // walk a 5×5 tile neighborhood: exact within 2 tiles (covers every gap/band radius), and any
    // larger true distance only overestimates — comparisons against gap/band stay conservative
    const bx = Math.floor(px / B)
    const by = Math.floor(py / B)
    let best = Infinity
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const arr = buckets.get(bucketKey(bx + ox, by + oy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i += 4) {
          const d2 = segDist2(px, py, arr, i)
          if (d2 < best) best = d2
        }
      }
    }
    return Math.sqrt(best)
  }
  return { inside, edgeDist }
}
