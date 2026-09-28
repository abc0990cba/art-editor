import { useEffect, useRef } from 'react'

import { brushOffsets } from '../../engine/brush.ts'
import { STAGE_THEMES } from '../../engine/doc.ts'
import { applyFillStyle } from '../../engine/fillpatterns.ts'
import { regionCells } from '../../engine/shapefill.ts'
import {
  ellipsePoints,
  isShapeTool,
  linePoints,
  rectPoints,
  shapePathPoints,
} from '../../engine/shapes.ts'
import { useStore, type Tool } from '../../state/editor.store.ts'

/** Per-cell style fields consumed by cellPath (mirrors doc.style). */
type CellStyle = Parameters<typeof cellPath>[4]

/**
 * The tip tools collect stamp cells with no outline to align — paint them directly: pencil fills
 * with the working color, eraser draws a hollow cell (a transparency hint).
 */
function paintTip(
  ctx: CanvasRenderingContext2D,
  cells: Set<number>,
  tool: 'pencil' | 'eraser',
  cell: number,
  look: { cols: number; color: string; line: string; style: CellStyle },
): void {
  for (const i of cells) {
    const gx = i % look.cols
    const gy = Math.floor(i / look.cols)
    if (tool === 'pencil') {
      ctx.fillStyle = look.color
      cellPath(ctx, gx, gy, cell, look.style)
    } else {
      ctx.strokeStyle = look.line
      ctx.lineWidth = 1
      ctx.strokeRect(gx * cell + 0.5, gy * cell + 0.5, cell - 1, cell - 1)
    }
  }
}

/** Connector preview: a round-capped segment between two cell centers with end cells. */
function paintConnector(
  ctx: CanvasRenderingContext2D,
  o: { cy: number; cols: number; cell: number; color: string; width: number; style: CellStyle },
): void {
  const ax = 5
  const bx = o.cols - 6
  ctx.strokeStyle = o.color
  ctx.lineWidth = Math.max(1, o.width * o.cell)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ax * o.cell + o.cell / 2, o.cy * o.cell + o.cell / 2)
  ctx.lineTo(bx * o.cell + o.cell / 2, o.cy * o.cell + o.cell / 2)
  ctx.stroke()
  ctx.fillStyle = o.color
  cellPath(ctx, ax, o.cy, o.cell, o.style)
  cellPath(ctx, bx, o.cy, o.cell, o.style)
}

/**
 * Live sample of what the tool paints with the current settings: brush tip for the pencil family,
 * the shape's fill + aligned outline rasterized through the tip for the shape tools, a connector
 * segment with its width. Mirrors the stamping math of CanvasStage. The grid dims are props so the
 * same component powers the compact in-popover sample and the large expandable copy — which gets
 * more cells (i.e. more shape detail, like every ring of a concentric tool), not just a zoom of the
 * same grid.
 */
export function ToolPreview({
  tool,
  cols = 37,
  rows = 24,
  cell = 8,
}: {
  tool: Tool
  /** Sample grid size in cells; shapes rasterize into a (cols-3)×(rows-3) box */
  cols?: number
  rows?: number
  /** Cell size in CSS px; the backing store is scaled by devicePixelRatio */
  cell?: number
}) {
  const color = useStore((s) => s.color)
  const brush = useStore((s) => s.brush)
  const opts = useStore((s) => s.toolOpts)
  const concentricRadii = useStore((s) => s.concentricRadii)
  const style = useStore((s) => s.doc.style)
  const connectorWidth = useStore((s) => s.doc.connectorWidth)
  const shapePaint = useStore((s) => s.shapePaint)
  const fillStyle = useStore((s) => s.fillStyle)
  const resolvedTheme = useStore((s) => s.resolvedTheme)
  const stage = STAGE_THEMES[resolvedTheme]
  const ref = useRef<HTMLCanvasElement>(null)
  const w = cols * cell
  const h = rows * cell

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // stage-like checkerboard backdrop
    ctx.fillStyle = stage.checkerA
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = stage.checkerB
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if ((gx + gy) % 2 === 0) ctx.fillRect(gx * cell, gy * cell, cell, cell)
      }
    }

    // rasterize the tool's footprint into the sample grid (tip stamps, like the real draw)
    const cells = new Set<number>()
    const tip = brushOffsets(brush)
    const stamp = (px: number, py: number) => {
      for (const [dx, dy] of tip) {
        const x = px + dx
        const y = py + dy
        if (x >= 0 && y >= 0 && x < cols && y < rows) cells.add(y * cols + x)
      }
    }
    const cy = Math.floor(rows / 2)
    const shapeLike = tool === 'rect' || tool === 'ellipse' || isShapeTool(tool)
    let outlinePts: [number, number][] = []
    if (tool === 'pencil' || tool === 'eraser') {
      // anchor the tip box on the grid center (offsets run 0..size-1 from the stamp point), so a
      // big pixel size stays centered instead of walking out of the preview; oversized tips clip
      // symmetrically
      stamp(Math.floor((cols - brush.size) / 2), Math.floor((rows - brush.size) / 2))
    } else if (tool === 'line') {
      outlinePts = linePoints(2, rows - 3, cols - 3, 2)
    } else if (tool === 'rect') {
      outlinePts = rectPoints(2, 2, cols - 3, rows - 3, opts)
    } else if (tool === 'ellipse') {
      outlinePts = ellipsePoints(2, 2, cols - 3, rows - 3, opts)
    } else if (isShapeTool(tool)) {
      outlinePts = shapePathPoints(tool, 2, 2, cols - 3, rows - 3, {
        ...opts,
        circles: concentricRadii,
      })
    }
    if (shapeLike || tool === 'line') {
      // fill + aligned stroke, mirroring stampShape: the boundary belongs to the fill,
      // the tip blob is filtered by the alignment against the shape's own regions
      const outlineSet = new Set(outlinePts.map(([x, y]) => y * cols + x))
      const region =
        shapeLike && (shapePaint.fill !== 'none' || shapePaint.align !== 'center')
          ? regionCells(outlineSet, cols, rows)
          : null
      if (shapeLike && shapePaint.fill !== 'none') {
        const coordOf = (i: number) => ({ x: i % cols, y: Math.floor(i / cols) })
        const seed = outlineSet.values().next().value ?? 0
        if (shapePaint.fill === 'pattern') {
          const picks = applyFillStyle(fillStyle, [...outlineSet, ...region!.inside], seed, coordOf)
          for (const [i, pick] of picks) {
            const gx = i % cols
            const gy = Math.floor(i / cols)
            ctx.fillStyle = pick === 1 ? fillStyle.color2 : color
            cellPath(ctx, gx, gy, cell, style)
          }
        } else {
          ctx.fillStyle = color
          for (const i of [...region!.inside, ...outlineSet]) {
            cellPath(ctx, i % cols, Math.floor(i / cols), cell, style)
          }
        }
      }
      const ink = shapePaint.stroke ? shapePaint.strokeColor || color : color
      ctx.fillStyle = ink
      for (const [px, py] of outlinePts) {
        for (const [dx, dy] of tip) {
          const x = px + dx
          const y = py + dy
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          const i = y * cols + x
          const keep =
            !shapeLike || shapePaint.align === 'center'
              ? true
              : shapePaint.align === 'inner'
                ? !region!.outside.has(i)
                : !region!.inside.has(i)
          if (keep && !cells.has(i)) {
            cells.add(i)
            cellPath(ctx, x, y, cell, style)
          }
        }
      }
    }

    // the tip tools have no outline to align: paint the collected stamps directly
    if (tool === 'pencil' || tool === 'eraser') {
      paintTip(ctx, cells, tool, cell, { cols, color, line: stage.pixelLine, style })
    }

    if (tool === 'connector') {
      paintConnector(ctx, { cy, cols, cell, color, width: connectorWidth, style })
    }
  }, [
    tool,
    color,
    brush,
    opts,
    concentricRadii,
    style,
    connectorWidth,
    resolvedTheme,
    stage,
    cols,
    rows,
    cell,
    w,
    h,
    shapePaint,
    fillStyle,
  ])

  return (
    <canvas
      ref={ref}
      className="border-line max-w-full self-center rounded-md border"
      style={{ width: w, imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}

/** One styled sample cell (per-corner rounding, chamfer), like shapeGeometry. */
function cellPath(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  cell: number,
  style: {
    sizeX: number
    sizeY: number
    radius: number
    corners: { tl: number | null; tr: number | null; br: number | null; bl: number | null }
    cornerStyle: string
  },
) {
  const cw = style.sizeX * cell
  const ch = style.sizeY * cell
  const rBase = style.radius * Math.min(cw, ch)
  const corner = (o: number | null) => (o === null ? rBase : o * Math.min(cw, ch))
  const radii = [
    corner(style.corners.tl),
    corner(style.corners.tr),
    corner(style.corners.br),
    corner(style.corners.bl),
  ]
  const x = gx * cell + (cell - cw) / 2
  const y = gy * cell + (cell - ch) / 2
  ctx.beginPath()
  if (style.cornerStyle === 'chamfer') {
    const [tl, tr, br, bl] = radii
    ctx.moveTo(x + tl, y)
    ctx.lineTo(x + cw - tr, y)
    ctx.lineTo(x + cw, y + tr)
    ctx.lineTo(x + cw, y + ch - br)
    ctx.lineTo(x + cw - br, y + ch)
    ctx.lineTo(x + bl, y + ch)
    ctx.lineTo(x, y + ch - bl)
    ctx.lineTo(x, y + tl)
    ctx.closePath()
  } else {
    ctx.roundRect(x, y, cw, ch, radii)
  }
  ctx.fill()
}
