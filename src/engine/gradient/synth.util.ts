/**
 * Deterministic synthetic fields for gradient-engine tests: exact piecewise-linear ramps with
 * seeded noise and 8-bit quantization (banding), plus HSV fields for non-modelizable color cases.
 * All thresholds in the tests stay deterministic because the noise is seeded (mulberry32).
 */

import { clamp01 } from './color.ts'
import { stopColorAt } from './stop-colors.ts'
import type { GradStop, RGB, RegionPixels, RgbField, Vec2 } from './types.ts'

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Piecewise-linear ramp along the p1→p2 axis, pad-clamped outside the axis. */
export function linearField(w: number, h: number, p1: Vec2, p2: Vec2, stops: GradStop[]): RgbField {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len2 = dx * dx + dy * dy
  return fieldFrom(w, h, (x, y) => {
    const t = len2 < 1e-9 ? 0 : ((x - p1.x) * dx + (y - p1.y) * dy) / len2
    return stopColorAt(stops, t)
  })
}

/** Piecewise-linear ramp over the distance to `center`, normalized by `radius`. */
export function radialField(
  w: number,
  h: number,
  center: Vec2,
  radius: number,
  stops: GradStop[],
): RgbField {
  return fieldFrom(w, h, (x, y) =>
    stopColorAt(stops, Math.hypot(x - center.x, y - center.y) / radius),
  )
}

export function solidField(w: number, h: number, color: RGB): RgbField {
  return fieldFrom(w, h, () => color)
}

/** Hue field in degrees (s = v = 1) — the canonical non-modelizable color layout. */
export function hsvField(w: number, h: number, hueAt: (x: number, y: number) => number): RgbField {
  return fieldFrom(w, h, (x, y) => hsvToRgb(hueAt(x, y), 1, 1))
}

/** Independent per-channel gaussian noise, applied before quantization in the tests. */
export function withNoise(f: RgbField, sigma: number, rand: () => number): RgbField {
  const out: RgbField = { width: f.width, height: f.height, rgb: new Float32Array(f.rgb.length) }
  for (let i = 0; i < f.rgb.length; i++) {
    const u1 = Math.max(1e-12, rand())
    const u2 = rand()
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    out.rgb[i] = clamp01(f.rgb[i] + g * sigma)
  }
  return out
}

/** Snap to the 8-bit grid — the banding every raster capture carries. */
export function quantize8(f: RgbField): RgbField {
  const out: RgbField = { width: f.width, height: f.height, rgb: new Float32Array(f.rgb.length) }
  for (let i = 0; i < f.rgb.length; i++) out.rgb[i] = Math.round(f.rgb[i] * 255) / 255
  return out
}

/** Every pixel of the field as a region sample with weight 1. */
export function fieldToPixels(f: RgbField): RegionPixels {
  const n = f.width * f.height
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  const weights = new Float32Array(n).fill(1)
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      xs[y * f.width + x] = x
      ys[y * f.width + x] = y
    }
  }
  return { count: n, xs, ys, rgb: f.rgb.slice(), weights }
}

function fieldFrom(w: number, h: number, colorAt: (x: number, y: number) => RGB): RgbField {
  const rgb = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colorAt(x, y)
      const o = (y * w + x) * 3
      rgb[o] = c.r
      rgb[o + 1] = c.g
      rgb[o + 2] = c.b
    }
  }
  return { width: w, height: h, rgb }
}

function hsvToRgb(hDeg: number, s: number, v: number): RGB {
  const hp = (((hDeg % 360) + 360) % 360) / 60
  const c = v * s
  const xx = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = c
    g = xx
  } else if (hp < 2) {
    r = xx
    g = c
  } else if (hp < 3) {
    g = c
    b = xx
  } else if (hp < 4) {
    g = xx
    b = c
  } else if (hp < 5) {
    r = xx
    b = c
  } else {
    r = c
    b = xx
  }
  const m = v - c
  return { r: r + m, g: g + m, b: b + m }
}
