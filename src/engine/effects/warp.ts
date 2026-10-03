/**
 * Warp / distort fields for pixel ink: bulge, fisheye, twirl, waves, zigzag, the polar remap and
 * seeded roughening. Pure buffer math over sparse ink maps — the same inverse-sampling contract as
 * selection-xform (every target cell asks which source cell owns its center), so the reversible
 * fields never scatter holes and the selection bake path consumes them unchanged. `roughen` is the
 * one forward op: it scatters boundary cells, which is the point.
 */

import { hash2 } from '../texture/core.ts'
import type { CellBox } from './selection-xform.ts'

/** The warp presets; all inverse-sampled except `roughen` (forward boundary scatter). */
export type WarpKind =
  | 'bulge'
  | 'fisheye'
  | 'twirl'
  | 'waveH'
  | 'waveV'
  | 'zigzag'
  | 'polar'
  | 'unpolar'
  | 'roughen'

export const WARP_KINDS = [
  'bulge',
  'fisheye',
  'twirl',
  'waveH',
  'waveV',
  'zigzag',
  'polar',
  'unpolar',
  'roughen',
] as const satisfies readonly WarpKind[]

/** Kinds whose field is the identity at amount 0 (polar is a pure remap, roughen is a scatter). */
const REVERSIBLE: readonly WarpKind[] = ['bulge', 'fisheye', 'twirl', 'waveH', 'waveV', 'zigzag']

/** Shared warp parameters; each preset reads what it needs. */
export interface WarpParams {
  /** Strength and direction in −100..100 (0 = identity for the reversible kinds) */
  amount: number
  /** Effect radius as % of the box half-diagonal (10..200) */
  radiusPct: number
  /** Wave/zigzag period in cells (2..256) */
  wavelength: number
  /** Roughen jitter source — same seed, same result */
  seed: number
}

export const DEFAULT_WARP_PARAMS: WarpParams = {
  amount: 40,
  radiusPct: 100,
  wavelength: 12,
  seed: 7,
}

const TAU = Math.PI * 2
const UINT32 = 4_294_967_296

/** Bounding box of the ink map itself (for callers without a full-buffer scan, e.g. node eval). */
export function inkBox(src: Map<number, unknown>, bw: number): CellBox | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const i of src.keys()) {
    const x = i % bw
    const y = (i - x) / bw
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x + 1 > x1) x1 = x + 1
    if (y + 1 > y1) y1 = y + 1
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : null
}

/** Clamped strength in −0.9..1: enough swing for a visible pinch, no degenerate power exponents. */
function strength(p: WarpParams): number {
  return Math.max(-0.9, Math.min(1, p.amount / 100))
}

/**
 * Inverse field of a warp: target cell center → source position (buffer cells). `roughen` has no
 * inverse field — callers route it through the forward scatter in `warpInk`.
 */
export function warpField(
  kind: Exclude<WarpKind, 'roughen'>,
  box: CellBox,
  p: WarpParams,
): (x: number, y: number) => [number, number] {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const W = Math.max(1, box.x1 - box.x0)
  const H = Math.max(1, box.y1 - box.y0)
  const R = Math.max(1, (Math.hypot(W / 2, H / 2) * p.radiusPct) / 100)
  const k = strength(p)
  const wl = Math.max(2, p.wavelength)

  if (kind === 'bulge') {
    // power-law radius pull: e > 1 samples from nearer the center → the middle magnifies
    const e = 1 + k
    return (x, y) => {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r < 1e-9 || r >= R) return [x, y]
      const scale = (r / R) ** (e - 1)
      return [cx + dx * scale, cy + dy * scale]
    }
  }
  if (kind === 'fisheye') {
    // quadratic falloff, stronger center than the power law; negative amount pinches
    const f = p.amount / 50
    return (x, y) => {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r < 1e-9 || r >= R) return [x, y]
      const t = r / R
      const denom = Math.max(0.05, 1 + f * (1 - t) * (1 - t))
      return [cx + dx / denom, cy + dy / denom]
    }
  }
  if (kind === 'twirl') {
    // rotation angle peaks at the center and eases out quadratically to the rim
    return (x, y) => {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r < 1e-9 || r >= R) return [x, y]
      const t = r / R
      const a = k * TAU * (1 - t) * (1 - t)
      const c = Math.cos(-a)
      const s = Math.sin(-a)
      return [cx + dx * c - dy * s, cy + dx * s + dy * c]
    }
  }
  if (kind === 'waveH') {
    const amp = (k * wl) / 2
    return (x, y) => [x - amp * Math.sin((TAU * (y - box.y0)) / wl), y]
  }
  if (kind === 'waveV') {
    const amp = (k * wl) / 2
    return (x, y) => [x, y - amp * Math.sin((TAU * (x - box.x0)) / wl)]
  }
  if (kind === 'zigzag') {
    // radial ripple: the radius itself oscillates, rings of the source become scallops
    const amp = (k * wl) / 3
    return (x, y) => {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r < 1e-9) return [x, y]
      const scale = (r - amp * Math.sin((TAU * r) / wl)) / r
      return [cx + dx * scale, cy + dy * scale]
    }
  }
  if (kind === 'polar') {
    // visual rect→polar: the strip wraps into a disc — inverse-sampled through the polar→rect map
    const Rfull = Math.max(1, H / 2)
    return (x, y) => {
      const a = Math.atan2(y - cy, x - cx)
      const r = Math.hypot(x - cx, y - cy)
      const sx = box.x0 + ((a + Math.PI) / TAU) * W
      const sy = box.y0 + (1 - r / Rfull) * H
      return [sx, sy]
    }
  }
  // 'unpolar': visual polar→rect — unrolls the disc back into the strip
  const Rfull = Math.max(1, H / 2)
  return (x, y) => {
    const u = (x - box.x0) / W
    const v = (y - box.y0) / H
    const a = u * TAU - Math.PI
    const r = (1 - v) * Rfull
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }
}

/**
 * Forward scatter of `roughen`: every boundary ink cell (an empty 4-neighbour) moves by a seeded
 * jitter, interior cells hold the body. Deterministic via hash2; collisions overwrite.
 */
function roughenInk<V>(src: Map<number, V>, p: WarpParams, bw: number, bh: number) {
  const amp = Math.max(1, Math.round((Math.abs(p.amount) / 100) * 5))
  const out = new Map(src)
  const at = (nx: number, ny: number) =>
    nx >= 0 && ny >= 0 && nx < bw && ny < bh && src.has(ny * bw + nx)
  const moved: { from: number; v: V; x: number; y: number }[] = []
  for (const [i, v] of src) {
    const x = i % bw
    const y = (i - x) / bw
    // interior holds: skip cells whose four 4-neighbours are all ink
    if (at(x + 1, y) && at(x - 1, y) && at(x, y + 1) && at(x, y - 1)) continue
    const jx = Math.round((hash2(x, y, p.seed) / UINT32 - 0.5) * 2 * amp)
    const jy = Math.round((hash2(x, y, p.seed + 101) / UINT32 - 0.5) * 2 * amp)
    if (jx === 0 && jy === 0) continue
    moved.push({ from: i, v, x: x + jx, y: y + jy })
  }
  for (const m of moved) out.delete(m.from)
  for (const m of moved) {
    if (m.x < 0 || m.y < 0 || m.x >= bw || m.y >= bh) continue
    out.set(m.y * bw + m.x, m.v)
  }
  return out
}

/**
 * Target region of a warp: the source box grown by the field's maximum displacement, clamped to the
 * buffer — twirl and the waves throw content past the original box, and the inverse sampler must
 * visit those targets or the effect clips its own output.
 */
function warpRegion(kind: WarpKind, box: CellBox, p: WarpParams, bw: number, bh: number): CellBox {
  const k = Math.abs(strength(p))
  const W = Math.max(1, box.x1 - box.x0)
  const H = Math.max(1, box.y1 - box.y0)
  const R = Math.max(1, (Math.hypot(W / 2, H / 2) * p.radiusPct) / 100)
  let margin = 0
  if (kind === 'waveH' || kind === 'waveV' || kind === 'zigzag')
    margin = Math.ceil((k * Math.max(2, p.wavelength)) / 2)
  else if (kind === 'twirl') margin = Math.ceil(0.47 * k * R)
  const x0 = Math.max(0, box.x0 - margin)
  const y0 = Math.max(0, box.y0 - margin)
  const x1 = Math.min(bw, box.x1 + margin)
  const y1 = Math.min(bh, box.y1 + margin)
  return { x0, y0, x1: Math.max(x0 + 1, x1), y1: Math.max(y0 + 1, y1) }
}

/** Buffer context of a warp: the ink box (sampling domain) plus the buffer it indexes into. */
export interface WarpSpace {
  box: CellBox
  bw: number
  bh: number
}

/**
 * Nearest-neighbor warp of the ink: every target cell in the (displacement-expanded) region samples
 * the source under the inverse-mapped center (forward scatter for `roughen`). Values pass through
 * untouched; sources outside the original box are never invented.
 */
export function warpInk<V>(
  src: Map<number, V>,
  kind: WarpKind,
  p: WarpParams,
  space: WarpSpace,
): Map<number, V> {
  const { box, bw, bh } = space
  if (src.size === 0) return new Map()
  if (kind === 'roughen') return roughenInk(src, p, bw, bh)
  const field = warpField(kind, box, p)
  const region = warpRegion(kind, box, p, bw, bh)
  const out = new Map<number, V>()
  for (let ty = region.y0; ty < region.y1; ty++) {
    for (let tx = region.x0; tx < region.x1; tx++) {
      const [sx, sy] = field(tx + 0.5, ty + 0.5)
      const fx = Math.floor(sx)
      const fy = Math.floor(sy)
      if (fx < box.x0 || fx >= box.x1 || fy < box.y0 || fy >= box.y1) continue
      const hit = src.get(fy * bw + fx)
      if (hit !== undefined) out.set(ty * bw + tx, hit)
    }
  }
  return out
}

/** True when the kind is a reversible inverse-sampled field (identity at amount 0). */
export function isReversibleWarp(kind: WarpKind): boolean {
  return REVERSIBLE.includes(kind)
}
