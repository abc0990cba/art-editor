import type { TextureSettings } from './doc'
import { clamp, hash2, valueNoise } from './texture-core'

/**
 * Speck distributions of the texture family: the classic random fields (scatter, clumps, streaks,
 * perlin, voronoi) plus structured procedural patterns (waves, sunburst, spiral, honeycomb, scales,
 * weave, checker, fade, bayer). Everything is pure and seeded, so baked patterns stay identical
 * across canvas, PNG and SVG export.
 */

/** Figure geometry the structured patterns anchor to, in doc units. */
export interface DistContext {
  /** Figure center */
  cx: number
  cy: number
  /** Half extents of the figure */
  rx: number
  ry: number
  /** Configured angle in radians */
  theta: number
}

/** Clamped texture angle in radians (the one place every consumer derives it from). */
export const angleRad = (deg: number) => (clamp(deg, 0, 180) * Math.PI) / 180

/** Ordered 8×8 Bayer threshold matrix (0..63) for the dither distribution. */
const BAYER8: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

/** Positive modulo for lattice indices that can be negative left of the doc origin. */
const posMod = (v: number, m: number) => ((v % m) + m) % m

/** Concentric rings around the figure center. */
function wavesWeight(t: TextureSettings, dc: DistContext, x: number, y: number, pitch: number) {
  const r = Math.hypot(x - dc.cx, y - dc.cy) / (pitch * 3)
  return clamp(0.8 + 0.6 * Math.sin(r * 2 * Math.PI + (t.seed % 7) * 0.9), 0.1, 1)
}

/** Angular rays radiating from the figure center; fewer rays at larger feature sizes. */
function sunburstWeight(t: TextureSettings, dc: DistContext, x: number, y: number) {
  const rays = clamp(Math.round(12 / clamp(t.scale, 0.1, 8)), 2, 120)
  const a = Math.atan2(y - dc.cy, x - dc.cx)
  return clamp(0.8 + 0.6 * Math.sin(a * rays + (t.seed % 7) * 0.9), 0.1, 1)
}

/** Spiral arms: angular phase winding outward with radius. */
function spiralWeight(t: TextureSettings, dc: DistContext, x: number, y: number, pitch: number) {
  const rays = clamp(Math.round(8 / clamp(t.scale, 0.1, 8)), 2, 80)
  const a = Math.atan2(y - dc.cy, x - dc.cx)
  const r = Math.hypot(x - dc.cx, y - dc.cy) / (pitch * 4)
  return clamp(0.8 + 0.6 * Math.sin(a * rays + r * 2 * Math.PI + (t.seed % 7) * 0.9), 0.1, 1)
}

/** Band of weight along the walls of a hexagon lattice (honeycomb web). */
function honeycombWeight(x: number, y: number, pitch: number) {
  const s = pitch * 3
  // axial coords of the pointy-top hex lattice, then cube-round to the nearest center
  const xf = ((Math.sqrt(3) / 3) * x - y / 3) / s
  const zf = ((2 / 3) * y) / s
  const yf = -xf - zf
  let qx = Math.round(xf)
  let qy = Math.round(yf)
  let qz = Math.round(zf)
  const dx = Math.abs(qx - xf)
  const dy = Math.abs(qy - yf)
  const dz = Math.abs(qz - zf)
  if (dx > dy && dx > dz) qx = -qy - qz
  else if (dy > dz) qy = -qx - qz
  else qz = -qx - qy
  const px = s * Math.sqrt(3) * (qx + qz / 2)
  const py = s * 1.5 * qz
  const d = Math.hypot(x - px, y - py)
  return clamp(1.15 - Math.abs(d - (s * Math.sqrt(3)) / 2) / (s * 0.25), 0.12, 1)
}

/** Rows of half-drop fish-scale arcs: weight bands along the arc edges. */
function scalesWeight(x: number, y: number, pitch: number) {
  const s = pitch * 3
  const row = Math.floor(y / (s * 0.5))
  const shift = (posMod(row, 2) * s) / 2
  const col = Math.floor((x - shift) / s)
  const ccx = col * s + s * 0.5 + shift
  const ccy = row * s * 0.5
  const d = Math.hypot(x - ccx, y - ccy)
  return clamp(1.15 - Math.abs(d - s * 0.5) / (s * 0.18), 0.12, 1)
}

/** Alternating horizontal/vertical dashes — knitted tweed. */
function weaveWeight(x: number, y: number, pitch: number) {
  const s = pitch * 3
  const gx = x / s
  const gy = y / s
  const fx = gx - Math.floor(gx) - 0.5
  const fy = gy - Math.floor(gy) - 0.5
  const band = posMod(Math.floor(gx) + Math.floor(gy), 2) === 0 ? Math.abs(fy) : Math.abs(fx)
  return clamp(1.3 - band * 3.6, 0.1, 1)
}

/** Hard ordered checkerboard. */
function checkerWeight(x: number, y: number, pitch: number) {
  const s = pitch * 3
  return posMod(Math.floor(x / s) + Math.floor(y / s), 2) === 0 ? 1 : 0
}

/** Linear density fade along the configured angle across the figure extent. */
function fadeWeight(dc: DistContext, x: number, y: number) {
  const ca = Math.cos(dc.theta)
  const sa = Math.sin(dc.theta)
  const span = Math.max(dc.rx * Math.abs(ca) + dc.ry * Math.abs(sa), 1e-9)
  const proj = ((x - dc.cx) * ca + (y - dc.cy) * sa) / span
  return clamp(0.95 - 0.9 * (proj * 0.5 + 0.5), 0.05, 1)
}

/** Ordered Bayer dithering: a smooth seeded noise field thresholded by the fixed 8×8 matrix. */
function bayerWeight(t: TextureSettings, x: number, y: number, pitch: number) {
  const n =
    0.65 * valueNoise(x / (pitch * 4), y / (pitch * 4), t.seed) +
    0.35 * valueNoise(x / (pitch * 2), y / (pitch * 2), t.seed + 31)
  const th = (BAYER8[posMod(Math.floor(y / pitch), 8)][posMod(Math.floor(x / pitch), 8)] + 0.5) / 64
  return n > th ? 1 : 0
}

/** The structured (non-random-field) distributions. */
function patternWeight(
  t: TextureSettings,
  dc: DistContext,
  x: number,
  y: number,
  pitch: number,
): number {
  if (t.dist === 'waves') return wavesWeight(t, dc, x, y, pitch)
  if (t.dist === 'sunburst') return sunburstWeight(t, dc, x, y)
  if (t.dist === 'spiral') return spiralWeight(t, dc, x, y, pitch)
  if (t.dist === 'honeycomb') return honeycombWeight(x, y, pitch)
  if (t.dist === 'scales') return scalesWeight(x, y, pitch)
  if (t.dist === 'weave') return weaveWeight(x, y, pitch)
  if (t.dist === 'checker') return checkerWeight(x, y, pitch)
  if (t.dist === 'fade') return fadeWeight(dc, x, y)
  return bayerWeight(t, x, y, pitch)
}

/**
 * Probability multiplier for a candidate speck at doc-unit position (x, y): scatter = uniform;
 * clumps = single-octave stains; perlin = 3-octave fractal noise for natural multi-scale mottling;
 * voronoi = seeded stain colonies; streaks = directional wear bands along the configured angle; the
 * structured patterns (waves…bayer) anchor to the figure geometry from `dc`.
 */
export function distWeight(
  t: TextureSettings,
  x: number,
  y: number,
  pitch: number,
  dc: DistContext,
): number {
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
    const phase = (t.seed % 7) * 0.9
    const s = (x * Math.cos(dc.theta) + y * Math.sin(dc.theta)) / pitch
    return clamp(0.85 + 0.55 * Math.sin((s * 2 * Math.PI) / 3 + phase), 0.15, 1)
  }
  if (t.dist === 'scatter') return 1
  return patternWeight(t, dc, x, y, pitch)
}
