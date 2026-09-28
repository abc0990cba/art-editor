import { brushAnchor } from '../../engine/brush.ts'
import { hasDefaultConcentricRadii, isShapeTool } from '../../engine/shapes.ts'
import type { ToolOpts } from '../../state/tools.slice.ts'

/** The parametric source-graph spec a single-color shape stroke commits as. */
export interface ParametricSpec {
  op: string
  params: Record<string, number | string | boolean>
}

export interface ShapeCommitParams {
  tool: string
  /** Square buffer semantics: the node rasterizes in square buffer cells */
  isSquare: boolean
  /** Buffer cells per doc unit */
  sub: number
  brushSize: number
  brushSnap: boolean
  /** Free (unsnappped) drag flag of the stroke, as captured by stampShape */
  free: boolean
  /** ShapePaint.fill === 'none': only the outline was stamped */
  strokeOnly: boolean
  /** The stroke is one single color, so a parametric node could own it */
  singleColor: boolean
  /**
   * The stroke was drawn with symmetry copies. A single source node reproduces only the primary
   * copy — and its evaluation discards the stored ink — so symmetric strokes must commit as plain
   * pixels, exactly as previewed.
   */
  symmetryActive: boolean
  /** The one ink color (stroke color when stroked, else the fill color) */
  inkColor: string
  /** Drag endpoints in doc units, as recorded from pointerdown/move */
  start: [number, number]
  last: [number, number]
  concentricRadii: readonly number[]
  toolOpts: ToolOpts
}

/**
 * Build the parametric source node a shape stroke commits as, or undefined when it must commit as
 * plain pixels. The node re-rasterizes the shape from parameters and paints the result over the
 * committed ink, so it may stand in for the stroke only when it reproduces the drag preview
 * exactly: a thick stroke nib, custom concentric radii and non-square grids render differently. The
 * endpoints are quantized exactly like the preview stamped them (stampShape's pt()), so the
 * regeneration lands on the same pixels the user saw while dragging.
 */
export function shapeParametric(p: ShapeCommitParams): ParametricSpec | undefined {
  let parametrizable =
    p.isSquare &&
    !p.symmetryActive &&
    p.singleColor &&
    (p.brushSize === 1 || !p.strokeOnly) &&
    hasDefaultConcentricRadii(p.concentricRadii)
  if (!parametrizable) return undefined
  // quantize like stampShape: floor into buffer cells, then the pixel-size snap
  const q = (v: [number, number]): [number, number] => {
    const bx = Math.floor(v[0] * p.sub)
    const by = Math.floor(v[1] * p.sub)
    if (p.brushSize === 1 || !(p.brushSnap && !p.free)) return [bx, by]
    return brushAnchor(bx, by, p.brushSize, true)
  }
  const s0 = q(p.start)
  const s1 = q(p.last)
  const minX = Math.min(s0[0], s1[0])
  const minY = Math.min(s0[1], s1[1])
  const maxX = Math.max(s0[0], s1[0])
  const maxY = Math.max(s0[1], s1[1])
  // a shape node's box is at least 3×3 and an ellipse ring needs a non-degenerate box; smaller
  // drags stay plain pixels so the node's clamped params cannot redraw a different shape
  if (p.tool === 'ellipse') parametrizable = maxX - minX >= 1 && maxY - minY >= 1
  else if (isShapeTool(p.tool)) parametrizable = maxX - minX >= 2 && maxY - minY >= 2
  if (!parametrizable || minX < 0 || minY < 0) return undefined
  const base = { color: p.inkColor, fill: !p.strokeOnly }
  if (p.tool === 'rect')
    return {
      op: 'source.rect',
      params: {
        ...base,
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        shapeCorner: p.toolOpts.shapeCorner,
        shapeBulge: p.toolOpts.shapeBulge,
      },
    }
  if (p.tool === 'ellipse')
    return {
      op: 'source.ellipse',
      params: {
        ...base,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        rx: Math.max(0.5, (maxX - minX) / 2),
        ry: Math.max(0.5, (maxY - minY) / 2),
        ellipsePower: p.toolOpts.ellipsePower,
      },
    }
  if (p.tool === 'line')
    return {
      op: 'source.line',
      params: { x0: s0[0], y0: s0[1], x1: s1[0], y1: s1[1], color: p.inkColor },
    }
  if (isShapeTool(p.tool))
    return {
      op: 'source.shape',
      params: {
        ...base,
        shape: p.tool,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        ...p.toolOpts,
      },
    }
  return undefined
}
