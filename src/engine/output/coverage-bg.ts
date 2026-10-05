import type { Doc } from '../core/doc'
import { docExtent } from '../core/doc'
import { gridCoveragePoly } from '../grids'

/**
 * The document background, painted over the drawable coverage only: radial plates fill the
 * inscribed disc and rotated plates the turned rect, matching the stage — nothing renders where no
 * cell can exist. Canvas contexts must already be scaled so 1 unit = 1 doc unit.
 */

const r3 = (v: number): number => Math.round(v * 1000) / 1000

function isFullPlate(pts: { x: number; y: number }[], w: number, h: number): boolean {
  return (
    pts.length === 4 && pts[0]!.x === 0 && pts[0]!.y === 0 && pts[2]!.x === w && pts[2]!.y === h
  )
}

/** Fill the drawable coverage of the doc's plate with `color` (doc-unit space). */
export function fillCoverageBg(ctx: CanvasRenderingContext2D, doc: Doc, color: string): void {
  const { w, h } = docExtent(doc)
  const pts = gridCoveragePoly(doc)
  ctx.fillStyle = color
  if (isFullPlate(pts, w, h)) {
    // a 1-unit bleed so rounded canvas sizes never leave a hairline strip unpainted
    ctx.fillRect(-1, -1, w + 2, h + 2)
    return
  }
  const path = new Path2D()
  pts.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
  path.closePath()
  ctx.fill(path)
}

/** SVG element painting the same coverage background. */
export function coverageBgElement(doc: Doc, color: string): string {
  const { w, h } = docExtent(doc)
  const pts = gridCoveragePoly(doc)
  if (isFullPlate(pts, w, h)) {
    return `<rect x="0" y="0" width="${w}" height="${h}" fill="${color}"/>`
  }
  const points = pts.map((p) => `${r3(p.x)},${r3(p.y)}`).join(' ')
  return `<polygon points="${points}" fill="${color}"/>`
}
