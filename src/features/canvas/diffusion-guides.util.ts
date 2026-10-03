import type { Doc } from '../../engine/core/doc.ts'
import type { StageTheme } from '../../engine/core/stage-themes.ts'
import { metaballOverlayContours } from '../../engine/geometry/index.ts'
import { kernelRadius } from '../../engine/geometry/metaball-field.ts'
import type { Grid } from '../../engine/grids/index.ts'

/**
 * Metaball diffusion aids, kept out of CanvasStage to respect its size ratchet. All are canvas-only
 * overlays: the dashed threshold contour of the merged field, the kernel-radius ring at the hovered
 * cell, and (in grid-overlay.util) the half-cell line pitch. Nothing here is exported to SVG/PNG.
 */

/** Dashed accent contour of the metaball threshold (all layers), doc coordinates. */
export function diffusionContourPath(doc: Doc): Path2D | null {
  const ds = metaballOverlayContours(doc)
  if (ds.length === 0) return null
  const p = new Path2D()
  for (const d of ds) p.addPath(new Path2D(d))
  return p
}

/** The dashed threshold contour, screen-constant hairline. */
export function strokeDiffusionContour(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  zoom: number,
  theme: StageTheme,
): void {
  ctx.save()
  ctx.strokeStyle = theme.fieldContour
  ctx.lineWidth = 1.25 / zoom
  ctx.setLineDash([4 / zoom, 3 / zoom])
  ctx.stroke(path)
  ctx.restore()
}

/** Dashed ring of the effective kernel radius around a doc-space point (the fusion reach). */
export function strokeKernelRing(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  zoom: number,
  doc: Doc,
  theme: StageTheme,
): void {
  ctx.save()
  ctx.strokeStyle = theme.fieldContour
  ctx.lineWidth = 1.25 / zoom
  ctx.setLineDash([3 / zoom, 3 / zoom])
  ctx.beginPath()
  ctx.arc(center.x, center.y, kernelRadius(doc.metaball.strength, doc.sub), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Doc-space center of a hover index: buffer coords on the square grid, cell center otherwise. */
export function hoverCellCenter(
  idx: number,
  bw: number,
  sub: number,
  grid: Grid,
  isSquare: boolean,
): { x: number; y: number } {
  if (isSquare) {
    const gx = idx % bw
    const gy = (idx - gx) / bw
    return { x: (gx + 0.5) / sub, y: (gy + 0.5) / sub }
  }
  return grid.center(idx)
}
