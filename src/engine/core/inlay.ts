/**
 * Inner-figure inlay: an optional second figure drawn inside every painted cell (pixels mode). Data
 * model + clamping; rendering lives in geometry/inlay.ts.
 */

import { isCellShapeId, type CellShapeId } from '../cell-shapes/index.ts'

/** Where the inlay color comes from. */
export type InlayColorMode = 'slot' | 'darken' | 'lighten' | 'toneDark' | 'toneLight'

export const INLAY_COLOR_MODES: readonly InlayColorMode[] = [
  'slot',
  'darken',
  'lighten',
  'toneDark',
  'toneLight',
]

export type InlaySource = 'shape' | 'glyph'
export type InlayDotShape = 'square' | 'circle'

export interface InlaySettings {
  /** Inner form from the cell-shape registry; 'none' disables the inlay */
  shape: CellShapeId | 'none'
  /** Content source: the registered form, or a sampled character dot matrix */
  source: InlaySource
  /** Glyph mode: the character (emoji/letter/symbol); the first grapheme is used */
  glyph: string
  /** Glyph mode: dot-matrix side, 4..12 */
  resolution: number
  /** Glyph mode: dot silhouette */
  dotShape: InlayDotShape
  /** Glyph mode: dot fill fraction of one matrix cell, 0.4..1 */
  dotScale: number
  /** Figure size as a fraction of the base figure box, 0.1..0.9 */
  scale: number
  /** Offset from the figure center as a fraction of the box, -0.5..0.5 per axis */
  offsetX: number
  offsetY: number
  /** Own rotation in degrees 0..360, added on top of the per-cell angle spread */
  rotation: number
  /** Shape knob: ring wall / arm width as a fraction of the inlay box, 0.05..0.5 */
  thickness: number
  /** Shape knob: star points / petals / teeth, 3..12 */
  points: number
  /** Inlay color source */
  colorMode: InlayColorMode
  /** Palette value for the `slot` mode (1-based, wraps modulo the palette length) */
  slot: number
  /** Darken/lighten strength 0..1 */
  depth: number
}

export const DEFAULT_INLAY: InlaySettings = {
  shape: 'none',
  source: 'shape',
  glyph: '😀',
  resolution: 8,
  dotShape: 'square',
  dotScale: 0.85,
  scale: 0.45,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  thickness: 0.25,
  points: 5,
  colorMode: 'darken',
  slot: 1,
  depth: 0.35,
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Glyph-mode fields: source toggle, character, dot-matrix geometry. */
function normalizeGlyphFields(
  p: Partial<InlaySettings>,
  base: InlaySettings,
): Pick<InlaySettings, 'source' | 'glyph' | 'resolution' | 'dotShape' | 'dotScale'> {
  return {
    source: p.source === 'glyph' || p.source === 'shape' ? p.source : base.source,
    glyph: typeof p.glyph === 'string' && p.glyph.length > 0 ? p.glyph : base.glyph,
    resolution: clamp(Math.round(Number(p.resolution) || base.resolution), 4, 12),
    dotShape: p.dotShape === 'circle' || p.dotShape === 'square' ? p.dotShape : base.dotShape,
    dotScale: clamp(Number(p.dotScale ?? base.dotScale), 0.4, 1),
  }
}

/** Defensive clamp of stored/raw inlay data; missing fields fall back to `base`. */
export function normalizeInlay(raw: unknown, base: InlaySettings = DEFAULT_INLAY): InlaySettings {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<InlaySettings>
  const shape = p.shape === 'none' || isCellShapeId(p.shape) ? p.shape : base.shape
  const rot = Number(p.rotation)
  return {
    shape,
    ...normalizeGlyphFields(p, base),
    scale: clamp(Number(p.scale ?? base.scale), 0.1, 0.9),
    offsetX: clamp(Number(p.offsetX ?? base.offsetX), -0.5, 0.5),
    offsetY: clamp(Number(p.offsetY ?? base.offsetY), -0.5, 0.5),
    rotation: Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : base.rotation,
    thickness: clamp(Number(p.thickness ?? base.thickness), 0.05, 0.5),
    points: clamp(Math.round(Number(p.points) || base.points), 3, 12),
    colorMode: INLAY_COLOR_MODES.includes(p.colorMode as InlayColorMode)
      ? (p.colorMode as InlayColorMode)
      : base.colorMode,
    slot: clamp(Math.round(Number(p.slot) || base.slot), 1, 9999),
    depth: clamp(Number(p.depth ?? base.depth), 0, 1),
  }
}

/** Equality of two inlay blocks (style grouping merges equal styles). */
export function sameInlay(a: InlaySettings, b: InlaySettings): boolean {
  return (
    a.shape === b.shape &&
    a.source === b.source &&
    a.glyph === b.glyph &&
    a.resolution === b.resolution &&
    a.dotShape === b.dotShape &&
    a.dotScale === b.dotScale &&
    a.scale === b.scale &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.rotation === b.rotation &&
    a.thickness === b.thickness &&
    a.points === b.points &&
    a.colorMode === b.colorMode &&
    a.slot === b.slot &&
    a.depth === b.depth
  )
}
