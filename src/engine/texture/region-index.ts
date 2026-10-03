import type { TextureCell } from './region.ts'

/**
 * Spatial index and content digest of one same-color region. The index replaces the Map keyed by
 * packed tile coordinates with a dense Uint32Array over the region's bounding box: the scan, the
 * hatch flag tests and the halftone spray probe it millions of times on large regions, and array
 * reads are several times cheaper than hashed lookups. The digest turns a region into one number
 * for the fragment cache (same digest ⇒ same cells ⇒ identical seeded output).
 */

/** Read-only spatial lookup of one region's painted cells. */
export interface RegionIndex {
  /** Position of the region cell under a doc-unit point, or undefined outside the region. */
  locate(px: number, py: number): number | undefined
  /** Same lookup by buffer tile coordinates (the fast path of the scan's fits probe). */
  locateTile(bx: number, by: number): number | undefined
}

/** Dense bounding-box index of the region's tiles: O(1) probes, no hashing, no boxing. */
export function regionIndex(cells: TextureCell[], sub: number): RegionIndex {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cells) {
    const bx = Math.floor(((c.cx0 + c.cx1) / 2) * sub)
    const by = Math.floor(((c.cy0 + c.cy1) / 2) * sub)
    if (bx < minX) minX = bx
    if (bx > maxX) maxX = bx
    if (by < minY) minY = by
    if (by > maxY) maxY = by
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const data = new Uint32Array(w * h)
  cells.forEach((c, k) => {
    const bx = Math.floor(((c.cx0 + c.cx1) / 2) * sub) - minX
    const by = Math.floor(((c.cy0 + c.cy1) / 2) * sub) - minY
    data[by * w + bx] = k + 1
  })
  const locateTile = (bx: number, by: number): number | undefined => {
    const ix = bx - minX
    if (ix < 0 || ix >= w) return undefined
    const iy = by - minY
    if (iy < 0 || iy >= h) return undefined
    const k = data[iy * w + ix] - 1
    return k >= 0 ? k : undefined
  }
  return {
    locate(px: number, py: number): number | undefined {
      return locateTile(Math.floor(px * sub), Math.floor(py * sub))
    },
    locateTile,
  }
}

/* --------------------------------- FNV-1a digest --------------------------------- */

export const FNV_OFFSET = 0x81_1c_9d_c5
const FNV_PRIME = 0x01_00_01_93

/** Mix one 32-bit word into the running FNV-1a digest. */
export function fnvWord(acc: number, word: number): number {
  let h = Math.imul(acc ^ (word & 0xffff), FNV_PRIME)
  h = Math.imul(h ^ (word >>> 16), FNV_PRIME)
  return h >>> 0
}

const f64 = new Float64Array(1)
const i32 = new Int32Array(f64.buffer)

/** Mix one float into the digest by its exact IEEE-754 bit pattern. */
export function fnvFloat(acc: number, v: number): number {
  f64[0] = v
  let h = Math.imul(acc ^ i32[0], FNV_PRIME)
  h = Math.imul(h ^ i32[1], FNV_PRIME)
  return h >>> 0
}

/**
 * Digest of a region cell list. Covers every input the scan reads: tile positions and connectivity
 * as integer words (cheap in bulk), the fill rect size and corner fillets as exact float mixes (x/y
 * and the tile bounds are derived from these plus sub). Callers that already hold buffer
 * coordinates mix their own words inline instead and pass that digest.
 */
export function hashCells(cells: TextureCell[], sub: number): number {
  let acc = fnvWord(FNV_OFFSET, cells.length)
  acc = fnvWord(acc, sub)
  for (const c of cells) {
    acc = fnvWord(acc, Math.round(c.cx0 * sub))
    acc = fnvWord(acc, Math.round(c.cy0 * sub))
    acc = fnvFloat(acc, c.w)
    acc = fnvFloat(acc, c.radii[0])
    acc = fnvFloat(acc, c.radii[1])
    acc = fnvFloat(acc, c.radii[2])
    acc = fnvFloat(acc, c.radii[3])
    if (c.chamfer) acc = fnvWord(acc, 1)
    const flags =
      (c.connectedL ? 1 : 0) |
      (c.connectedT ? 2 : 0) |
      (c.connectedR ? 4 : 0) |
      (c.connectedB ? 8 : 0)
    acc = fnvWord(acc, flags)
  }
  return acc
}
