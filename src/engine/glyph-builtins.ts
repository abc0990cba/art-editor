/**
 * Curated registry of built-in glyph tile sets, grouped into families for the gallery: matrices
 * (ordered-dither ramps), dots, lines, shapes (diamonds/squares/stars/morphs) and patterns
 * (checker/corner/medallion/scales/bricks/grain/pinwheel). Procedural generators live in
 * glyph-generators.ts.
 */

import { BAYER2, BAYER4, BAYER8 } from './dither-matrices.ts'
import {
  glyphSetBricks,
  glyphSetChecker,
  glyphSetChevron,
  glyphSetCorner,
  glyphSetCross,
  glyphSetDiamonds,
  glyphSetDots,
  glyphSetShapeMorph,
  glyphSetGrain,
  glyphSetGridDots,
  glyphSetLines,
  glyphSetMedallion,
  glyphSetPinwheel,
  glyphSetRings,
  glyphSetScales,
  glyphSetSquares,
  glyphSetStars,
  glyphSetWaves,
} from './glyph-generators.ts'
import { glyphSetFromMatrix, type GlyphTileSet } from './glyph-tiles.ts'

export type GlyphFamily = 'matrix' | 'dots' | 'lines' | 'shapes' | 'patterns'

/** Gallery display order of the families. */
export const GLYPH_FAMILY_ORDER: readonly GlyphFamily[] = [
  'matrix',
  'dots',
  'lines',
  'shapes',
  'patterns',
]

export interface BuiltInGlyphSet {
  id: string
  family: GlyphFamily
  set: GlyphTileSet
}

export const BUILT_IN_GLYPH_SETS: readonly BuiltInGlyphSet[] = [
  // matrices
  { id: 'glyph-bayer2', family: 'matrix', set: glyphSetFromMatrix(BAYER2, 'Байер 2×2') },
  { id: 'glyph-bayer4', family: 'matrix', set: glyphSetFromMatrix(BAYER4, 'Байер 4×4') },
  { id: 'glyph-bayer8', family: 'matrix', set: glyphSetFromMatrix(BAYER8, 'Байер 8×8') },
  // dots
  { id: 'glyph-dots4', family: 'dots', set: glyphSetDots(4, 17, 'Точки 4×4') },
  { id: 'glyph-dots8', family: 'dots', set: glyphSetDots(8, 17, 'Точки 8×8') },
  { id: 'glyph-dots16', family: 'dots', set: glyphSetDots(16, 17, 'Точки 16×16') },
  { id: 'glyph-griddots4', family: 'dots', set: glyphSetGridDots(4, 9, 'Точечная решётка') },
  { id: 'glyph-griddots8', family: 'dots', set: glyphSetGridDots(8, 17, 'Точечная решётка 8×8') },
  {
    id: 'glyph-griddots16',
    family: 'dots',
    set: glyphSetGridDots(16, 17, 'Точечная решётка 16×16'),
  },
  // lines
  { id: 'glyph-hlines', family: 'lines', set: glyphSetLines('h', 4, 9, 'Линии — горизонталь') },
  { id: 'glyph-vlines', family: 'lines', set: glyphSetLines('v', 4, 9, 'Линии — вертикаль') },
  { id: 'glyph-diag', family: 'lines', set: glyphSetLines('diag', 4, 9, 'Линии — диагональ') },
  { id: 'glyph-chevron', family: 'lines', set: glyphSetChevron(6, 9, 'Ёлочка') },
  { id: 'glyph-waves8', family: 'lines', set: glyphSetWaves(8, 17, 'Волны 8×8') },
  { id: 'glyph-waves16', family: 'lines', set: glyphSetWaves(16, 17, 'Волны 16×16') },
  // shapes
  { id: 'glyph-diamonds4', family: 'shapes', set: glyphSetDiamonds(4, 17, 'Ромбы 4×4') },
  { id: 'glyph-diamonds8', family: 'shapes', set: glyphSetDiamonds(8, 17, 'Ромбы 8×8') },
  { id: 'glyph-diamonds16', family: 'shapes', set: glyphSetDiamonds(16, 17, 'Ромбы 16×16') },
  { id: 'glyph-squares8', family: 'shapes', set: glyphSetSquares(8, 17, 'Квадраты кольцами') },
  {
    id: 'glyph-squares16',
    family: 'shapes',
    set: glyphSetSquares(16, 17, 'Квадраты кольцами 16×16'),
  },
  { id: 'glyph-cross4', family: 'shapes', set: glyphSetCross(4, 9, 'Крест 4×4') },
  { id: 'glyph-cross8', family: 'shapes', set: glyphSetCross(8, 17, 'Крест 8×8') },
  { id: 'glyph-rings8', family: 'shapes', set: glyphSetRings(8, 17, 'Кольца 8×8') },
  { id: 'glyph-rings16', family: 'shapes', set: glyphSetRings(16, 17, 'Кольца 16×16') },
  { id: 'glyph-stars8', family: 'shapes', set: glyphSetStars(8, 17, 'Звёзды 8×8') },
  { id: 'glyph-stars16', family: 'shapes', set: glyphSetStars(16, 17, 'Звёзды 16×16') },
  { id: 'glyph-morph8', family: 'shapes', set: glyphSetShapeMorph(8, 17, 'Морф 8×8') },
  { id: 'glyph-morph16', family: 'shapes', set: glyphSetShapeMorph(16, 25, 'Морф 16×16') },
  // patterns
  { id: 'glyph-checker', family: 'patterns', set: glyphSetChecker(4, 9, 'Шахматка') },
  { id: 'glyph-corner', family: 'patterns', set: glyphSetCorner(4, 9, 'Диагональный склон') },
  { id: 'glyph-medallion8', family: 'patterns', set: glyphSetMedallion(8, 17, 'Медальон') },
  { id: 'glyph-scales8', family: 'patterns', set: glyphSetScales(8, 17, 'Чешуя 8×8') },
  { id: 'glyph-scales16', family: 'patterns', set: glyphSetScales(16, 17, 'Чешуя 16×16') },
  { id: 'glyph-bricks8', family: 'patterns', set: glyphSetBricks(8, 17, 'Кирпичи') },
  { id: 'glyph-grain8', family: 'patterns', set: glyphSetGrain(8, 17, 'Зерно') },
  { id: 'glyph-pinwheel8', family: 'patterns', set: glyphSetPinwheel(8, 17, 'Вертушка') },
]

export function builtInGlyphSetById(id: string): GlyphTileSet | null {
  return BUILT_IN_GLYPH_SETS.find((b) => b.id === id)?.set ?? null
}
