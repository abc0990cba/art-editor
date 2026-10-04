import type { StageTheme, SymmetryState, Doc } from '../../engine/core/doc.ts'
import { isRepeat, repeatDef, type RepeatDef } from '../../engine/effects/symmetry.ts'
import type { Pt } from '../../engine/geometry/marching-squares.ts'
import type { Grid } from '../../engine/grids/index.ts'
import type { ResolvedTheme } from '../../state/editor.store.ts'

/** Safety cap: one stamp event writes at most this many buffer cells */
export const MAX_STAMPS = 20_000

/** Overlay scrollbar thickness in px. */
export const SCROLLBAR = 10

/** Marching-ants dash travel speed, in screen px per second. */
export const ANTS_SPEED = 30

/**
 * In-stroke drag variants: pan, freehand paint, shape drag, selection move, marquee, transform,
 * pen.
 */
export interface DragState {
  kind: 'pan' | 'draw' | 'shape' | 'move' | 'marquee' | 'xform' | 'pen'
  sx?: number
  sy?: number
  panX?: number
  panY?: number
  start?: [number, number]
  /** Marquee: live opposite corner in doc space while the rubber band stretches */
  end?: { x: number; y: number }
  last?: number
  removedLinks?: Set<number>
  /** Move drag: snapshot of the selected cells [index, value, element id] plus last offset */
  moved?: [number, number, number][]
  dx?: number
  dy?: number
  /** Marquee modifiers captured at pointerdown (the finishing pointerup may miss them) */
  additive?: boolean
  subtractive?: boolean
}

export interface Hover {
  idx: number
}

export interface DocPoint {
  x: number
  y: number
}

/** Axis-aligned rect in doc units (marquee rubber band, normalized corners). */
export interface MarqueeRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Normalize the two marquee corners into a proper rect. */
export function marqueeRect(a: DocPoint, b: DocPoint): MarqueeRect {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  }
}

/**
 * Live marquee rubber band on the overlay: translucent fill + hairline border, the stroke kept
 * screen-constant. Drawn inside the overlay's doc-space transform.
 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  band: { start?: [number, number]; end?: DocPoint } | null,
  theme: StageTheme,
  zoom: number,
): void {
  if (!band?.start || !band.end) return
  const r = marqueeRect({ x: band.start[0], y: band.start[1] }, band.end)
  ctx.fillStyle = theme.guide
  ctx.globalAlpha = 0.15
  ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  ctx.globalAlpha = 1
  ctx.lineWidth = 1 / zoom
  ctx.strokeStyle = theme.guide
  ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
}

/**
 * Ids of objects whose ink bounding box intersects the marquee rect (doc units) — the Illustrator
 * rubber-band rule. `pickable` filters out locked/hidden ids; connectors count through their
 * endpoints even when they own no cells.
 */
export function objectsInMarquee(
  doc: Doc,
  rect: MarqueeRect,
  pickable: (id: number) => boolean,
): number[] {
  const bw = doc.cols * doc.sub
  const sub = doc.sub
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>()
  const grow = (id: number, x0: number, y0: number, x1: number, y1: number): void => {
    const b = boxes.get(id)
    if (!b) {
      boxes.set(id, { x0, y0, x1, y1 })
      return
    }
    b.x0 = Math.min(b.x0, x0)
    b.y0 = Math.min(b.y0, y0)
    b.x1 = Math.max(b.x1, x1)
    b.y1 = Math.max(b.y1, y1)
  }
  if (doc.cellObj) {
    for (let i = 0; i < doc.cellObj.length; i++) {
      const o = doc.cellObj[i]
      if (o <= 0) continue
      const bx = i % bw
      const by = (i - bx) / bw
      grow(o, bx / sub, by / sub, (bx + 1) / sub, (by + 1) / sub)
    }
  }
  for (const l of doc.links) {
    if (!l.obj) continue
    grow(l.obj, l.ax, l.ay, l.ax + 1, l.ay + 1)
  }
  const hits: number[] = []
  for (const [id, b] of boxes) {
    if (b.x0 < rect.x1 && b.x1 > rect.x0 && b.y0 < rect.y1 && b.y1 > rect.y0 && pickable(id)) {
      hits.push(id)
    }
  }
  return hits.sort((a, b) => a - b)
}

/** Any painted buffer cell inside the rect (strided scan, capped work for huge marquees). */
export function rectHasInk(
  cells: Uint16Array,
  bw: number,
  bh: number,
  sub: number,
  rect: MarqueeRect,
): boolean {
  const bx0 = Math.max(0, Math.floor(rect.x0 * sub))
  const by0 = Math.max(0, Math.floor(rect.y0 * sub))
  const bx1 = Math.min(bw - 1, Math.ceil(rect.x1 * sub) - 1)
  const by1 = Math.min(bh - 1, Math.ceil(rect.y1 * sub) - 1)
  if (bx1 < bx0 || by1 < by0) return false
  const area = (bx1 - bx0 + 1) * (by1 - by0 + 1)
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / 4096)))
  for (let by = by0; by <= by1; by += stride) {
    for (let bx = bx0; bx <= bx1; bx += stride) {
      if (cells[by * bw + bx] > 0) return true
    }
  }
  return false
}

/**
 * Shift-constrained opposite corner of a shape drag: the line snaps to 45° steps, every
 * two-dimensional shape keeps a square 1:1 bounding box (Illustrator/Photoshop practice).
 */
export function constrainShapeEnd(tool: string, start: DocPoint, end: DocPoint): DocPoint {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (tool === 'line') {
    const step = Math.PI / 4
    const a = Math.round(Math.atan2(dy, dx) / step) * step
    const d = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: start.x + Math.cos(a) * d, y: start.y + Math.sin(a) * d }
  }
  const m = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: start.x + Math.sign(dx) * m, y: start.y + Math.sign(dy) * m }
}

/**
 * Memoized blob shapes: the greedy growth is deterministic per (grid, anchor, count), and stamps
 * re-hit the same anchors constantly (hover + every pointermove inside one cell). Keyed per grid
 * geometry, capped to keep memory bounded (each entry holds ≤ size² cell indices).
 */
const blobCache = new Map<string, number[]>()
const BLOB_CACHE_MAX = 1024

/**
 * A compact lattice blob of `count` cells around the anchor: brush tips are square-grid concepts,
 * so on hex/triangle/radial grids a size-N brush paints the N² nearest cells (greedy
 * nearest-frontier growth, deterministic).
 */
export function blobCells(grid: Grid, anchor: number, count: number): number[] {
  const key = `${grid.type}|${grid.cols}|${grid.rows}|${anchor}|${count}`
  const hit = blobCache.get(key)
  if (hit) return hit
  const set = new Set<number>([anchor])
  if (count <= 1 || anchor < 0) return [...set]
  const c0 = grid.center(anchor)
  while (set.size < count) {
    let best = -1
    let bestD = Infinity
    for (const i of set) {
      for (const j of grid.edgeNeighbors(i)) {
        if (set.has(j)) continue
        const c = grid.center(j)
        const d = (c.x - c0.x) * (c.x - c0.x) + (c.y - c0.y) * (c.y - c0.y)
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
    }
    if (best < 0) break
    set.add(best)
  }
  const blob = [...set]
  if (blobCache.size >= BLOB_CACHE_MAX) blobCache.clear()
  blobCache.set(key, blob)
  return blob
}

export function polyPath(p: Path2D, poly: Pt[]): void {
  p.moveTo(poly[0].x, poly[0].y)
  for (let k = 1; k < poly.length; k++) p.lineTo(poly[k].x, poly[k].y)
  p.closePath()
}

/** Drawing surface + view context shared by the guide painters below. */
interface GuideCtx {
  ctx: CanvasRenderingContext2D
  view: { zoom: number; x: number; y: number }
  theme: StageTheme
  /** Doc-space canvas size (cells × sub) */
  W: number
  H: number
  sub: number
}

function lineSeg(g: GuideCtx, x1: number, y1: number, x2: number, y2: number): void {
  g.ctx.moveTo(x1, y1)
  g.ctx.lineTo(x2, y2)
}

/** Center axes of the mirror modes; diag8 adds both diagonals. */
function drawAxisGuides(g: GuideCtx, sym: SymmetryState): void {
  const m = sym.mode
  const { ctx, W, H } = g
  if (m !== 'mirrorX' && m !== 'mirrorY' && m !== 'quad' && m !== 'diag8') return
  ctx.beginPath()
  if (m === 'mirrorX' || m === 'quad') lineSeg(g, W / 2, 0, W / 2, H)
  if (m === 'mirrorY' || m === 'quad') lineSeg(g, 0, H / 2, W, H / 2)
  if (m === 'diag8') {
    // the 8-way orbit mirrors across both center axes and both diagonals
    lineSeg(g, W / 2, 0, W / 2, H)
    lineSeg(g, 0, H / 2, W, H / 2)
    lineSeg(g, 0, 0, W, H)
    lineSeg(g, W, 0, 0, H)
  }
  ctx.stroke()
}

/** Radial/kaleido spokes, the orbit circle and the paintable wedge edges. */
function drawRadialGuides(g: GuideCtx, sym: SymmetryState): void {
  const { ctx, W, H } = g
  const m = sym.mode
  if (m !== 'radial' && m !== 'kaleido') return
  const cx = W / 2
  const cy = H / 2
  const R = (Math.max(W, H) / 2) * 1.2
  ctx.beginPath()
  for (let k = 0; k < sym.n; k++) {
    const a = (k * 2 * Math.PI) / sym.n
    lineSeg(g, cx, cy, cx + R * Math.cos(a), cy + R * Math.sin(a))
  }
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, Math.min(W, H) / 2, 0, 2 * Math.PI)
  ctx.stroke()
  // highlight the paintable part of the base sector when fill/phase reshape it
  const fill = Math.max(0, Math.min(100, sym.fill)) / 100
  if (fill < 1 || sym.phase !== 0) {
    const w = (2 * Math.PI) / Math.max(2, sym.n)
    const ph = (sym.phase * Math.PI) / 180
    ctx.beginPath()
    lineSeg(g, cx, cy, cx + R * Math.cos(ph), cy + R * Math.sin(ph))
    lineSeg(g, cx, cy, cx + R * Math.cos(ph + w * fill), cy + R * Math.sin(ph + w * fill))
    ctx.stroke()
  }
}

/** One infinite line of the repeat lattice, clipped by overdraw length. */
function repeatLine(g: GuideCtx, k: number, offset: [number, number], dir: [number, number]): void {
  const px = k * offset[0]
  const py = k * offset[1]
  const len = Math.hypot(dir[0], dir[1])
  const ux = dir[0] / len
  const uy = dir[1] / len
  const L = g.W + g.H
  lineSeg(g, px - L * ux, py - L * uy, px + L * ux, py + L * uy)
}

/** Basis-vector line families of a repeat/wallpaper lattice. */
function drawRepeatFamilies(g: GuideCtx, sym: SymmetryState, def: RepeatDef): void {
  const { ctx, W, H, sub } = g
  const bw = W * sub
  const bh = H * sub
  const c = Math.max(2, Math.min(sym.cell, bw, bh))
  const s = c / sub
  const A: [number, number] = [def.A[0] * s, def.A[1] * s]
  const B: [number, number] = [def.B[0] * s, def.B[1] * s]
  /** Lines parallel to `dir` through points k·offset, covering the canvas */
  const family = (dir: [number, number], offset: [number, number]) => {
    const n: [number, number] = [-dir[1], dir[0]]
    const step = offset[0] * n[0] + offset[1] * n[1]
    if (Math.abs(step) < 1e-9) return
    const corners = [0, W * n[0], H * n[1], W * n[0] + H * n[1]]
    // the step along n can be negative (e.g. brick/halfdrop) — flip the range, or the
    // family silently draws no lines at all
    const cMin = Math.min(...corners)
    const cMax = Math.max(...corners)
    const kMin = Math.floor((step > 0 ? cMin : cMax) / step) - 1
    const kMax = Math.ceil((step > 0 ? cMax : cMin) / step) + 1
    ctx.beginPath()
    for (let k = kMin; k <= kMax; k++) repeatLine(g, k, offset, dir)
    ctx.stroke()
  }
  family(B, A)
  family(A, B)
}

/** Extra mirror-axis families (directions not parallel to a basis vector). */
function drawRepeatMirrors(g: GuideCtx, sym: SymmetryState, def: RepeatDef): void {
  if (!def.mirrors) return
  const { ctx, W, H, sub } = g
  const bw = W * sub
  const bh = H * sub
  const c = Math.max(2, Math.min(sym.cell, bw, bh))
  const s = c / sub
  const A: [number, number] = [def.A[0] * s, def.A[1] * s]
  const B: [number, number] = [def.B[0] * s, def.B[1] * s]
  const par = (d: [number, number], v: [number, number]) =>
    Math.abs(d[0] * v[1] - d[1] * v[0]) < 1e-9
  const pad = Math.abs(A[0]) + Math.abs(A[1]) + Math.abs(B[0]) + Math.abs(B[1])
  const x0 = -pad
  const y0 = -pad
  const x1 = W + pad
  const y1 = H + pad
  const det = A[0] * B[1] - A[1] * B[0]
  const iMin =
    Math.floor(Math.min((B[1] * x0 - B[0] * y0) / det, (B[1] * x1 - B[0] * y1) / det)) - 1
  const iMax = Math.ceil(Math.max((B[1] * x0 - B[0] * y0) / det, (B[1] * x1 - B[0] * y1) / det)) + 1
  const jMin =
    Math.floor(Math.min((A[0] * y0 - A[1] * x0) / det, (A[0] * y1 - A[1] * x1) / det)) - 1
  const jMax = Math.ceil(Math.max((A[0] * y0 - A[1] * x0) / det, (A[0] * y1 - A[1] * x1) / det)) + 1
  for (const d0 of def.mirrors) {
    if (par(d0, A) || par(d0, B)) continue
    if ((iMax - iMin) * (jMax - jMin) > 1600) continue
    ctx.beginPath()
    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        const px = i * A[0] + j * B[0]
        const py = i * A[1] + j * B[1]
        repeatLine(g, 0, [px, py], d0)
      }
    }
    ctx.stroke()
  }
}

function drawRepeatGuides(g: GuideCtx, sym: SymmetryState): void {
  const m = sym.mode
  if (!isRepeat(m)) return
  const def = repeatDef(m)
  if (!def) return
  drawRepeatFamilies(g, sym, def)
  drawRepeatMirrors(g, sym, def)
}

/** Symmetry guide overlay: axes, spokes, repeat lattices — dashed, in doc space. */
export function drawGuides(g: GuideCtx, sym: SymmetryState): void {
  const { ctx, view, theme } = g
  // called inside the overlay effect's doc-space transform (translate+scale already applied) —
  // only isolate drawing state here, or the doubled transform would push guides off-canvas
  ctx.save()
  ctx.strokeStyle = theme.guide
  ctx.lineWidth = 1 / view.zoom
  ctx.setLineDash([5 / view.zoom, 5 / view.zoom])
  drawAxisGuides(g, sym)
  drawRadialGuides(g, sym)
  drawRepeatGuides(g, sym)
  ctx.restore()
}

/** 1×1 doc-unit tile with four 0.5-unit checker halves, per theme. */
const checkerTiles: Partial<Record<ResolvedTheme, HTMLCanvasElement>> = {}

export function checkerTileFor(theme: ResolvedTheme, stage: StageTheme): HTMLCanvasElement {
  let tile = checkerTiles[theme]
  if (!tile) {
    tile = document.createElement('canvas')
    tile.width = 4
    tile.height = 4
    const g = tile.getContext('2d')
    if (g) {
      g.fillStyle = stage.checkerA
      g.fillRect(0, 0, 4, 4)
      g.fillStyle = stage.checkerB
      g.fillRect(2, 0, 2, 2)
      g.fillRect(0, 2, 2, 2)
    }
    checkerTiles[theme] = tile
  }
  return tile
}

/** Match a canvas backing store to the wrapper size (DPR-aware); returns null when hidden. */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement,
): { dpr: number; w: number; h: number } | null {
  const dpr = window.devicePixelRatio || 1
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (w === 0 || h === 0) return null
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }
  return { dpr, w, h }
}
