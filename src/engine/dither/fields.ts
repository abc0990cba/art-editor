/**
 * Procedural threshold fields for ordered dithering: pure (x, y) → [0, 1) tone thresholds, wrapping
 * so the texture tiles across any image, anchored at the origin like crosshatchAt. Consumed by the
 * import pipeline through ORDERED_FIELDS. Pure.
 */

import { hash2 } from '../texture/core.ts'

const TAU = Math.PI * 2
const GOLDEN = 0.61803398875

const fract = (v: number): number => v - Math.floor(v)
const mod8 = (v: number): number => ((v % 8) + 8) % 8

/** Horizontal line screen: rows flip in order inside each 8-row band. */
export function linesHAt(_x: number, y: number): number {
  return (mod8(y) + 0.5) / 8
}

/** Vertical line screen: columns flip left-to-right inside each 8-column band. */
export function linesVAt(x: number, _y: number): number {
  return (mod8(x) + 0.5) / 8
}

/** Diagonal line screen: anti-diagonals flip in order. */
export function linesDiagAt(x: number, y: number): number {
  return (mod8(x + y) + 0.5) / 8
}

/** Interleaved gradient noise — like white noise but visibly smoother (J. Jimenez). */
export function ignAt(x: number, y: number): number {
  return fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y))
}

/** Archimedean spiral winding out of the origin: tone grows along the winding arm. */
export function spiralAt(x: number, y: number): number {
  const r = Math.hypot(x, y)
  return fract(Math.atan2(y, x) / TAU + r / 7)
}

/** Concentric rings around the origin: tone grows outward along each ring. */
export function ringsAt(x: number, y: number): number {
  return fract(Math.hypot(x, y) / 4.5)
}

/** Sunburst: tone grows around the origin through 24 angular wedges. */
export function sunburstAt(x: number, y: number): number {
  return fract((Math.atan2(y, x) / TAU) * 24)
}

/** Phyllotaxis: sunflower-inspired rank order — rings counted along the golden angle. */
export function phyllotaxisAt(x: number, y: number): number {
  const n = (x * x + y * y) / 7
  return fract(n * GOLDEN)
}

/** Zigzag meander: diagonal bands bouncing up and down, the classic zigzag dither. */
export function zigzagAt(x: number, y: number): number {
  const z = ((y % 16) + 16) % 16
  const tri = z < 8 ? z : 15 - z
  return fract((x + tri) / 10)
}

/** Smooth value noise on an integer lattice, bilinear over a smoothstep. */
function vnoise(px: number, py: number): number {
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const fx = px - x0
  const fy = py - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const h = (ix: number, iy: number): number => hash2(ix, iy, 0x51_27_1e_74) / 4_294_967_296
  const a = h(x0, y0)
  const b = h(x0 + 1, y0)
  const c = h(x0, y0 + 1)
  const d = h(x0 + 1, y0 + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Two-octave fractal (value) noise — cloudy, cloud-threshold ordered dither. */
export function fractalNoiseAt(x: number, y: number): number {
  return 0.65 * vnoise(x / 6, y / 6) + 0.35 * vnoise(x / 3 + 11, y / 3 + 7)
}

/** Rotated print screen: toroidal distance to the nearest dot center of a 45° lattice. */
export function screen45At(x: number, y: number): number {
  const c = Math.SQRT1_2
  const u = (x * c + y * c) / 6
  const v = (y * c - x * c) / 6
  const du = u - Math.round(u)
  const dv = v - Math.round(v)
  return Math.min(1, Math.hypot(du, dv) / 0.75)
}

/** Wavy line screen: sine-banded lines that thicken with tone. */
export function screenWaveAt(x: number, y: number): number {
  const wave = Math.sin(x * (Math.PI / 9)) * 2.2
  const d = Math.abs(((((y + wave) % 7) + 7) % 7) - 3.5)
  return Math.min(1, d / 3.5)
}
