/**
 * Gooey ink transforms — metaball fusion and corner smoothing on ink maps. `blobifyInk` splats the
 * same power-law kernel as the metaball render mode (geometry/metaball-field.ts) from every ink
 * cell and keeps every cell of the padded box whose summed field reaches the iso level, so nearby
 * strokes fuse into rounded goo; added cells are attributed to their strongest single contributor.
 * `smoothenInk` is the additive complement of morpho's pixelPerfect: it fills the empty cell of any
 * 2×2 block whose other three cells are inked. Both are deterministic and integer-exact.
 */

import type { MetaballFalloff } from '../core/doc.ts'
import type { InkCell } from './selection-xform.ts'

/** Kernel falloff exponents, mirroring the metaball render mode's curves. */
const FALLOFF_POWER: Record<MetaballFalloff, number> = { tight: 3, smooth: 2, gooey: 1 }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Blobify kernel knobs. */
export interface BlobifyParams {
  /** Kernel radius in cells (1..8) */
  radius: number
  /** Field level that counts as inside, clamped to 0.2..0.9 like the render mode */
  iso: number
  /** Kernel falloff curve */
  falloff: MetaballFalloff
}

/**
 * Metaball fusion over the ink: one kernel per ink cell, every cell of the radius-padded bounding
 * box whose summed field reaches `iso` joins the blob with the value + owner of its strongest
 * contributor. Returns the complete merged ink (source cells always survive — their own kernel is
 * exactly 1).
 */
export function blobifyInk(
  src: Map<number, InkCell>,
  p: BlobifyParams,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const R = clamp(Math.round(p.radius), 1, 8)
  const iso = clamp(p.iso, 0.2, 0.9)
  const power = FALLOFF_POWER[p.falloff] ?? 3
  let bx0 = bw
  let by0 = bh
  let bx1 = -1
  let by1 = -1
  for (const [i] of src) {
    const x = i % bw
    const y = (i - x) / bw
    if (x < bx0) bx0 = x
    if (x > bx1) bx1 = x
    if (y < by0) by0 = y
    if (y > by1) by1 = y
  }
  const px0 = Math.max(0, bx0 - R)
  const py0 = Math.max(0, by0 - R)
  const px1 = Math.min(bw - 1, bx1 + R)
  const py1 = Math.min(bh - 1, by1 + R)
  const pw = px1 - px0 + 1
  const field = new Float32Array(pw * (py1 - py0 + 1))
  // f64 so an exactly-equal second kernel never compares greater than the stored first one
  const best = new Float64Array(field.length)
  const donor = new Int32Array(field.length).fill(-1)
  const R2 = R * R
  for (const [si] of src) {
    const sx = si % bw
    const sy = (si - sx) / bw
    for (let y = Math.max(py0, sy - R); y <= Math.min(py1, sy + R); y++) {
      const dy = y - sy
      for (let x = Math.max(px0, sx - R); x <= Math.min(px1, sx + R); x++) {
        const dx = x - sx
        const d2 = dx * dx + dy * dy
        if (d2 >= R2) continue
        const k = (1 - d2 / R2) ** power
        const fi = (y - py0) * pw + (x - px0)
        field[fi] += k
        if (k > best[fi]) {
          best[fi] = k
          donor[fi] = si
        }
      }
    }
  }
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) out.set(i, cell)
  for (let y = py0; y <= py1; y++) {
    for (let x = px0; x <= px1; x++) {
      const i = y * bw + x
      if (src.has(i)) continue
      const fi = (y - py0) * pw + (x - px0)
      if (field[fi] >= iso) {
        const d = donor[fi]
        if (d >= 0) out.set(i, src.get(d)!)
      }
    }
  }
  return out
}

/** Smoothen knobs. */
export interface SmoothenParams {
  /** Corner-fill passes (1..3) */
  passes: number
}

const DIAGONALS: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/** One corner-fill pass: judged against `cur`, returns a new map including the fills. */
function smoothenPass(cur: Map<number, InkCell>, bw: number, bh: number): Map<number, InkCell> {
  let x0 = bw
  let y0 = bh
  let x1 = -1
  let y1 = -1
  for (const [i] of cur) {
    const x = i % bw
    const y = (i - x) / bw
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const next = new Map(cur)
  for (let y = Math.max(0, y0); y <= Math.min(bh - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(bw - 1, x1); x++) {
      const i = y * bw + x
      if (cur.has(i)) continue
      for (const [dx, dy] of DIAGONALS) {
        const cx = x + dx
        const cy = y + dy
        if (cx < 0 || cx >= bw || cy < 0 || cy >= bh) continue
        if (cur.has(y * bw + cx) && cur.has(cy * bw + x) && cur.has(cy * bw + cx)) {
          next.set(i, cur.get(cy * bw + cx)!)
          break
        }
      }
    }
  }
  return next
}

/**
 * Corner smoothing: every empty cell whose 2×2 block holds the other three inked cells (any values)
 * becomes ink in the diagonal cell's value + owner. Each pass is judged against the previous pass's
 * output. Returns the complete ink including the fills.
 */
export function smoothenInk(
  src: Map<number, InkCell>,
  passes: number,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  let cur = src
  for (let pass = 0; pass < clamp(Math.round(passes), 1, 3); pass++) cur = smoothenPass(cur, bw, bh)
  return cur
}
