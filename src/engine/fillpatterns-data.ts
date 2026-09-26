import type { GlyphTileSet } from './glyph-tiles.ts'

/**
 * Pattern fills for the fill tool: two-color textures and dithered gradients in the classic
 * pixel-art style. A pattern decides per cell between the active color (A) and a second color (B);
 * a transition profile sets the mix ratio t per position, so the same patterns double as flat
 * textures (flat) or dithered gradients.
 */
export type FillPatternId =
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'cluster'
  | 'halftone'
  | 'screen'
  | 'blue-noise'
  | 'void-cluster'
  | 'noise'
  | 'ign'
  | 'checker'
  | 'grid'
  | 'hatch'
  | 'stripes-h'
  | 'stripes-v'
  | 'stripes-diag'
  | 'zigzag'
  | 'dots'
  | 'bricks'
  | 'rings'
  | 'glyph'

/** How the mix ratio t varies across the filled region. */
export type FillGradient = 'none' | 'vertical' | 'horizontal' | 'diag' | 'diag-inv' | 'radial'

/** Silhouette of the halftone screen dots. */
export type FillHtShape =
  | 'dot'
  | 'square'
  | 'diamond'
  | 'line'
  | 'ellipse'
  | 'star'
  | 'heart'
  | 'cross'

/** Halftone screen shapes in UI order. */
export const HT_SHAPES: FillHtShape[] = [
  'dot',
  'square',
  'diamond',
  'line',
  'ellipse',
  'star',
  'heart',
  'cross',
]

export interface FillStyle {
  mode: 'solid' | 'pattern'
  pattern: FillPatternId
  gradient: FillGradient
  /** Color B share 0..1, used when gradient = 'none' */
  density: number
  /** Second color pattern fills blend towards */
  color2: string
  /** Tile-size multiplier for scaled patterns (stripes, dots, checker, grid, …) */
  scale: number
  /** Noise block size in cells (noise, ign) */
  grain: number
  /** Halftone screen: dot silhouette */
  htShape: FillHtShape
  /** Halftone screen: grid rotation in degrees, 0..180 */
  htAngle: number
  /** Halftone screen: random dot displacement, 0..100 */
  htJitter: number
  /** Halftone screen: randomly missing dots, 0..100 */
  htDropout: number
  /** Tile set for the 'glyph' pattern; null falls back to a flat half fill */
  glyphSet: GlyphTileSet | null
}

export const DEFAULT_FILL_STYLE: FillStyle = {
  mode: 'solid',
  pattern: 'bayer4',
  gradient: 'none',
  density: 0.5,
  color2: '#ffffff',
  scale: 1,
  grain: 1,
  htShape: 'dot',
  glyphSet: null,
  htAngle: 45,
  htJitter: 0,
  htDropout: 0,
}

/** Pattern library in UI order. */
export const PATTERNS: FillPatternId[] = [
  'bayer2',
  'bayer4',
  'bayer8',
  'bayer16',
  'cluster',
  'halftone',
  'screen',
  'blue-noise',
  'void-cluster',
  'noise',
  'ign',
  'checker',
  'grid',
  'hatch',
  'stripes-h',
  'stripes-v',
  'stripes-diag',
  'zigzag',
  'dots',
  'bricks',
  'rings',
  'glyph',
]

/** Patterns whose tiles grow with the scale setting. */
export const SCALED_PATTERNS: ReadonlySet<FillPatternId> = new Set([
  'checker',
  'grid',
  'hatch',
  'stripes-h',
  'stripes-v',
  'stripes-diag',
  'zigzag',
  'dots',
  'bricks',
  'rings',
  'screen',
])

/** Patterns with a grain (noise block size) setting. */
export const GRAIN_PATTERNS: ReadonlySet<FillPatternId> = new Set(['noise', 'ign'])

/** Transition profiles in UI order. */
export const GRADIENTS: FillGradient[] = [
  'none',
  'vertical',
  'horizontal',
  'diag',
  'diag-inv',
  'radial',
]

/** Deterministic per-position noise in [0,1) — stable for a given cell coordinate. */
