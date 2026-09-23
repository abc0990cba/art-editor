import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import {
  STAGE_THEMES,
  defaultDoc,
  type Connectivity,
  type Doc,
  type MetaballSettings,
  type PixelStyle,
  type RenderMode,
} from '../engine/doc'
import { buildGeometry } from '../engine/geometry'
import { drawGeometry } from '../engine/png'
import { useI18n } from '../i18n'
import { ExpandablePreview } from './PreviewExpander'
import { regionTextureFragments, type TextureCell } from '../engine/texture'

interface Grid {
  cols: number
  rows: number
  cell: number
  w: number
  h: number
}

/** Few large cells: the texture specks render big enough to judge clearly. */
const TEXTURE_GRID: Grid = { cols: 4, rows: 3, cell: 49, w: 196, h: 147 }

function drawChecker(ctx: CanvasRenderingContext2D, a: string, b: string, grid: Grid) {
  const { cols, rows, cell, w, h } = grid
  ctx.fillStyle = a
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = b
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if ((gx + gy) % 2 === 0) ctx.fillRect(gx * cell, gy * cell, cell, cell)
    }
  }
}

/** Corner radii (per-corner overrides applied) and the shrunk cell box, in cell units. */
function cellGeometry(style: PixelStyle) {
  const cw = style.sizeX
  const ch = style.sizeY
  const rBase = style.radius * Math.min(cw, ch)
  const corner = (o: number | null) => (o === null ? rBase : o * Math.min(cw, ch))
  return {
    cw,
    ch,
    radii: [
      corner(style.corners.tl),
      corner(style.corners.tr),
      corner(style.corners.br),
      corner(style.corners.bl),
    ],
  }
}

function cellSubpath(
  p: Path2D,
  x: number,
  y: number,
  cw: number,
  ch: number,
  radii: number[],
  chamfer: boolean,
) {
  const [tl, tr, br, bl] = radii
  if (chamfer) {
    p.moveTo(x + tl, y)
    p.lineTo(x + cw - tr, y)
    p.lineTo(x + cw, y + tr)
    p.lineTo(x + cw, y + ch - br)
    p.lineTo(x + cw - br, y + ch)
    p.lineTo(x + bl, y + ch)
    p.lineTo(x, y + ch - bl)
    p.lineTo(x, y + tl)
    p.closePath()
  } else {
    p.roundRect(x, y, cw, ch, radii)
  }
}

function PreviewFrame({
  canvasRef,
  grid,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  grid: Grid
}) {
  return (
    <div className="sticky top-0 z-10 -mx-3 bg-panel px-3 pb-2">
      <canvas
        ref={canvasRef}
        width={grid.w}
        height={grid.h}
        className="w-full self-center rounded-md border border-line"
        style={{ imageRendering: 'pixelated' }}
        aria-hidden
      />
    </div>
  )
}

/** What the style controls currently target: the doc-level style or the selected element's. */
export interface StyleView {
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
}

// Sparse sample layout: a diagonal chain of three shows how diagonal neighbors join
// (pinch, corner bridge or metaball merge — exactly as on the canvas), the edge-adjacent
// pair shows side gaps when sizeX/sizeY < 1, and the chain head touching the top border
// keeps squareEdges visible. Rendered through buildGeometry, so every render mode and
// connectivity matches the stage instead of a pixels-only approximation.
const STYLE_CELLS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 1],
  [3, 2],
  [6, 1],
  [7, 1],
]
const STYLE_COLS = 9
const STYLE_ROWS = 5

function styleSampleDoc(view: StyleView, color: string): Doc {
  const cells = new Uint16Array(STYLE_COLS * STYLE_ROWS)
  for (const [x, y] of STYLE_CELLS) cells[y * STYLE_COLS + x] = 1
  return {
    gridType: 'square',
    cols: STYLE_COLS,
    rows: STYLE_ROWS,
    sub: 1,
    radialEven: false,
    cells,
    links: [],
    palette: [color],
    style: view.style,
    renderMode: view.renderMode,
    connectivity: view.connectivity,
    metaball: view.metaball,
    // texture has its own preview next door; keep the style sample untextured
    texture: { ...defaultDoc().texture, effect: 'none' },
    styleScope: 'global',
    elements: [],
    cellObj: null,
    layers: null,
    nextNodeId: 1,
    fuseObjects: true,
    bg: '',
    connectorWidth: 1,
  }
}

function PixelStyleSample({
  view,
  cell,
}: {
  view: StyleView
  /** cell size in CSS px; the backing store is scaled by devicePixelRatio */
  cell: number
}) {
  const color = useStore((s) => s.color)
  const resolvedTheme = useStore((s) => s.resolvedTheme)
  const stage = STAGE_THEMES[resolvedTheme]
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const grid: Grid = {
      cols: STYLE_COLS,
      rows: STYLE_ROWS,
      cell,
      w: STYLE_COLS * cell,
      h: STYLE_ROWS * cell,
    }
    cv.width = Math.round(grid.w * dpr)
    cv.height = Math.round(grid.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawChecker(ctx, stage.checkerA, stage.checkerB, grid)

    const { paths } = buildGeometry(styleSampleDoc(view, color))
    // paths are in doc units (1 unit = 1 cell) — draw through the cell-size transform
    ctx.save()
    ctx.scale(cell, cell)
    drawGeometry(ctx, paths)
    ctx.restore()
  }, [view, color, resolvedTheme, stage, cell])

  return (
    <canvas
      ref={ref}
      className="w-full self-center rounded-md border border-line"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}

/**
 * Sticky live sample of the current pixel style, drawn by the same engine as the canvas:
 * a few pixels placed diagonally and edge-to-edge, so how neighbors connect — gaps,
 * rounding, outline pinches, corner bridges, metaball merges — reads clearly at this
 * size and stays truthful in every render mode.
 */
export function PixelStylePreview(view: StyleView) {
  const { t } = useI18n()
  return (
    <div className="sticky top-0 z-10 -mx-3 bg-panel px-3 pb-2">
      <ExpandablePreview
        title={t('preview.large')}
        panelWidth={STYLE_COLS * 64 + 24}
        large={<PixelStyleSample view={view} cell={64} />}
      >
        <PixelStyleSample view={view} cell={28} />
      </ExpandablePreview>
    </div>
  )
}

/**
 * Sticky live sample of the current texture, baked into a block of cells. The cells are
 * intentionally few and large — the texture scale is relative to the cell, so this acts
 * as a loupe that makes the specks clearly visible while the sliders move.
 */
export function TexturePreview() {
  const color = useStore((s) => s.color)
  const tex = useStore((s) => s.doc.texture)
  const style = useStore((s) => s.doc.style)
  const resolvedTheme = useStore((s) => s.resolvedTheme)
  const stage = STAGE_THEMES[resolvedTheme]
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    drawChecker(ctx, stage.checkerA, stage.checkerB, TEXTURE_GRID)

    const { cw, ch, radii } = cellGeometry(style)
    const chamfer = style.cornerStyle === 'chamfer'
    const { cols, rows } = TEXTURE_GRID
    const cells: TextureCell[] = []
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const same = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < cols && yy < rows
        cells.push({
          x: gx,
          y: gy,
          w: cw,
          h: ch,
          radii,
          chamfer,
          cx0: gx,
          cy0: gy,
          cx1: gx + 1,
          cy1: gy + 1,
          connectedL: same(gx - 1, gy),
          connectedT: same(gx, gy - 1),
          connectedR: same(gx + 1, gy),
          connectedB: same(gx, gy + 1),
        })
      }
    }

    const p = new Path2D()
    for (const c of cells) cellSubpath(p, c.x, c.y, c.w, c.h, radii, chamfer)
    if (tex.effect !== 'none') {
      // texture specks punch out of the fill via even-odd, exactly like shapeGeometry
      const holes = regionTextureFragments(cells, tex, 1)
      if (holes) p.addPath(new Path2D(holes))
    }
    // the path is built in cell units — draw through the cell-size transform
    ctx.save()
    ctx.scale(TEXTURE_GRID.cell, TEXTURE_GRID.cell)
    ctx.fillStyle = color
    ctx.fill(p, 'evenodd')
    ctx.restore()
  }, [color, tex, style, resolvedTheme, stage])

  return <PreviewFrame canvasRef={ref} grid={TEXTURE_GRID} />
}
