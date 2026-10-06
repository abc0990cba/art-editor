/**
 * Hollow-cell stroke: renders every cell figure as an outline (pixels mode). Data model + clamping;
 * the emission lives in the geometry builders.
 */

export type StrokeColorMode = 'same' | 'darken' | 'lighten'

export const STROKE_COLOR_MODES: readonly StrokeColorMode[] = ['same', 'darken', 'lighten']

export interface StrokeSettings {
  /** Stroke width as a fraction of the cell pitch, 0..0.45; 0 = off */
  width: number
  /** Stroke color source */
  colorMode: StrokeColorMode
  /** Darken/lighten strength 0..1 */
  depth: number
  /** Keep the fill under the stroke (rim look) or render hollow outlines */
  fill: boolean
}

export const DEFAULT_STROKE: StrokeSettings = {
  width: 0,
  colorMode: 'same',
  depth: 0.35,
  fill: true,
}

import { shadeHex, tintHex } from '../color/shade.ts'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Defensive clamp of stored/raw stroke data; missing fields fall back to `base`. */
export function normalizeStroke(
  raw: unknown,
  base: StrokeSettings = DEFAULT_STROKE,
): StrokeSettings {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<StrokeSettings>
  return {
    width: clamp(Number(p.width ?? base.width), 0, 0.45),
    colorMode: STROKE_COLOR_MODES.includes(p.colorMode as StrokeColorMode)
      ? (p.colorMode as StrokeColorMode)
      : base.colorMode,
    depth: clamp(Number(p.depth ?? base.depth), 0, 1),
    fill: p.fill === undefined ? base.fill : p.fill === true,
  }
}

/** Equality of two stroke blocks (style grouping merges equal styles). */
export function sameStroke(a: StrokeSettings, b: StrokeSettings): boolean {
  return (
    a.width === b.width && a.colorMode === b.colorMode && a.depth === b.depth && a.fill === b.fill
  )
}

export const isStrokeOn = (s: StrokeSettings): boolean => s.width > 0

/** Resolved stroke color for one palette value (same cell color / darkened / lightened). */
export function strokeColorOf(palette: readonly string[], s: StrokeSettings, v: number): string {
  const base = palette.length > 0 ? (palette[(v - 1) % palette.length] ?? '#888') : '#888'
  if (s.colorMode === 'darken') return shadeHex(base, s.depth)
  if (s.colorMode === 'lighten') return tintHex(base, s.depth)
  return base
}
