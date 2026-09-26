import type { TextureSettings } from './doc'
import {
  clamp,
  distWeight,
  emitFleck,
  hash,
  ISO,
  lerp,
  MAX_REGION_FLECKS,
  mulberry32,
  valueNoise,
} from './texture-core'
import { emitHalftoneDots, filterSpray, htKey, type HtDot } from './texture-halftone'

/**
 * Texture hole fragments for a metaball blob, sampled from its scalar field. A candidate survives
 * when its four corners sample above the contour — and when they don't, the speck is nudged along
 * the field gradient (fit, don't reject), so grunge stays dense at blob edges.
 */

/** Minimal view of a metaball field: values on a regular grid in doc units. */
export interface TextureField {
  f: ArrayLike<number>
  fw: number
  fh: number
  /** Doc units per field node */
  scale: number
}

/** Read-only setup shared by one field scan. */
interface FieldMetrics {
  field: TextureField
  t: TextureSettings
  scale: number
  /** Placement grid step in doc units */
  spacing: number
  gapU: number
  band: number
  p: number
  e: number
  minW: number
}

/** Mutable accumulator for one field scan. */
interface FieldState extends FieldMetrics {
  ca: number
  sa: number
  prMin: number
  prMax: number
  keep: number
  /** Shared stream: draw order across cells must be preserved exactly */
  rand: () => number
  dots: HtDot[]
  dotKeys: number[]
  dotAt: Map<number, number>
  sprayCand: (HtDot & { key: number })[]
  out: string
  count: number
}

/** Lattice config and screen-ramp projection of one field scan. */
interface FieldGrid {
  stride: number
  keep: number
  spacing: number
  ca: number
  sa: number
  prMin: number
  prMax: number
}

/** Bilinear field sample at doc-unit coordinates. */
function fieldAt(field: TextureField, x: number, y: number): number {
  const { f, fw, fh, scale } = field
  const gx = clamp(x / scale, 0, fw - 1.001)
  const gy = clamp(y / scale, 0, fh - 1.001)
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const a = f[iy * fw + ix]
  const b = f[iy * fw + ix + 1]
  const c = f[(iy + 1) * fw + ix]
  const d = f[(iy + 1) * fw + ix + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** Rough doc-unit distance from a point to the ISO contour via the field gradient. */
function contourDepth(field: TextureField, x: number, y: number, v: number): number {
  const e = field.scale
  const gx = (fieldAt(field, x + e, y) - fieldAt(field, x - e, y)) / 2
  const gy = (fieldAt(field, x, y + e) - fieldAt(field, x, y - e)) / 2
  const g = Math.max(Math.hypot(gx, gy), 1e-6)
  return (v - ISO) / g
}

/** Normalized field gradient direction (toward higher field values). */
function fieldGradDir(field: TextureField, x: number, y: number): [number, number] {
  const e = field.scale
  const gx = (fieldAt(field, x + e, y) - fieldAt(field, x - e, y)) / 2
  const gy = (fieldAt(field, x, y + e) - fieldAt(field, x, y - e)) / 2
  const m = Math.hypot(gx, gy)
  return m < 1e-6 ? [0, 0] : [gx / m, gy / m]
}

/** A fleck is only safe when all four corners sit strictly inside the blob. */
function fieldSolid(field: TextureField, x: number, y: number, s: number): boolean {
  return (
    fieldAt(field, x, y) > ISO &&
    fieldAt(field, x + s, y) > ISO &&
    fieldAt(field, x, y + s) > ISO &&
    fieldAt(field, x + s, y + s) > ISO
  )
}

/**
 * Fit, don't reject: nudge along the field gradient (toward the blob interior) with growing steps —
 * the first step that fits wins; when none fits the input point comes back unplaced.
 */
function nudgeAlongGradient(
  s: FieldState,
  fx: number,
  fy: number,
  a: number,
): [number, number, boolean] {
  const [gxx, gyy] = fieldGradDir(s.field, fx, fy)
  for (const mult of [0.3, 0.6, 1.2]) {
    const nx = fx + gxx * a * mult
    const ny = fy + gyy * a * mult
    if (fieldSolid(s.field, nx, ny, a)) return [nx, ny, true]
  }
  return [fx, fy, false]
}

/**
 * Grid step, RNG thin-out factor and tone-ramp projection range. Keep the output bounded on big
 * blobs: probabilistic effects thin out uniformly via the RNG gate, halftone coarsens its grid so
 * it stays regular.
 */
function fieldGridConfig(
  field: TextureField,
  t: TextureSettings,
  pitch: number,
  halftone: boolean,
  p: number,
): FieldGrid {
  let stride = Math.max(1, Math.round(pitch / field.scale))
  const estTotal = Math.ceil((field.fw - 2) / stride) * Math.ceil((field.fh - 2) / stride)
  let keep = 1
  if (halftone) {
    const factor = Math.ceil(Math.sqrt(estTotal / MAX_REGION_FLECKS))
    if (factor > 1) stride *= factor
  } else {
    keep = Math.min(1, MAX_REGION_FLECKS / Math.max(1, estTotal * p))
  }
  const spacing = stride * field.scale
  const theta = (clamp(t.angle, 0, 180) * Math.PI) / 180
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  let prMin = 0
  let prMax = 0
  if (halftone && t.ramp > 0) {
    prMin = Infinity
    prMax = -Infinity
    for (const [px, py] of [
      [0, 0],
      [(field.fw - 1) * field.scale, 0],
      [0, (field.fh - 1) * field.scale],
      [(field.fw - 1) * field.scale, (field.fh - 1) * field.scale],
    ]) {
      const pr = px * ca + py * sa
      prMin = Math.min(prMin, pr)
      prMax = Math.max(prMax, pr)
    }
  }
  return { stride, keep, spacing, ca, sa, prMin, prMax }
}

/** Halftone candidate on the (optionally rotated) screen grid, plus optional spray specks. */
function fieldHalftoneCell(s: FieldState, i: number, j: number, rand: () => number): void {
  // rotated screen grid, tone in dot size
  const r1 = rand()
  const r2 = rand()
  const r3 = rand()
  let dx = (i * s.ca - j * s.sa) * s.scale
  let dy = (i * s.sa + j * s.ca) * s.scale
  if (s.t.jitter > 0) {
    const jx = (r1 - 0.5) * (s.t.jitter / 100) * s.spacing
    const jy = (r2 - 0.5) * (s.t.jitter / 100) * s.spacing
    dx += jx * s.ca - jy * s.sa
    dy += jx * s.sa + jy * s.ca
  }
  const center = fieldAt(s.field, dx, dy)
  if (center <= ISO + 0.15) return
  const depth = contourDepth(s.field, dx, dy, center)
  if (s.gapU > 0 && depth < s.gapU) return
  let mult = 1
  if (s.t.ramp > 0) {
    const tt = clamp((dx * s.ca + dy * s.sa - s.prMin) / Math.max(s.prMax - s.prMin, 1e-9), 0, 1)
    mult *= 1 + (s.t.ramp / 100) * (2 * tt - 1)
  }
  if (s.t.variation > 0) mult *= 1 + (s.t.variation / 100) * (r3 * 2 - 1)
  const a = Math.min(s.spacing * 0.9 * s.p * Math.max(mult, 0.05), s.spacing * 0.95)
  const dropped =
    s.t.dropout > 0 &&
    valueNoise(dx / (s.spacing * 4), dy / (s.spacing * 4), s.t.seed + 77) <
      (s.t.dropout / 100) * 0.92
  if (a > s.spacing * 0.015 && !dropped) {
    let fx = dx
    let fy = dy
    if (!fieldSolid(s.field, fx, fy, a)) {
      const nudged = nudgeAlongGradient(s, fx, fy, a)
      fx = nudged[0]
      fy = nudged[1]
    }
    if (fieldSolid(s.field, fx, fy, a)) {
      const k = htKey(i, j)
      s.dotAt.set(k, s.dots.length)
      s.dotKeys.push(k)
      s.dots.push({ cx: fx + a / 2, cy: fy + a / 2, r: a / 2 })
      s.count++
    }
  }
  if (s.t.spray > 0 && s.dots.length + s.sprayCand.length < MAX_REGION_FLECKS) {
    const s1 = rand()
    const s2 = rand()
    const s3 = rand()
    if (s1 < (s.t.spray / 100) * 0.6) {
      const wi = i + 0.25 + s2 * 0.5
      const wj = j + 0.25 + s3 * 0.5
      const sx = (wi * s.ca - wj * s.sa) * s.scale
      const sy = (wi * s.sa + wj * s.ca) * s.scale
      const sr = s.spacing * (0.025 + 0.055 * ((s2 + s3) / 2))
      if (fieldSolid(s.field, sx - sr, sy - sr, sr * 2)) {
        s.sprayCand.push({ cx: sx, cy: sy, r: sr, key: htKey(i, j) })
      }
    }
  }
}

/** Scatter/grunge candidate: contour gap, distribution weight and gradient nudge. */
function fieldScatterCell(s: FieldState, i: number, j: number, rand: () => number): void {
  const cx = i * s.scale
  const cy = j * s.scale
  const center = fieldAt(s.field, cx, cy)
  if (center <= ISO + 0.15) return
  const depth = contourDepth(s.field, cx, cy, center)
  // texture gap: skip candidates closer to the contour than the gap
  if (s.gapU > 0 && depth < s.gapU) return
  const r1 = rand()
  const r2 = rand()
  const r3 = rand()
  const r4 = rand()
  const r5 = rand()
  let weight = distWeight(s.t, cx, cy, s.spacing)
  if (s.t.effect === 'grunge') {
    // wear follows distance to the contour, not raw field magnitude
    weight *= clamp(1 + 0.5 * s.e - (0.5 + 0.5 * s.e) * Math.min(1, depth / s.band), s.minW, 1)
  }
  if (r1 >= s.p * weight * s.keep) return
  const a = lerp(s.t.sizeMin, s.t.sizeMax, r3) * s.spacing
  const jx = (r2 - 0.5) * (s.spacing - a) * 0.9
  const jy = (r4 - 0.5) * (s.spacing - a) * 0.9
  let fx = cx + jx
  let fy = cy + jy
  if (!fieldSolid(s.field, fx, fy, a)) {
    const nudged = nudgeAlongGradient(s, fx, fy, a)
    if (!nudged[2]) return
    fx = nudged[0]
    fy = nudged[1]
  }
  s.out += emitFleck(s.t.shape, fx, fy, a, s.t.shape === 'chip' ? r5 * (Math.PI / 2) : 0)
  s.count++
}

/**
 * Texture hole fragments for a metaball blob, sampled from its field in doc units. `sub` converts
 * the texture pitch (cell units) into doc units. Halftone uses a regular (optionally rotated)
 * screen grid with distress knobs and seed-driven randomness, shared with the pixels/outline region
 * path.
 */
export function fieldTextureFragments(
  field: TextureField,
  t: TextureSettings,
  key: number,
  sub = 1,
): string {
  if (t.effect === 'none' || t.amount <= 0) return ''
  const { fw, fh } = field
  // pitch in doc units: cells are 1/sub doc units wide, matching pixels-mode density
  const pitch = (0.14 * clamp(t.scale, 0.1, 8)) / sub
  const halftone = t.effect === 'halftone'
  const p = t.amount / 100
  const e = clamp(t.edge, 0, 100) / 100
  const minW = 1 - 0.85 * e
  const band = 0.25 * (clamp(t.scale, 0.1, 8) / sub)
  const gapU = clamp(t.gap, 0, 0.45) / sub
  const grid = fieldGridConfig(field, t, pitch, halftone, p)
  const s: FieldState = {
    field,
    t,
    scale: field.scale,
    spacing: grid.spacing,
    gapU,
    band,
    p,
    e,
    minW,
    keep: grid.keep,
    ca: grid.ca,
    sa: grid.sa,
    prMin: grid.prMin,
    prMax: grid.prMax,
    rand: mulberry32(hash(key, t.seed)),
    dots: [],
    dotKeys: [],
    dotAt: new Map<number, number>(),
    sprayCand: [],
    out: '',
    count: 0,
  }
  for (let j = 1; j < fh - 1 && s.count < MAX_REGION_FLECKS; j += grid.stride) {
    for (let i = 1; i < fw - 1 && s.count < MAX_REGION_FLECKS; i += grid.stride) {
      if (halftone) fieldHalftoneCell(s, i, j, s.rand)
      else fieldScatterCell(s, i, j, s.rand)
    }
  }
  if (halftone) {
    return (
      emitHalftoneDots(
        { dots: s.dots, keys: s.dotKeys, dotAt: s.dotAt },
        grid.stride,
        t,
        grid.spacing,
      ) + filterSpray(s.sprayCand, s.dots, s.dotAt, grid.spacing)
    )
  }
  return s.out
}
