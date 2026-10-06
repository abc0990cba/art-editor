/**
 * Silhouettes of the extended cell forms (everything added after the classic twenty). Pure data and
 * parametric generators over the unit box — the hit-test and fragment tables in cell-shape-geom /
 * cell-shape-frag consume them exactly like the built-in shapes.
 */

import { clamp } from './defs.ts'
import type { UnitPt } from './geom.ts'

const pol = (r: number, a: number): UnitPt => [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]

/** Regular pentagon, vertex up, circumradius 0.5. */
export const UNIT_PENTAGON: UnitPt[] = Array.from({ length: 5 }, (_, k) =>
  pol(0.5, -Math.PI / 2 + (2 * Math.PI * k) / 5),
)

const OCT_A = 0.5 * Math.tan(Math.PI / 8) // regular octagon with flats on the box sides

/** Regular octagon, flat sides on the unit box edges. */
export const UNIT_OCTAGON: UnitPt[] = [
  [0.5 + OCT_A, 0],
  [1, OCT_A],
  [1, 1 - OCT_A],
  [0.5 + OCT_A, 1],
  [0.5 - OCT_A, 1],
  [0, 1 - OCT_A],
  [0, OCT_A],
  [0.5 - OCT_A, 0],
]

/** Heraldic shield: near-flat top, sides tapering to a point at the bottom. */
export const UNIT_SHIELD: UnitPt[] = [
  [0.14, 0.06],
  [0.86, 0.06],
  [0.86, 0.52],
  [0.5, 0.96],
  [0.14, 0.52],
]

/** Cubic egg: anchor + 4 × (control, control, anchor) — blunter and rounder than the teardrop. */
export const UNIT_EGG: UnitPt[] = [
  [0.5, 0.06],
  [0.68, 0.06],
  [0.84, 0.2],
  [0.86, 0.42],
  [0.88, 0.66],
  [0.72, 0.94],
  [0.5, 0.94],
  [0.28, 0.94],
  [0.12, 0.66],
  [0.14, 0.42],
  [0.16, 0.2],
  [0.32, 0.06],
  [0.5, 0.06],
]

/** Isosceles trapezoid: full base at the bottom, top width `thickness` of the box (0.5 = square). */
export function trapezoidPoly(thickness: number): UnitPt[] {
  const tw = clamp(thickness, 0.05, 0.5)
  return [
    [0.5 - tw, 0],
    [0.5 + tw, 0],
    [1, 1],
    [0, 1],
  ]
}

/** Horizontal arrow: shaft of half-width `thickness`, triangular head reaching the box edge. */
export function arrowPoly(thickness: number): UnitPt[] {
  const sw = clamp(thickness, 0.05, 0.5) * 0.44
  return [
    [0, 0.5 - sw],
    [0.55, 0.5 - sw],
    [0.55, 0.28],
    [1, 0.5],
    [0.55, 0.72],
    [0.55, 0.5 + sw],
    [0, 0.5 + sw],
  ]
}

/**
 * Leaf: two symmetric quadratic arcs between the diagonal tips; `thickness` plumps the blade from a
 * slim sliver to a full vesica.
 */
export function leafPoly(thickness: number): UnitPt[] {
  const k = 0.12 + clamp(thickness, 0.05, 0.5) * 0.6
  const p1: UnitPt = [0.12, 0.88]
  const p2: UnitPt = [0.88, 0.12]
  const c1: UnitPt = [0.5 - k, 0.5 - k]
  const c2: UnitPt = [0.5 + k, 0.5 + k]
  const pts: UnitPt[] = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const m = 1 - t
    pts.push([
      m * m * p1[0] + 2 * m * t * c1[0] + t * t * p2[0],
      m * m * p1[1] + 2 * m * t * c1[1] + t * t * p2[1],
    ])
  }
  for (let i = 1; i <= 12; i++) {
    const t = i / 12
    const m = 1 - t
    pts.push([
      m * m * p2[0] + 2 * m * t * c2[0] + t * t * p1[0],
      m * m * p2[1] + 2 * m * t * c2[1] + t * t * p1[1],
    ])
  }
  return pts
}

/** Skewed bar: the top edge shifted right by `skew` (thickness knob), bottom edge full. */
export function parallelogramPoly(skew: number): UnitPt[] {
  const t = clamp01(skew)
  return [
    [t, 0],
    [1, 0],
    [1 - t, 1],
    [0, 1],
  ]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Horizontal sine band: the band center follows one sine period, `thickness` is the band height. */
export function waveStripPoly(thickness: number): UnitPt[] {
  const h = clamp01(thickness) / 2
  const pts: UnitPt[] = []
  const N = 16
  for (let i = 0; i <= N; i++) {
    const x = i / N
    pts.push([x, 0.5 + 0.25 * Math.sin(2 * Math.PI * x) - h])
  }
  for (let i = N; i >= 0; i--) {
    const x = i / N
    pts.push([x, 0.5 + 0.25 * Math.sin(2 * Math.PI * x) + h])
  }
  return pts
}
