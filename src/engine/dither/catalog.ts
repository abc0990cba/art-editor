/**
 * The dither algorithm catalog: every import-dither id declared exactly once, with the strategy
 * family that executes it and the UI switches it enables. The pipeline dispatches through
 * DITHER_CATALOG (import-image's ditherSample) and the dialog's grouped select and visual gallery
 * derive from it, so a new algorithm is one union member + one catalog row + its implementation
 * entry — never a UI edit. Pure data.
 */

/** Which strategy family executes a dither — also the dialog group order. */
export type DitherFamily = 'off' | 'ordered' | 'diffusion' | 'path' | 'hybrid' | 'special' | 'glyph'

/** One catalog row: family membership plus the controls the algorithm enables. */
export interface DitherDef {
  family: DitherFamily
  /** Ordered algorithms: show the threshold bias slider (0..255). */
  threshold?: boolean
  /** Tile-set strategies: show the glyph-set picker. */
  glyphPicker?: boolean
}

/** Every import dither id, grouped by family in display order. */
export type ImportDither =
  | 'none'
  // ordered (threshold matrices and procedural fields)
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'bayer32'
  | 'cluster-dot'
  | 'halftone'
  | 'rosette'
  | 'elliptical'
  | 'euclidean'
  | 'lines-h'
  | 'lines-v'
  | 'lines-diag'
  | 'screen-45'
  | 'screen-wave'
  | 'ign'
  | 'blue-noise'
  | 'blue-noise-16'
  | 'void-cluster'
  | 'pattern'
  | 'crosshatch'
  | 'spiral'
  | 'rings'
  | 'sunburst'
  | 'phyllotaxis'
  | 'zigzag'
  | 'fractal-noise'
  | 'weave'
  | 'twill'
  | 'houndstooth'
  | 'custom-matrix'
  // error diffusion (coefficient kernels)
  | 'floyd'
  | 'atkinson'
  | 'sierra'
  | 'sierra-2'
  | 'sierra-lite'
  | 'stucki'
  | 'burkes'
  | 'jjn'
  | 'stevenson-arce'
  | 'nakano'
  | 'diffusion-1d'
  | 'spread-h'
  | 'spread-v'
  // path diffusion (error memory along a scan path)
  | 'column-path'
  | 'diagonal-path'
  | 'spiral-path'
  | 'hilbert'
  | 'random-path'
  // glyph tiles (user-editable, see engine/glyph-tiles.ts)
  | 'glyph'
  | 'palette-glyph'
  | 'ascii'
  | 'braille'
  // special diffusion
  | 'ostromoukhov'
  | 'variable-error'
  | 'dot-diffusion'
  | 'riemersma'
  | 'noise-threshold'
  | 'edge-aware'
  | 'yliluoma'
  | 'cmyk'
  | 'posterize'
  | 'hybrid'

/** The catalog: id → family + enabled controls. */
export const DITHER_CATALOG: Readonly<Record<ImportDither, DitherDef>> = {
  none: { family: 'off' },
  bayer2: { family: 'ordered', threshold: true },
  bayer4: { family: 'ordered', threshold: true },
  bayer8: { family: 'ordered', threshold: true },
  bayer16: { family: 'ordered', threshold: true },
  bayer32: { family: 'ordered', threshold: true },
  'cluster-dot': { family: 'ordered', threshold: true },
  halftone: { family: 'ordered', threshold: true },
  rosette: { family: 'ordered', threshold: true },
  elliptical: { family: 'ordered', threshold: true },
  euclidean: { family: 'ordered', threshold: true },
  'lines-h': { family: 'ordered', threshold: true },
  'lines-v': { family: 'ordered', threshold: true },
  'lines-diag': { family: 'ordered', threshold: true },
  'screen-45': { family: 'ordered', threshold: true },
  'screen-wave': { family: 'ordered', threshold: true },
  ign: { family: 'ordered', threshold: true },
  'blue-noise': { family: 'ordered', threshold: true },
  'blue-noise-16': { family: 'ordered', threshold: true },
  'void-cluster': { family: 'ordered', threshold: true },
  pattern: { family: 'ordered', threshold: true },
  crosshatch: { family: 'ordered', threshold: true },
  spiral: { family: 'ordered', threshold: true },
  rings: { family: 'ordered', threshold: true },
  sunburst: { family: 'ordered', threshold: true },
  phyllotaxis: { family: 'ordered', threshold: true },
  zigzag: { family: 'ordered', threshold: true },
  'fractal-noise': { family: 'ordered', threshold: true },
  weave: { family: 'ordered', threshold: true },
  twill: { family: 'ordered', threshold: true },
  houndstooth: { family: 'ordered', threshold: true },
  'custom-matrix': { family: 'ordered', threshold: true, glyphPicker: true },
  floyd: { family: 'diffusion' },
  atkinson: { family: 'diffusion' },
  sierra: { family: 'diffusion' },
  'sierra-2': { family: 'diffusion' },
  'sierra-lite': { family: 'diffusion' },
  stucki: { family: 'diffusion' },
  burkes: { family: 'diffusion' },
  jjn: { family: 'diffusion' },
  'stevenson-arce': { family: 'diffusion' },
  nakano: { family: 'diffusion' },
  'diffusion-1d': { family: 'diffusion' },
  'spread-h': { family: 'diffusion' },
  'spread-v': { family: 'diffusion' },
  'column-path': { family: 'path' },
  'diagonal-path': { family: 'path' },
  'spiral-path': { family: 'path' },
  hilbert: { family: 'path' },
  'random-path': { family: 'path' },
  glyph: { family: 'glyph', glyphPicker: true },
  'palette-glyph': { family: 'glyph', glyphPicker: true },
  ascii: { family: 'glyph' },
  braille: { family: 'glyph' },
  ostromoukhov: { family: 'special' },
  'variable-error': { family: 'special' },
  'dot-diffusion': { family: 'special' },
  riemersma: { family: 'special' },
  'noise-threshold': { family: 'special' },
  'edge-aware': { family: 'special' },
  yliluoma: { family: 'special' },
  cmyk: { family: 'special' },
  posterize: { family: 'special' },
  hybrid: { family: 'hybrid' },
}

/** Families in dialog display order. */
export const DITHER_FAMILIES: readonly DitherFamily[] = [
  'off',
  'ordered',
  'diffusion',
  'path',
  'hybrid',
  'special',
  'glyph',
]

/** Ids of one family, in catalog order. */
export function dithersOfFamily(family: DitherFamily): ImportDither[] {
  return (Object.keys(DITHER_CATALOG) as ImportDither[]).filter(
    (id) => DITHER_CATALOG[id].family === family,
  )
}

/** Ordered dithers: tone compared against a threshold matrix; the threshold bias applies. */
export const ORDERED_DITHERS: ReadonlySet<ImportDither> = new Set(dithersOfFamily('ordered'))
