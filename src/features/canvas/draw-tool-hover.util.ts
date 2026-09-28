/**
 * Hover preview of the paint tools: the brush footprint (snapped tip, lattice blob, single cell or
 * the selection region a fill would re-fill) plus translucent symmetry ghosts. Called inside the
 * overlay's doc-space transform; drawn screen-constant so it reads on any background.
 */

import { brushAnchor } from '../../engine/brush.ts'
import type { StageTheme, SymmetryState } from '../../engine/doc.ts'
import type { Grid } from '../../engine/grids.ts'
import { isShapeTool } from '../../engine/shapes.ts'
import { symmetryPoints } from '../../engine/symmetry.ts'
import type { Tool } from '../../state/editor.store.ts'
import { blobCells, polyPath } from './canvas-stage.util.ts'

export interface ToolHoverDraw {
  ctx: CanvasRenderingContext2D
  zoom: number
  hoverIdx: number
  tool: Tool
  color: string
  brushSize: number
  brushSnap: boolean
  isSquare: boolean
  grid: Grid
  bw: number
  bh: number
  sub: number
  cellObj: Uint32Array | null
  tipOffsets: [number, number][]
  symmetry: SymmetryState
  radialOpts: Parameters<typeof symmetryPoints>[7]
  expand: (idx: number) => number[]
  selection: number[]
  /** Cached outline of the current selection (fill over a selected shape previews it) */
  selOutPath: Path2D | null
  theme: StageTheme
}

/** Footprint of the single-cell tools: fill (or its selection re-fill region) and connector. */
function singleCellFoot(d: ToolHoverDraw, foot: Path2D, ghosts: Path2D): boolean {
  let hasGhosts = false
  const cellRects = (idx: number, into: Path2D) => {
    if (d.isSquare) {
      const gx = idx % d.bw
      const gy = Math.floor(idx / d.bw)
      into.rect(gx / d.sub, gy / d.sub, 1 / d.sub, 1 / d.sub)
    } else {
      polyPath(into, d.grid.polygon(idx))
    }
  }
  // fill over a selected shape re-fills the whole selection: preview that region
  const fillHitObj = d.tool === 'fill' ? (d.cellObj?.[d.hoverIdx] ?? 0) : 0
  const selFoot = fillHitObj > 0 && d.selection.includes(fillHitObj) ? d.selOutPath : null
  if (selFoot) {
    foot.addPath(selFoot)
    return false
  }
  cellRects(d.hoverIdx, foot)
  if (d.tool === 'fill' && d.symmetry.mode !== 'none') {
    for (const si of d.expand(d.hoverIdx)) {
      if (si === d.hoverIdx) continue
      cellRects(si, ghosts)
      hasGhosts = true
    }
  }
  return hasGhosts
}

/** Footprint of the square-grid brush: the snapped tip pattern at every symmetry copy. */
function squareTipFoot(d: ToolHoverDraw, foot: Path2D, ghosts: Path2D): boolean {
  const bx = d.hoverIdx % d.bw
  const by = Math.floor(d.hoverIdx / d.bw)
  const [ax, ay] = brushAnchor(bx, by, d.brushSize, d.brushSnap)
  const orbit =
    d.symmetry.mode === 'none'
      ? [[ax, ay]]
      : symmetryPoints(
          ax,
          ay,
          d.bw,
          d.bh,
          d.symmetry.mode,
          d.symmetry.n,
          d.symmetry.cell,
          d.radialOpts,
        )
  let hasGhosts = false
  // symmetryPoints lists the anchor first; the remaining copies are ghosts
  orbit.forEach(([ox, oy], oi) => {
    for (const [dx, dy] of d.tipOffsets) {
      const x = ox + dx
      const y = oy + dy
      if (x < 0 || y < 0 || x >= d.bw || y >= d.bh) continue
      if (oi === 0) foot.rect(x / d.sub, y / d.sub, 1 / d.sub, 1 / d.sub)
      else {
        ghosts.rect(x / d.sub, y / d.sub, 1 / d.sub, 1 / d.sub)
        hasGhosts = true
      }
    }
  })
  return hasGhosts
}

/** Footprint of the non-square grids: a lattice blob at every symmetry copy. */
function blobFoot(d: ToolHoverDraw, foot: Path2D, ghosts: Path2D): boolean {
  let hasGhosts = false
  const blob = blobCells(d.grid, d.hoverIdx, d.brushSize * d.brushSize)
  for (const bi of blob) {
    polyPath(foot, d.grid.polygon(bi))
    if (d.symmetry.mode !== 'none') {
      for (const si of d.expand(bi)) {
        if (si === bi) continue
        polyPath(ghosts, d.grid.polygon(si))
        hasGhosts = true
      }
    }
  }
  return hasGhosts
}

/** Translucent symmetry ghosts (pencil/eraser/fill only). */
function paintGhosts(d: ToolHoverDraw, ghosts: Path2D, hasGhosts: boolean): void {
  if (!hasGhosts || (d.tool !== 'pencil' && d.tool !== 'eraser' && d.tool !== 'fill')) return
  d.ctx.globalAlpha = d.tool === 'eraser' ? 0.22 : 0.35
  d.ctx.fillStyle = d.tool === 'eraser' ? d.theme.hover : d.color
  d.ctx.fill(ghosts)
  d.ctx.globalAlpha = 1
}

/** Fill + halo + core outline of the footprint, reading on any background. */
function paintFoot(d: ToolHoverDraw, foot: Path2D): void {
  const { ctx, tool, color, theme } = d
  if (
    tool === 'pencil' ||
    tool === 'fill' ||
    tool === 'line' ||
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'connector' ||
    isShapeTool(tool)
  ) {
    ctx.globalAlpha = 0.4
    ctx.fillStyle = color
    ctx.fill(foot)
    ctx.globalAlpha = 1
  } else if (tool === 'eraser') {
    ctx.globalAlpha = 0.3
    ctx.fillStyle = theme.hover
    ctx.fill(foot)
    ctx.globalAlpha = 1
  }
  ctx.lineJoin = 'round'
  ctx.strokeStyle = theme.hoverHalo
  ctx.lineWidth = 4 / d.zoom
  ctx.stroke(foot)
  ctx.strokeStyle = theme.hover
  ctx.lineWidth = 1.75 / d.zoom
  ctx.stroke(foot)
}

export function drawToolHover(d: ToolHoverDraw): void {
  const foot = new Path2D()
  const ghosts = new Path2D()
  const singleCell = d.tool === 'fill' || d.tool === 'connector'
  const hasGhosts = singleCell
    ? singleCellFoot(d, foot, ghosts)
    : d.isSquare
      ? squareTipFoot(d, foot, ghosts)
      : blobFoot(d, foot, ghosts)
  paintGhosts(d, ghosts, hasGhosts)
  paintFoot(d, foot)
}
