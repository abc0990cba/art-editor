import type { Doc, Link } from '../core/doc.ts'
import { extrudeGeometry } from './extrude.ts'
import { contourGeometry, metaballGeometry } from './metaball.ts'
import { outlineGeometry } from './outline'
import { shapeGeometry } from './shape.ts'
import type { StyledPath } from './types.ts'

/**
 * Plain-square dispatch of one render mode — the one place a mode maps to a builder, shared by the
 * global, scene and element-scope build paths so a mode never renders differently per scope.
 * Non-square grids route through gridBuildGeometry before this.
 */
export function squareModeGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview = false,
): StyledPath[] {
  if (doc.renderMode === 'metaball') return metaballGeometry(doc, cells, links, preview).paths
  if (doc.renderMode === 'contour') return contourGeometry(doc, cells, links, preview).paths
  if (doc.renderMode === 'outline') return outlineGeometry(doc, cells, links)
  if (doc.renderMode === 'extrude') return extrudeGeometry(doc, cells, links).paths
  return shapeGeometry(doc, cells, links).paths
}
