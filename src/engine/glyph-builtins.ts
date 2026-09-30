/**
 * Curated registry of built-in glyph tile sets, grouped into families for the gallery: matrices
 * (ordered-dither ramps), dots, lines, shapes (diamonds/squares/stars/morphs), patterns
 * (checker/corner/medallion/scales/bricks/grain/pinwheel) and ornaments (cross-stitch, hearts,
 * mosaic). Procedural generators live in glyph-generators.ts / glyph-generators-art.ts.
 */

import type { CellShapeId } from './cell-shapes.ts'
import { BAYER2, BAYER4, BAYER8 } from './dither-matrices.ts'
import {
  glyphSetArgyle,
  glyphSetBubbles,
  glyphSetCrossStitch,
  glyphSetCrystal,
  glyphSetHalftone,
  glyphSetHatch,
  glyphSetHearts,
  glyphSetRipples,
  glyphSetSilk,
  glyphSetSunburst,
  glyphSetTesserae,
  glyphSetTriangles,
} from './glyph-generators-art.ts'
import { glyphSetForm, glyphSetFormDuo, glyphSetFormMorph } from './glyph-generators-forms.ts'
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

export type GlyphFamily = 'forms' | 'matrix' | 'dots' | 'lines' | 'shapes' | 'patterns' | 'ornament'

/** Gallery display order of the families. */
export const GLYPH_FAMILY_ORDER: readonly GlyphFamily[] = [
  'forms',
  'matrix',
  'dots',
  'lines',
  'shapes',
  'patterns',
  'ornament',
]

export interface BuiltInGlyphSet {
  id: string
  family: GlyphFamily
  set: GlyphTileSet
  /** Forms-family ramps: the cell form this glyph draws with (applied on pick) */
  form?: CellShapeId
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
  { id: 'glyph-halftone6', family: 'dots', set: glyphSetHalftone(6, 13, 'Растровые точки') },
  { id: 'glyph-bubbles12', family: 'dots', set: glyphSetBubbles(12, 17, 'Пузыри') },
  // lines
  { id: 'glyph-hlines', family: 'lines', set: glyphSetLines('h', 4, 9, 'Линии — горизонталь') },
  { id: 'glyph-vlines', family: 'lines', set: glyphSetLines('v', 4, 9, 'Линии — вертикаль') },
  { id: 'glyph-diag', family: 'lines', set: glyphSetLines('diag', 4, 9, 'Линии — диагональ') },
  { id: 'glyph-chevron', family: 'lines', set: glyphSetChevron(6, 9, 'Ёлочка') },
  { id: 'glyph-waves8', family: 'lines', set: glyphSetWaves(8, 17, 'Волны 8×8') },
  { id: 'glyph-waves16', family: 'lines', set: glyphSetWaves(16, 17, 'Волны 16×16') },
  { id: 'glyph-hatch8', family: 'lines', set: glyphSetHatch(8, 13, 'Гравюра') },
  { id: 'glyph-ripples12', family: 'lines', set: glyphSetRipples(12, 17, 'Рябь') },
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
  { id: 'glyph-sunburst12', family: 'shapes', set: glyphSetSunburst(12, 17, 'Лучи') },
  { id: 'glyph-crystal12', family: 'shapes', set: glyphSetCrystal(12, 17, 'Кристалл') },
  { id: 'glyph-triangles6', family: 'shapes', set: glyphSetTriangles(6, 13, 'Треугольники') },
  // forms: the minimum element of every tile is a registered cell form, not a square —
  // each ramp is the analogue of a black→white gradient drawn with one figure
  {
    id: 'glyph-form-circle12',
    family: 'forms',
    form: 'circle',
    set: glyphSetForm('circle', 12, 17, 'Круг'),
  },
  {
    id: 'glyph-form-ring12',
    family: 'forms',
    form: 'ring',
    set: glyphSetForm('ring', 12, 17, 'Кольцо'),
  },
  {
    id: 'glyph-form-square12',
    family: 'forms',
    form: 'square',
    set: glyphSetForm('square', 12, 17, 'Квадрат'),
  },
  {
    id: 'glyph-form-triangle12',
    family: 'forms',
    form: 'triangle',
    set: glyphSetForm('triangle', 12, 17, 'Треугольник'),
  },
  {
    id: 'glyph-form-triangle-down12',
    family: 'forms',
    form: 'triangleDown',
    set: glyphSetForm('triangleDown', 12, 17, 'Треугольник вниз'),
  },
  {
    id: 'glyph-form-diamond12',
    family: 'forms',
    form: 'diamond',
    set: glyphSetForm('diamond', 12, 17, 'Ромб'),
  },
  {
    id: 'glyph-form-cross12',
    family: 'forms',
    form: 'cross',
    set: glyphSetForm('cross', 12, 17, 'Крест'),
  },
  {
    id: 'glyph-form-xcross12',
    family: 'forms',
    form: 'xCross',
    set: glyphSetForm('xCross', 12, 17, 'Крест-накрест'),
  },
  {
    id: 'glyph-form-star12',
    family: 'forms',
    form: 'star',
    set: glyphSetForm('star', 12, 17, 'Звезда'),
  },
  {
    id: 'glyph-form-sparkle12',
    family: 'forms',
    form: 'sparkle',
    set: glyphSetForm('sparkle', 12, 17, 'Искра'),
  },
  {
    id: 'glyph-form-hexagon12',
    family: 'forms',
    form: 'hexagon',
    set: glyphSetForm('hexagon', 12, 17, 'Шестиугольник'),
  },
  {
    id: 'glyph-form-heart12',
    family: 'forms',
    form: 'heart',
    set: glyphSetForm('heart', 12, 17, 'Сердце'),
  },
  {
    id: 'glyph-form-moon12',
    family: 'forms',
    form: 'moon',
    set: glyphSetForm('moon', 12, 17, 'Месяц'),
  },
  {
    id: 'glyph-form-teardrop12',
    family: 'forms',
    form: 'teardrop',
    set: glyphSetForm('teardrop', 12, 17, 'Капля'),
  },
  {
    id: 'glyph-form-flower12',
    family: 'forms',
    form: 'flower',
    set: glyphSetForm('flower', 12, 17, 'Цветок'),
  },
  {
    id: 'glyph-form-semicircle12',
    family: 'forms',
    form: 'semicircle',
    set: glyphSetForm('semicircle', 12, 17, 'Полукруг'),
  },
  {
    id: 'glyph-form-gear12',
    family: 'forms',
    form: 'gear',
    set: glyphSetForm('gear', 12, 17, 'Шестерня'),
  },
  {
    id: 'glyph-form-asterisk12',
    family: 'forms',
    form: 'asterisk',
    set: glyphSetForm('asterisk', 12, 17, 'Астериск'),
  },
  {
    id: 'glyph-form-lightning12',
    family: 'forms',
    form: 'lightning',
    set: glyphSetForm('lightning', 12, 17, 'Молния'),
  },
  {
    id: 'glyph-form-chevron12',
    family: 'forms',
    form: 'chevron',
    set: glyphSetForm('chevron', 12, 17, 'Шеврон'),
  },
  // two figures at once on interleaved lattices (pitch = lattice density)
  {
    id: 'glyph-duo-stars-dots12',
    family: 'forms',
    set: glyphSetFormDuo('star', 'circle', 12, 17, { name: 'Звёзды и круги' }),
  },
  {
    id: 'glyph-duo-hearts-diamonds12',
    family: 'forms',
    set: glyphSetFormDuo('heart', 'diamond', 12, 17, { name: 'Сердца и ромбы' }),
  },
  {
    id: 'glyph-duo-cross-rings12',
    family: 'forms',
    set: glyphSetFormDuo('cross', 'ring', 12, 17, { name: 'Крестики и кольца' }),
  },
  {
    id: 'glyph-duo-stars-dots-fine12',
    family: 'forms',
    set: glyphSetFormDuo('star', 'circle', 12, 17, { name: 'Звёзды и круги 3×3', pitch: 3 }),
  },
  // one figure transforms into another across the tone ramp
  {
    id: 'glyph-morph-star-heart12',
    family: 'forms',
    set: glyphSetFormMorph('star', 'heart', 12, 17, 'Морф: звезда → сердце'),
  },
  {
    id: 'glyph-morph-circle-cross12',
    family: 'forms',
    set: glyphSetFormMorph('circle', 'cross', 12, 17, 'Морф: круг → крест'),
  },
  {
    id: 'glyph-morph-triangle-hexagon12',
    family: 'forms',
    set: glyphSetFormMorph('triangle', 'hexagon', 12, 17, 'Морф: треугольник → шестиугольник'),
  },
  // patterns
  { id: 'glyph-checker', family: 'patterns', set: glyphSetChecker(4, 9, 'Шахматка') },
  { id: 'glyph-corner', family: 'patterns', set: glyphSetCorner(4, 9, 'Диагональный склон') },
  { id: 'glyph-medallion8', family: 'patterns', set: glyphSetMedallion(8, 17, 'Медальон') },
  { id: 'glyph-scales8', family: 'patterns', set: glyphSetScales(8, 17, 'Чешуя 8×8') },
  { id: 'glyph-scales16', family: 'patterns', set: glyphSetScales(16, 17, 'Чешуя 16×16') },
  { id: 'glyph-bricks8', family: 'patterns', set: glyphSetBricks(8, 17, 'Кирпичи') },
  { id: 'glyph-grain8', family: 'patterns', set: glyphSetGrain(8, 17, 'Зерно') },
  { id: 'glyph-pinwheel8', family: 'patterns', set: glyphSetPinwheel(8, 17, 'Вертушка') },
  { id: 'glyph-silk16', family: 'patterns', set: glyphSetSilk(16, 25, 'Шёлк') },
  { id: 'glyph-argyle12', family: 'patterns', set: glyphSetArgyle(12, 13, 'Аргайл') },
  // ornaments
  { id: 'glyph-crossstitch10', family: 'ornament', set: glyphSetCrossStitch(10, 13, 'Крестик') },
  { id: 'glyph-hearts12', family: 'ornament', set: glyphSetHearts(12, 13, 'Сердца') },
  { id: 'glyph-tesserae10', family: 'ornament', set: glyphSetTesserae(10, 17, 'Мозаика') },
]

export function builtInGlyphEntry(id: string): BuiltInGlyphSet | null {
  return BUILT_IN_GLYPH_SETS.find((b) => b.id === id) ?? null
}

export function builtInGlyphSetById(id: string): GlyphTileSet | null {
  return builtInGlyphEntry(id)?.set ?? null
}
