/**
 * Hatch texture: parallel screen lines punched into fills as evenodd line holes — the white-line
 * engraving look. The region (pixels/outline) and metaball-field adapters share one knob mapping
 * (amount = width, scale = spacing, angle = direction, ramp = directional width gradient, wobble =
 * waviness, dropout = missing segments, variation = per-line width jitter, jitter = line phase).
 * Pure.
 */

import { hatchFragments, type HatchScan } from '../dither/screen-lines.ts'
import { hash2, valueNoise } from './core.ts'
import type { FieldState, TextureField } from './field.ts'
import { fieldSolid } from './field.ts'
import type { RegionState } from './region.ts'

/** Hatch layout: a single line system or a crossed pair at +90°. */
export type HatchStyle = 'straight' | 'cross'

/** Line-count ceiling before the spacing coarsens (mirrors the halftone stride logic). */
const MAX_HATCH_LINES = 800

/** Strip-count ceiling: the path-size budget of one region scan. */
const MAX_HATCH_RUNS = 6000

/** Flag-test budget of one waved system (the step coarsens to meet it). */
const MAX_WAVED_SAMPLES = 400_000

/** Width share of the pitch: the widest line never swallows the spacing. */
const WIDTH_SHARE = 0.95

/** Knob mapping shared by the region and field scanners (the settings fields that matter). */
interface HatchEnv {
  /** Line pitch, doc units */
  Ld: number
  amount: number
  angle: number
  ramp: number
  wobble: number
  dropout: number
  variation: number
  jitter: number
  seed: number
  /** Straight or crossed systems */
  style: HatchStyle
  /** Normal-offset extent of the cover box (the ramp gradient runs along it) */
  uMin: number
  uMax: number
  /** Along-line extent of the cover box (waved sampling step derives from it) */
  span: number
  /** Cover box in caller coordinates */
  ox: number
  oy: number
  w: number
  h: number
}

function envOf(
  t: {
    amount: number
    angle: number
    ramp: number
    wobble: number
    dropout: number
    variation: number
    jitter: number
    seed: number
    hatchStyle?: HatchStyle
  },
  box: { ox: number; oy: number; w: number; h: number },
  Ld: number,
): HatchEnv {
  return {
    Ld,
    amount: t.amount,
    angle: t.angle,
    ramp: t.ramp,
    wobble: t.wobble,
    dropout: t.dropout,
    variation: t.variation,
    jitter: t.jitter,
    seed: t.seed,
    style: t.hatchStyle === 'cross' ? 'cross' : 'straight',
    ...projExtents(box.w, box.h, t.angle),
    ...box,
  }
}

/** Projection extents of a box onto the system axes (ramp gradient + waved sampling). */
function projExtents(
  w: number,
  h: number,
  angle: number,
): { uMin: number; uMax: number; span: number } {
  const rad = (angle * Math.PI) / 180
  const nx = -Math.sin(rad)
  const ny = Math.cos(rad)
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  let uMin = Infinity
  let uMax = -Infinity
  let tMin = Infinity
  let tMax = -Infinity
  for (const [cx, cy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    uMin = Math.min(uMin, cx * nx + cy * ny)
    uMax = Math.max(uMax, cx * nx + cy * ny)
    tMin = Math.min(tMin, cx * dx + cy * dy)
    tMax = Math.max(tMax, cx * dx + cy * dy)
  }
  return { uMin, uMax, span: Math.max(tMax - tMin, 1) }
}

/** Fragments of one line system: knobs resolved, scanner configured. */
function systemFragments(env: HatchEnv, angle: number, inside: HatchScan['inside']): string {
  const spacing = Math.max(env.Ld, 1e-3)
  const base = spacing * WIDTH_SHARE * Math.max(env.amount / 100, 0.02)
  const waveAmp = (env.wobble / 100) * env.Ld * 0.5
  const waveLen = Math.max(spacing * 8, env.Ld * 4)
  const lines = Math.min((env.uMax - env.uMin) / spacing + 2, MAX_HATCH_LINES)
  let step = waveAmp > 0 ? Math.min(env.span / 256, waveLen / 16) : Math.max(env.Ld * 0.75, 1e-3)
  // waved lines resample their whole run: cap the flag-test budget on huge regions
  if (waveAmp > 0 && (env.span / step) * lines > MAX_WAVED_SAMPLES) {
    step = env.span / (MAX_WAVED_SAMPLES / lines)
  }
  return hatchFragments({
    ox: env.ox,
    oy: env.oy,
    w: env.w,
    h: env.h,
    system: { angle, spacing, phase: 0, waveAmp, waveLen },
    widthAt: (u, k) => {
      let w = base
      if (env.ramp > 0 && env.uMax > env.uMin) {
        const tt = (u - env.uMin) / (env.uMax - env.uMin)
        w *= 1 + (env.ramp / 100) * (2 * tt - 1)
      }
      if (env.variation > 0)
        w *= 1 + (env.variation / 100) * (hash2(k, 5, env.seed + 31) / 4_294_967_296 - 0.5) * 2
      return Math.max(w, 0)
    },
    jitterAt:
      env.jitter > 0
        ? (k) => (hash2(k, 9, env.seed + 63) / 4_294_967_296 - 0.5) * (env.jitter / 100) * spacing
        : undefined,
    inside: (x, y, hw) => {
      if (
        env.dropout > 0 &&
        valueNoise(x / (spacing * 4), y / (spacing * 4), env.seed + 77) < (env.dropout / 100) * 0.92
      )
        return false
      return inside(x, y, hw)
    },
    step,
    maxLines: MAX_HATCH_LINES,
    maxRuns: MAX_HATCH_RUNS,
  })
}

function hatchFragmentsFor(env: HatchEnv, inside: HatchScan['inside']): string {
  const out = systemFragments(env, env.angle, inside)
  if (env.style === 'cross') return out + systemFragments(env, env.angle + 90, inside)
  return out
}

/**
 * Hatch hole fragments for a whole same-color region: lines clipped against the painted fills
 * (corner fillets and gap margins included via the region sampler).
 */
export function hatchRegionFragments(s: RegionState, Ld: number): string {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of s.cells) {
    minX = Math.min(minX, c.cx0)
    minY = Math.min(minY, c.cy0)
    maxX = Math.max(maxX, c.cx1)
    maxY = Math.max(maxY, c.cy1)
  }
  const env = envOf(s.t, { ox: minX, oy: minY, w: maxX - minX, h: maxY - minY }, Ld)
  return hatchFragmentsFor(env, (x, y, hw) => s.fits(x - hw, y - hw, hw * 2))
}

/** Hatch hole fragments for a metaball blob, sampled from its field in doc units. */
export function hatchFieldFragments(s: FieldState, pitch: number): string {
  const field: TextureField = s.field
  const env = envOf(
    s.t,
    { ox: 0, oy: 0, w: (field.fw - 1) * field.scale, h: (field.fh - 1) * field.scale },
    pitch,
  )
  return hatchFragmentsFor(env, (x, y, hw) => fieldSolid(field, x - hw, y - hw, hw * 2))
}
