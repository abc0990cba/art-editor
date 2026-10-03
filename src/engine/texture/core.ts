import type { TextureSettings } from '../core/doc'

/**
 * Shared primitives of the texture family: hashing / PRNG, path formatting, fleck emitters and
 * noise. Everything here is pure and platform-independent, so baked patterns stay identical across
 * canvas, PNG and SVG export. Speck distributions live in `texture-patterns`.
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
 * by `rot` radians with their AABB kept equal to `a`, and every other rotated silhouette stays
 * inside its circumscribed circle, so the non-overlap lattice invariant holds for all shapes.
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
    // side shrunk so the rotated AABB stays equal to a
    const h = a / (2 * (Math.cos(rot) + Math.sin(rot)))
    return polyFleck(
      turnPts(
        fx + a / 2,
        fy + a / 2,
        [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
        ],
        rot,
      ),
    )
  }
  if (shape === 'triangle')
    return polyFleck(ringPts(fx + a / 2, fy + a / 2, [a / 2, a / 2, a / 2], rot - Math.PI / 2))
  if (shape === 'star') {
    const R = a / 2
    const radii = [R, a / 5, R, a / 5, R, a / 5, R, a / 5, R, a / 5]
    return polyFleck(ringPts(fx + a / 2, fy + a / 2, radii, rot))
  }
  if (shape === 'hex')
    return polyFleck(
      ringPts(fx + a / 2, fy + a / 2, [a / 2, a / 2, a / 2, a / 2, a / 2, a / 2], rot),
    )
  if (shape === 'diamond') {
    const cx = fx + a / 2
    const cy = fy + a / 2
    return polyFleck([
      [cx, fy],
      [fx + a, cy],
      [cx, fy + a],
      [fx, cy],
    ])
  }
  if (shape === 'cross') {
    const hw = a * 0.18
    const A = a / 2
    const p: [number, number][] = [
      [-hw, -A],
      [hw, -A],
      [hw, -hw],
      [A, -hw],
      [A, hw],
      [hw, hw],
      [hw, A],
      [-hw, A],
      [-hw, hw],
      [-A, hw],
      [-A, -hw],
      [-hw, -hw],
    ]
    return polyFleck(turnPts(fx + a / 2, fy + a / 2, p, rot))
  }
  if (shape === 'ring') {
    return circleFleck(fx + a / 2, fy + a / 2, a / 2) + circleFleck(fx + a / 2, fy + a / 2, a / 4)
  }
  if (shape === 'dash') {
    // short bar through the box center, inside the circumscribed circle at every rotation
    const hl = a * 0.46
    const hh = a * 0.18
    return polyFleck(
      turnPts(
        fx + a / 2,
        fy + a / 2,
        [
          [-hl, -hh],
          [hl, -hh],
          [hl, hh],
          [-hl, hh],
        ],
        rot,
      ),
    )
  }
  return squareFleck(fx, fy, a)
}

/** Polygon subpath from absolute points. */
function polyFleck(pts: [number, number][]): string {
  return `M${fmt(pts[0][0])} ${fmt(pts[0][1])}${pts
    .slice(1)
    .map(([x, y]) => `L${fmt(x)} ${fmt(y)}`)
    .join('')}z`
}

/** Vertices of a regular polygon (one radius per vertex, evenly spaced from `rot`). */
function ringPts(cx: number, cy: number, radii: number[], rot: number): [number, number][] {
  return radii.map((r, k) => {
    const th = rot + (k * 2 * Math.PI) / radii.length
    return [cx + r * Math.cos(th), cy + r * Math.sin(th)]
  })
}

/** Polygon rotated by `rot` around the given center. */
function turnPts(cx: number, cy: number, pts: [number, number][], rot: number): [number, number][] {
  const ca = Math.cos(rot)
  const sa = Math.sin(rot)
  return pts.map(([px, py]) => [cx + px * ca - py * sa, cy + px * sa + py * ca])
}

/**
 * Random rotation a fleck of the given shape spins by: chips keep their classic quarter-turn range,
 * dashes follow the configured angle with a seeded spread, triangles/stars/crosses tumble freely.
 */
export function fleckRotation(shape: TextureSettings['shape'], angle: number, r5: number): number {
  if (shape === 'chip') return r5 * (Math.PI / 2)
  if (shape === 'dash') return (clamp(angle, 0, 180) * Math.PI) / 180 + (r5 - 0.5) * 0.9
  if (shape === 'triangle' || shape === 'star' || shape === 'cross') return r5 * Math.PI * 2
  return 0
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
