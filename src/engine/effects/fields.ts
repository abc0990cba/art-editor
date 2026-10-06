/**
 * Evaluators of the grid-wide cell fields (pixels mode): one deterministic call per cell from
 * normalized cell coordinates. Cells address by their top-left corner; every kind normalizes to the
 * unit square so the same field reads identically on every lattice. The square-grid path feeds
 * buffer cells (sub-detail included), the non-square path feeds grid cells.
 */

import type { Doc } from '../core/doc.ts'
import type { FieldSettings } from '../core/field.ts'
import { hasJitter, jitterAt } from './jitter.ts'

/** Per-cell field output: figure scale, extra rotation in degrees, offset as cell fractions. */
export interface FieldSample {
  scale: number
  angle: number
  dx: number
  dy: number
}

const TAU = Math.PI * 2
const RAD = 180 / Math.PI

/** Integer hash → [0,1); mulberry-style mix, same family as texture/core. */
const hash01 = (seed: number, a: number, b: number): number => {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (a + 0x85ebca6b), 0xc2b2ae35) >>> 0
  h = Math.imul(h ^ (b + 0x27d4eb2f), 0x165667b1) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 0x1_0000_0000
}

/** Projection of the unit point onto the `angle` direction, normalized to 0..1. */
function along(f: FieldSettings, u: number, v: number): number {
  const at = f.angle * (Math.PI / 180)
  const norm = Math.abs(Math.cos(at)) + Math.abs(Math.sin(at)) || 1
  return (u * Math.cos(at) + v * Math.sin(at)) / norm
}

/** One sampled cell: coordinates in the w×h grid, unit-square point and normalized radius. */
interface FieldCell {
  x: number
  y: number
  w: number
  h: number
  u: number
  v: number
  r: number
}

/** Radius of the cell center from the grid center, in cells (periodic kinds, square grids). */
const cellRadius = (c: FieldCell): number => Math.hypot(c.x + 0.5 - c.w / 2, c.y + 0.5 - c.h / 2)

/**
 * Size field value t ∈ [0,1] at the sampled cell. Shape kinds read the unit-square point (u, v);
 * periodic kinds read cell coordinates — their wavelength reads in cells.
 */
function sizeValue(f: FieldSettings, c: FieldCell): number {
  const ph = f.phase / 360
  switch (f.size) {
    case 'funnel':
      return 1 - c.r
    case 'fountain':
      return c.r
    case 'dome':
      return 1 - Math.max(Math.abs(c.u - 0.5), Math.abs(c.v - 0.5)) * 2
    case 'edges':
      return Math.max(Math.abs(c.u - 0.5), Math.abs(c.v - 0.5)) * 2
    case 'rampX':
    case 'rampY':
    case 'rampDiag': {
      const raw =
        f.size === 'rampX'
          ? along(f, c.u, c.v)
          : f.size === 'rampY'
            ? along(f, c.v, c.u)
            : (c.u + c.v) / 2
      return raw
    }
    case 'waveX':
    case 'waveY': {
      const a = f.size === 'waveX' ? along(f, c.u * c.w, c.v * c.h) : along(f, c.v * c.h, c.u * c.w)
      return 0.5 + 0.5 * Math.sin(TAU * (a / f.period + ph))
    }
    case 'rings':
      return 0.5 + 0.5 * Math.sin(TAU * (cellRadius(c) / f.period + ph))
    case 'spiral': {
      const theta = Math.atan2(c.y + 0.5 - c.h / 2, c.x + 0.5 - c.w / 2) / TAU
      return 0.5 + 0.5 * Math.sin(TAU * (cellRadius(c) / f.period + theta + ph))
    }
    case 'checker':
      return (
        (((Math.floor((c.x + 0.5) / f.period) + Math.floor((c.y + 0.5) / f.period)) % 2) + 2) % 2
      )
    case 'none':
      return 1
  }
}

/** Rotation in degrees contributed by the align modulator (direction toward the grid center). */
function alignAngle(f: FieldSettings, x: number, y: number, u: number, v: number) {
  const dx0 = u - 0.5
  const dy0 = v - 0.5
  const r = Math.min(1, Math.hypot(dx0, dy0) * 2)
  const toCenter = Math.atan2(-dy0, -dx0) * RAD
  switch (f.align) {
    case 'center':
      return toCenter
    case 'outward':
      return toCenter + 180
    case 'swirl':
      return toCenter + 90
    case 'truchet':
      return Math.floor(hash01(f.seed, x, y) * 4) * 90
    case 'wave':
      return 45 * Math.sin(TAU * (r / f.period + f.phase / 360)) * (f.invert ? -1 : 1)
    case 'none':
      return 0
  }
}

/** Raw (unclamped) offset direction of the offset modulator. */
function offsetRaw(f: FieldSettings, c: FieldCell): [number, number] {
  const rad = Math.hypot(c.u - 0.5, c.v - 0.5) || 1
  const nx = (c.u - 0.5) / rad
  const ny = (c.v - 0.5) / rad
  switch (f.offset) {
    case 'vortex':
      return [-ny, nx]
    case 'magnet':
      return [-nx * c.r, -ny * c.r]
    case 'drift': {
      const at = f.angle * (Math.PI / 180)
      const a = along(f, c.u * c.w, c.v * c.h)
      const s = Math.sin(TAU * (a / f.period + f.phase / 360))
      return [Math.cos(at) * s, Math.sin(at) * s]
    }
    case 'scatter':
      return [hash01(f.seed, c.x, c.y) * 2 - 1, hash01(f.seed + 77, c.x, c.y) * 2 - 1]
    case 'none':
      return [0, 0]
  }
}

/**
 * Field sample at one cell. `x`/`y` are the cell's top-left corner in a `w`×`h` grid of cells;
 * fields read the cell center. Offsets never push the figure outside its cell: they clamp to half
 * the space the scaled figure leaves free.
 */
export function fieldAt(f: FieldSettings, x: number, y: number, w: number, h: number): FieldSample {
  const sizeOn = f.size !== 'none'
  const alignOn = f.align !== 'none'
  const offsetOn = f.offset !== 'none'
  if (!sizeOn && !alignOn && !offsetOn) return { scale: 1, angle: 0, dx: 0, dy: 0 }
  const u = w > 1 ? Math.min(1, Math.max(0, (x + 0.5) / w)) : 0.5
  const v = h > 1 ? Math.min(1, Math.max(0, (y + 0.5) / h)) : 0.5
  const dx0 = u - 0.5
  const dy0 = v - 0.5
  const c: FieldCell = {
    x,
    y,
    w,
    h,
    u,
    v,
    // Chebyshev-normalized radius: the rect corners read r = 1 on every aspect ratio
    r: Math.min(1, Math.hypot(dx0, dy0) * 2),
  }

  let scale = 1
  if (sizeOn) {
    const t = sizeValue(f, c)
    scale = f.min + (1 - f.min) * (1 - f.amount + f.amount * (f.invert ? 1 - t : t))
  }
  const angle = alignOn ? ((alignAngle(f, x, y, u, v) % 360) + 360) % 360 : 0
  // shrunk figures keep their cell free; full-size figures may drift a quarter cell
  const free = offsetOn ? Math.max(0.5 * (1 - scale), 0.25) : 0
  const [rx, ry] = offsetOn ? offsetRaw(f, c) : [0, 0]
  return {
    scale,
    angle,
    dx: Math.max(-free, Math.min(free, rx * f.amount * 0.5)),
    dy: Math.max(-free, Math.min(free, ry * f.amount * 0.5)),
  }
}

/** Composed per-cell modulation of the square-grid path: noise jitter × position field. */
export function cellModulation(
  doc: Doc,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): { shrink: number; angle: number; dx: number; dy: number } {
  let shrink = 1
  let angle = 0
  let dx = 0
  let dy = 0
  if (hasJitter(doc.style)) {
    const j = jitterAt(doc.style, by * bw + bx, bw)
    shrink = j.size
    angle = j.angle
  }
  const field = doc.style.field
  if (field.size !== 'none' || field.align !== 'none' || field.offset !== 'none') {
    const f = fieldAt(field, bx, by, bw, bh)
    shrink *= f.scale
    angle = (angle + f.angle) % 360
    dx = f.dx
    dy = f.dy
  }
  return { shrink, angle, dx, dy }
}
