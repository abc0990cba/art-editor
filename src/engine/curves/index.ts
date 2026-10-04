/** Editable Bézier paths for the pen tool: model, flattening, editing, simplification, raster. */

export {
  clonePath,
  emptyPath,
  makeAnchor,
  pathFromD,
  pathToD,
  segmentCubic,
  segmentCount,
  segmentEnd,
} from './model.ts'
export type { CurveAnchor, CurvePath, Pt } from './model.ts'
export {
  FLATTEN_TOL,
  cubicAt,
  flattenCubic,
  flattenPath,
  nearestOnSegment,
  splitCubic,
} from './flatten.ts'
export {
  bendSegment,
  constrainPoint,
  deleteAnchor,
  hitPen,
  insertAnchor,
  moveAnchor,
  setHandle,
  smoothAll,
  smoothAnchor,
  toggleSmooth,
} from './edit.ts'
export type { AngleSnap, PenHit } from './edit.ts'
export { SIMPLIFY_TOL, simplifyPath } from './simplify.ts'
export { pathCells, pathInk, pathStrokeLine } from './raster.ts'
export type { PathInk, PenRasterOpts } from './raster.ts'
