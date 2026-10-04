/**
 * Paint math for authored scenes: stop normalization, piecewise-linear evaluation with pad
 * semantics (matching browsers), ramp generation in sRGB or OKLab, and CSS preview strings for the
 * editor's stop bars. Pure string/number math — no DOM.
 */

import type { RGB } from '../color/color.ts'
import { rgbToHex } from './color.ts'
import { mulberry32 } from './figures.ts'
import { clamp01, oklabToRgb, rgbToOklab } from './oklab.ts'
import type { BBox, GradStop, Paint } from './types.ts'

/** Copy of `stops` sorted by offset (stable for equal offsets). */
export function sortStops(stops: GradStop[]): GradStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset)
}

/** Piecewise-linear stop color at `t`, pad-clamped outside the end stops (SVG `spreadMethod="pad"`). */
export function stopColorAt(stops: GradStop[], t: number): RGB {
  const s = sortStops(stops)
  if (s.length === 0) return { r: 0, g: 0, b: 0 }
  if (t <= s[0].offset) return s[0].color
  const last = s[s.length - 1]
  if (t >= last.offset) return last.color
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]
    const b = s[i]
    if (t <= b.offset) {
      const span = b.offset - a.offset
      const k = span <= 0 ? 0 : (t - a.offset) / span
      return {
        r: a.color.r + (b.color.r - a.color.r) * k,
        g: a.color.g + (b.color.g - a.color.g) * k,
        b: a.color.b + (b.color.b - a.color.b) * k,
      }
    }
  }
  return last.color
}

/** Piecewise-linear stop alpha at `t` with the same pad semantics. */
export function stopAlphaAt(stops: GradStop[], t: number): number {
  const s = sortStops(stops)
  if (s.length === 0) return 0
  if (t <= s[0].offset) return s[0].alpha
  const last = s[s.length - 1]
  if (t >= last.offset) return last.alpha
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]
    const b = s[i]
    if (t <= b.offset) {
      const span = b.offset - a.offset
      const k = span <= 0 ? 0 : (t - a.offset) / span
      return a.alpha + (b.alpha - a.alpha) * k
    }
  }
  return last.alpha
}

/**
 * Evenly spaced ramp between two colors in `n` stops. `space: 'oklab'` interpolates perceptually
 * (recommended for shading ramps — no darkening midpoints); the result is still plain sRGB stops.
 */
export function rampStops(
  from: RGB,
  to: RGB,
  n: number,
  space: 'srgb' | 'oklab',
  alphas: { from?: number; to?: number } = {},
): GradStop[] {
  const fromAlpha = alphas.from ?? 1
  const toAlpha = alphas.to ?? 1
  const count = Math.max(2, Math.round(n))
  const out: GradStop[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    out.push({
      offset: t,
      color: mixColor(from, to, t, space),
      alpha: fromAlpha + (toAlpha - fromAlpha) * t,
    })
  }
  return out
}

export function mixColor(from: RGB, to: RGB, t: number, space: 'srgb' | 'oklab'): RGB {
  if (space === 'srgb') {
    return {
      r: from.r + (to.r - from.r) * t,
      g: from.g + (to.g - from.g) * t,
      b: from.b + (to.b - from.b) * t,
    }
  }
  const a = rgbToOklab(from)
  const b = rgbToOklab(to)
  return oklabToRgb({
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  })
}

/**
 * CSS `linear-gradient` preview of a paint, axis flattened to 90° (stop bars only care about
 * ramps).
 */
const UNIT_BBOX: BBox = { x: 0, y: 0, w: 1, h: 1 }

export function paintToCss(paint: Paint, bbox: BBox = UNIT_BBOX): string {
  if (paint.kind === 'solid') return rgba(paint.color, paint.alpha)
  const stops = sortStops(paint.stops)
    .map((s) => `${rgba(s.color, s.alpha)} ${(clamp01(s.offset) * 100).toFixed(1)}%`)
    .join(', ')
  if (paint.kind === 'linear') return `linear-gradient(90deg, ${stops})`
  const toPct = (v: number) => (clamp01(v) * 100).toFixed(1)
  if (paint.units === 'bbox') {
    const at = `circle at ${toPct(paint.cx)}% ${toPct(paint.cy)}%`
    return `radial-gradient(${at}, ${stops})`
  }
  const cx = toPct((paint.cx - bbox.x) / (bbox.w || 1))
  const cy = toPct((paint.cy - bbox.y) / (bbox.h || 1))
  return `radial-gradient(circle at ${cx}% ${cy}%, ${stops})`
}

function rgba(c: RGB, alpha: number): string {
  if (alpha >= 1) return rgbToHex(c)
  const to = (v: number) => Math.round(clamp01(v) * 255)
  const a = Math.round(clamp01(alpha) * 100) / 100
  return `rgba(${to(c.r)}, ${to(c.g)}, ${to(c.b)}, ${a})`
}

/** Reverse a stop list: order flips, offsets mirror to 1−o (colors/alphas ride along). */
export function reverseStops(stops: GradStop[]): GradStop[] {
  return sortStops(stops)
    .slice()
    .reverse()
    .map((s) => ({ ...s, offset: clamp01(1 - s.offset) }))
}

/** Keep each stop's color/alpha but redistribute offsets evenly across 0..1. */
export function evenStops(stops: GradStop[]): GradStop[] {
  const s = sortStops(stops)
  if (s.length <= 1) return s
  return s.map((stop, i) => ({ ...stop, offset: i / (s.length - 1) }))
}

/** Even multi-color ramp (one stop per color); the browser mixes each segment linearly. */
export function rampFromColors(colors: RGB[], alpha = 1): GradStop[] {
  const list = colors.length > 0 ? colors : [{ r: 0, g: 0, b: 0 }]
  if (list.length === 1) return [{ offset: 0, color: list[0]!, alpha }]
  return list.map((color, i) => ({ offset: i / (list.length - 1), color, alpha }))
}

/**
 * Bake grain into stop colors: per-stop OKLab jitter (seeded) between each stop and its neighbors'
 * average. This is the filter-free answer to gradient banding — browsers interpolate linearly
 * between stops, and slightly irregular stops break up the bands. AI-safe: plain sRGB stops out.
 */
export function jitterStops(stops: GradStop[], amount = 0.04, seed = 1): GradStop[] {
  const s = sortStops(stops)
  if (s.length < 2 || amount <= 0) return s
  const rand = mulberry32(seed)
  return s.map((stop, i) => {
    const prev = s[Math.max(0, i - 1)]!
    const next = s[Math.min(s.length - 1, i + 1)]!
    const mid = mixColor(prev.color, next.color, 0.5, 'oklab')
    const base = mixColor(stop.color, mid, 0.35, 'oklab')
    const lab = rgbToOklab(base)
    const j = (): number => (rand() - 0.5) * 2 * amount
    return {
      ...stop,
      color: oklabToRgb({
        L: clamp01(lab.L + j()),
        a: lab.a + j(),
        b: lab.b + j(),
      }),
    }
  })
}
