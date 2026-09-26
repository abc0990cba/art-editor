import type { TextureSettings } from './doc'

/**
 * Shared primitives of the texture family: hashing / PRNG, path formatting, fleck emitters and the
 * speck distributions (scatter, clumps, perlin, voronoi, streaks). Everything here is pure and
 * platform-independent, so baked patterns stay identical across canvas, PNG and SVG export.
 */

/** Max flecks per region / metaball blob — bounds path data size. */
export const MAX_REGION_FLECKS = 20_000

/** Marching-squares threshold used by metaball mode. */
export const ISO = 0.5

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/** 32-bit mix of two integer keys and a seed → PRNG / noise input. */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 0x9e_37_79_b1) ^
      Math.imul(y | 0, 0x85_eb_ca_6b) ^
      Math.imul(seed + 1, 0xc2_b2_ae_35)) |
    0
  h = Math.imul(h ^ (h >>> 16), 2_246_822_507)
  h = Math.imul(h ^ (h >>> 13), 3_266_489_909)
  return (h ^ (h >>> 16)) >>> 0
}

/** Hash2 folded into a single-key form (cell index → PRNG seed). */
export function hash(key: number, seed: number): number {
  return hash2(key, key >>> 16, seed)
}

/** Mulberry32: tiny, fast, identical output on every platform. */
export function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Compact axis-aligned square fleck: `M x y h s v s h -s z`. */
function squareFleck(fx: number, fy: number, side: number): string {
  return `M${fmt(fx)} ${fmt(fy)}h${fmt(side)}v${fmt(side)}h${fmt(-side)}z`
}

/** Compact circle fleck from its center: two arcs. */
export function circleFleck(cx: number, cy: number, r: number): string {
  return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0z`
}

/**
 * Fleck emission for the configured shape. `a` is the bounding-box side; chips are squares rotated
 * by `rot` radians with their AABB kept equal to `a`, so the non-overlap lattice invariant holds
 * for every rotation.
 */
export function emitFleck(
  shape: TextureSettings['shape'],
  fx: number,
  fy: number,
  a: number,
  rot: number,
): string {
  if (shape === 'dot') return circleFleck(fx + a / 2, fy + a / 2, a / 2)
  if (shape === 'chip' && rot > 0) {
    const cx = fx + a / 2
    const cy = fy + a / 2
    const s = a / (Math.cos(rot) + Math.sin(rot))
    const h = s / 2
    const ca = Math.cos(rot)
    const sa = Math.sin(rot)
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca])
    return `M${fmt(corners[0][0])} ${fmt(corners[0][1])}${corners
      .slice(1)
      .map(([x, y]) => `L${fmt(x)} ${fmt(y)}`)
      .join('')}z`
  }
  return squareFleck(fx, fy, a)
}

/** Smooth bilinear value noise on an integer lattice, 0..1. */
export function valueNoise(gx: number, gy: number, seed: number): number {
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const v = (a: number, b: number) => hash2(a, b, seed) / 4_294_967_296
  return (
    (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) +
    (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy
  )
}

/**
 * Probability multiplier for a candidate speck at doc-unit position (x, y): scatter = uniform;
 * clumps = single-octave stains; perlin = 3-octave fractal noise for natural multi-scale mottling;
 * voronoi = seeded stain colonies; streaks = directional wear bands along the configured angle.
 */
export function distWeight(t: TextureSettings, x: number, y: number, pitch: number): number {
  if (t.dist === 'clumps') {
    return clamp(0.1 + 1.8 * valueNoise(x / (pitch * 3), y / (pitch * 3), t.seed), 0, 1)
  }
  if (t.dist === 'perlin') {
    const n =
      0.5 * valueNoise(x / (pitch * 3.2), y / (pitch * 3.2), t.seed) +
      0.3 * valueNoise(x / (pitch * 1.6), y / (pitch * 1.6), t.seed + 101) +
      0.2 * valueNoise(x / (pitch * 0.8), y / (pitch * 0.8), t.seed + 211)
    return clamp(0.12 + 1.76 * n, 0, 1)
  }
  if (t.dist === 'voronoi') {
    const step = pitch * 5
    const ix = Math.floor(x / step)
    const iy = Math.floor(y / step)
    let w = 0.08
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const lx = ix + ox
        const ly = iy + oy
        const r1 = hash2(lx, ly, t.seed) / 4_294_967_296
        const r2 = hash2(lx, ly, t.seed + 17) / 4_294_967_296
        const r3 = hash2(lx, ly, t.seed + 53) / 4_294_967_296
        const px = (lx + 0.15 + 0.7 * r1) * step
        const py = (ly + 0.15 + 0.7 * r2) * step
        const radius = step * (0.6 + 0.8 * r3)
        const dx = x - px
        const dy = y - py
        const d2 = (dx * dx + dy * dy) / (radius * radius)
        if (d2 < 1) w = Math.max(w, (0.6 + 0.5 * r2) * (1 - d2 * d2))
      }
    }
    return Math.min(1, w)
  }
  if (t.dist === 'streaks') {
    const theta = (clamp(t.angle, 0, 180) * Math.PI) / 180
    const phase = (t.seed % 7) * 0.9
    const s = (x * Math.cos(theta) + y * Math.sin(theta)) / pitch
    return clamp(0.85 + 0.55 * Math.sin((s * 2 * Math.PI) / 3 + phase), 0.15, 1)
  }
  return 1
}
