/**
 * Grid-wide cell fields: position-driven per-cell modulators (size / align / offset) for pixels
 * mode. Data model + clamping; the evaluators live in effects/fields.ts.
 */

/** Kinds of the size modulator. */
export type FieldSizeKind =
  | 'none'
  | 'funnel'
  | 'fountain'
  | 'dome'
  | 'edges'
  | 'rampX'
  | 'rampY'
  | 'rampDiag'
  | 'waveX'
  | 'waveY'
  | 'rings'
  | 'spiral'
  | 'checker'

export const FIELD_SIZE_KINDS: readonly FieldSizeKind[] = [
  'none',
  'funnel',
  'fountain',
  'dome',
  'edges',
  'rampX',
  'rampY',
  'rampDiag',
  'waveX',
  'waveY',
  'rings',
  'spiral',
  'checker',
]

/** Kinds of the rotation modulator. */
export type FieldAlignKind = 'none' | 'center' | 'outward' | 'swirl' | 'truchet' | 'wave'

export const FIELD_ALIGN_KINDS: readonly FieldAlignKind[] = [
  'none',
  'center',
  'outward',
  'swirl',
  'truchet',
  'wave',
]

/** Kinds of the in-cell offset modulator. */
export type FieldOffsetKind = 'none' | 'vortex' | 'magnet' | 'drift' | 'scatter'

export const FIELD_OFFSET_KINDS: readonly FieldOffsetKind[] = [
  'none',
  'vortex',
  'magnet',
  'drift',
  'scatter',
]

export interface FieldSettings {
  /** Size modulator kind */
  size: FieldSizeKind
  /** Rotation modulator kind */
  align: FieldAlignKind
  /** In-cell displacement modulator kind */
  offset: FieldOffsetKind
  /** Size strength 0..1: 0 = every figure at full cell, 1 = full min..1 range */
  amount: number
  /** Figure floor at the field low end, 0.05..1 of the cell */
  min: number
  /** Direction for ramps/waves/drift in degrees 0..359 */
  angle: number
  /** Wavelength of the periodic kinds in cells, 2..64 */
  period: number
  /** Phase shift of the periodic kinds, 0..359 */
  phase: number
  /** Seed for truchet steps and scatter offsets, 1..9999 */
  seed: number
  /** Flip every size field high end to low */
  invert: boolean
}

export const DEFAULT_FIELD: FieldSettings = {
  size: 'none',
  align: 'none',
  offset: 'none',
  amount: 1,
  min: 0.1,
  angle: 0,
  period: 8,
  phase: 0,
  seed: 1,
  invert: false,
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const norm360 = (v: number) => (Number.isFinite(v) ? ((v % 360) + 360) % 360 : 0)

/** Defensive clamp of stored/raw field data; missing kinds fall back to `base`. */
export function normalizeField(raw: unknown, base: FieldSettings = DEFAULT_FIELD): FieldSettings {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<FieldSettings>
  const kind = <K extends string>(v: unknown, allowed: readonly K[], fallback: K): K =>
    allowed.includes(v as K) ? (v as K) : fallback
  return {
    size: kind(p.size, FIELD_SIZE_KINDS, base.size),
    align: kind(p.align, FIELD_ALIGN_KINDS, base.align),
    offset: kind(p.offset, FIELD_OFFSET_KINDS, base.offset),
    amount: clamp(Number(p.amount ?? base.amount), 0, 1),
    min: clamp(Number(p.min ?? base.min), 0.05, 1),
    angle: norm360(Number(p.angle ?? base.angle)),
    period: clamp(Math.round(Number(p.period) || base.period), 2, 64),
    phase: norm360(Number(p.phase ?? base.phase)),
    seed: clamp(Math.round(Number(p.seed) || base.seed), 1, 9999),
    invert: p.invert === undefined ? base.invert : p.invert === true,
  }
}

/** Any modulator active (gates the fast paths). */
export function hasField(f: FieldSettings): boolean {
  return f.size !== 'none' || f.align !== 'none' || f.offset !== 'none'
}

/** Equality of two field blocks (style grouping merges equal styles). */
export function sameField(a: FieldSettings, b: FieldSettings): boolean {
  return (
    a.size === b.size &&
    a.align === b.align &&
    a.offset === b.offset &&
    a.amount === b.amount &&
    a.min === b.min &&
    a.angle === b.angle &&
    a.period === b.period &&
    a.phase === b.phase &&
    a.seed === b.seed &&
    a.invert === b.invert
  )
}
