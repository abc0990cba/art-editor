/**
 * Public API of the cell form family: registry data (cell-shape-defs), unit silhouettes and hit
 * tests (cell-shape-geom), SVG path fragments (cell-shape-frag). Canvas, PNG/SVG export and the
 * glyph ramp generators all consume the form geometry through this single module.
 */

export {
  CELL_SHAPES,
  CELL_SHAPE_IDS,
  DEFAULT_SHAPE_PARAMS,
  isCellShapeId,
  isCurvedShape,
  normalizeShapeParams,
  paramsOf,
  sameShapeParams,
} from './defs.ts'
export type { CellShapeId, ShapeParams } from './defs.ts'
export { cellShapeHit } from './geom.ts'
export { cellShapeFragment, shapePreviewPath } from './frag.ts'
