import { checkerTileFor } from './canvas-stage.util.ts'
import { strokeDiffusionContour } from './diffusion-guides.util.ts'
import { buildLayer, pathId, type StagePaintParams } from './stage-paint.util.ts'

/**
 * Baked full-screen under/overlays of the base canvas: the background (solid fill or the
 * checkerboard pattern) below the artwork and the grid lines plus diffusion contour above it. Both
 * rebuild only when their inputs change (view, size, dpr, theme, grid, doc) — stroke frames then
 * composite them as single blits instead of re-stroking thousands of grid line segments per frame.
 */

/** Grid-on / diffusion-on gates for the baked grid layer (zoom thresholds included). */
function gridVisibility(p: StagePaintParams): { gridOn: boolean; diffusionOn: boolean } {
  return {
    gridOn: p.showGrid && p.view.zoom >= 4,
    diffusionOn: p.showDiffusion && p.view.zoom >= 2 && p.contourPath != null,
  }
}

function viewKeyOf(p: StagePaintParams, size: { w: number; h: number; dpr: number }): string {
  return `${p.view.x}|${p.view.y}|${p.view.zoom}|${size.w}|${size.h}|${size.dpr}`
}

export function ensureBackground(
  p: StagePaintParams,
  size: { dpr: number; w: number; h: number },
): void {
  const bgKey = `${viewKeyOf(p, size)}|${p.resolvedTheme}|${p.doc.bg ?? ''}`
  if (p.state.bg && p.state.bgKey === bgKey) return
  p.state.bgKey = bgKey
  p.state.bg ??= document.createElement('canvas')
  buildLayer(p.state.bg, size, (g) => {
    g.save()
    g.translate(p.view.x, p.view.y)
    g.scale(p.view.zoom, p.view.zoom)
    if (p.doc.bg) {
      g.fillStyle = p.doc.bg
      g.fillRect(0, 0, p.extent.w, p.extent.h)
    } else {
      const pattern = g.createPattern(checkerTileFor(p.resolvedTheme, p.stage), 'repeat')
      if (pattern) {
        g.imageSmoothingEnabled = false
        g.fillStyle = pattern
        g.fillRect(0, 0, p.extent.w, p.extent.h)
        g.imageSmoothingEnabled = true
      }
    }
    g.restore()
  })
}

export function ensureGrid(p: StagePaintParams, size: { dpr: number; w: number; h: number }): void {
  const { gridOn, diffusionOn } = gridVisibility(p)
  const gridKey = `${viewKeyOf(p, size)}|${p.resolvedTheme}|${gridOn ? 1 : 0}${diffusionOn ? 1 : 0}|${pathId(p.gridLinePaths)}|${pathId(p.gridOverlayPath)}|${pathId(p.contourPath)}`
  if (p.state.gridKey === gridKey) return
  p.state.gridKey = gridKey
  if (!gridOn && !diffusionOn) {
    // nothing to overlay — drop the layer so the per-frame blit skips entirely
    p.state.grid = null
    return
  }
  p.state.grid ??= document.createElement('canvas')
  buildLayer(p.state.grid, size, (g) => {
    g.save()
    g.translate(p.view.x, p.view.y)
    g.scale(p.view.zoom, p.view.zoom)
    strokeGridPaths(p, g, gridOn)
    if (diffusionOn && p.contourPath) {
      strokeDiffusionContour(g, p.contourPath, p.view.zoom, p.stage)
    }
    g.restore()
  })
}

function strokeGridPaths(p: StagePaintParams, g: CanvasRenderingContext2D, gridOn: boolean): void {
  if (!gridOn) return
  if (p.gridLinePaths) {
    const lp = p.gridLinePaths
    g.strokeStyle = p.stage.gridLine
    g.lineWidth = 1 / p.view.zoom
    g.stroke(lp.cell)
    if (lp.pixel) {
      g.strokeStyle = p.stage.pixelLine
      g.stroke(lp.pixel)
    }
    if (lp.major) {
      g.strokeStyle = p.stage.gridMajor
      g.lineWidth = 1.6 / p.view.zoom
      g.stroke(lp.major)
    }
    if (lp.half) {
      g.strokeStyle = p.stage.pixelLine
      g.lineWidth = 1 / p.view.zoom
      g.stroke(lp.half)
    }
  } else if (p.gridOverlayPath) {
    g.strokeStyle = p.stage.gridLine
    g.lineWidth = 1 / p.view.zoom
    g.stroke(p.gridOverlayPath)
  }
}
