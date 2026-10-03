import type { StagePaintParams, StagePaintState } from './stage-paint.util.ts'
import {
  blit,
  colorToU32,
  plainSquarePreviewStyle,
  PX_BUFFER_LIMIT,
  strokePreviewCapable,
} from './stage-paint.util.ts'

/**
 * Full-canvas shape/move/transform previews of plain-square docs: staged cells composite as a
 * 1-px-per-cell bitmap rebuilt per frame (typed-array writes + one scaled blit) instead of per-cell
 * path strings — O(area) with a tiny constant, so dragging a huge filled shape stays interactive on
 * 1000²+ grids. Rendered pixels equal the fragment path: the style gate is the same rule that lets
 * shapeGeometry merge runs into plain rects.
 */

export function pixelPreviewEligible(p: StagePaintParams): boolean {
  const st = p.staging.current!
  if (!strokePreviewCapable(p.doc, st)) return false
  if (p.doc.styleScope !== 'global') return false
  if (p.bw * p.bh > PX_BUFFER_LIMIT) return false
  return plainSquarePreviewStyle(p.doc.style)
}

export function pixelFrame(
  p: StagePaintParams,
  ctx: CanvasRenderingContext2D,
  size: { dpr: number; w: number; h: number },
  art: NonNullable<StagePaintState['art']>,
): boolean {
  const state = p.state
  const cells = p.staging.current!.cells!
  const px = ensurePixelBuffer(state, p.bw, p.bh)
  if (!px) return false
  const len = ensurePixelLut(state, px, p.staging.current!.palette ?? p.doc.palette)
  const bbox = fillPixelBuffer(px, cells, len)
  if (bbox) px.ctx.putImageData(px.img, 0, 0, bbox.minX, bbox.minY, bbox.w, bbox.h)
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.w, size.h)
  blit(ctx, state.bg, size)
  blit(ctx, art.canvas, size)
  punchStagedErases(p, ctx, size, cells)
  ctx.save()
  ctx.translate(p.view.x, p.view.y)
  ctx.scale(p.view.zoom, p.view.zoom)
  // below 1 screen px per cell, nearest sampling would drop cells — smoothing approximates
  // the antialiased look of the vector path; at/above it stays crisp
  ctx.imageSmoothingEnabled = p.view.zoom < p.doc.sub
  ctx.drawImage(px.canvas, 0, 0, p.bw, p.bh, 0, 0, p.extent.w, p.extent.h)
  ctx.imageSmoothingEnabled = true
  ctx.restore()
  blit(ctx, state.grid, size)
  return true
}

function ensurePixelBuffer(state: StagePaintState, bw: number, bh: number): StagePaintState['px'] {
  let px = state.px
  if (px && px.canvas.width === bw && px.canvas.height === bh) return px
  const canvas = document.createElement('canvas')
  canvas.width = bw
  canvas.height = bh
  const pctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!pctx) return null
  const img = pctx.createImageData(bw, bh)
  px = state.px = {
    canvas,
    ctx: pctx,
    img,
    u32: new Uint32Array(img.data.buffer),
    last: [],
    palette: undefined,
    lut: new Uint32Array(0),
  }
  return px
}

function ensurePixelLut(
  state: StagePaintState,
  px: NonNullable<StagePaintState['px']>,
  pal: readonly string[],
): number {
  if (px.palette === pal) return pal.length
  px.palette = pal
  px.lut = new Uint32Array(pal.length + 2)
  for (let k = 1; k <= pal.length; k++) px.lut[k] = colorToU32(state, pal[k - 1])
  return pal.length
}

function fillPixelBuffer(
  px: NonNullable<StagePaintState['px']>,
  cells: ReadonlyMap<number, number | null>,
  len: number,
): { minX: number; minY: number; w: number; h: number } | null {
  const bw = px.canvas.width
  const bh = px.canvas.height
  const u32 = px.u32
  let minX = bw
  let minY = bh
  let maxX = -1
  let maxY = -1
  const mark = (i: number) => {
    const gx = i % bw
    const gy = (i - gx) / bw
    if (gx < minX) minX = gx
    if (gy < minY) minY = gy
    if (gx > maxX) maxX = gx
    if (gy > maxY) maxY = gy
  }
  // zero the previous frame's cells — shape/move ghosts are cleared and rebuilt per event
  for (const i of px.last) {
    if (u32[i] !== 0) {
      u32[i] = 0
      mark(i)
    }
  }
  px.last.length = 0
  for (const [i, v] of cells) {
    px.last.push(i)
    const c = v !== null && v > 0 ? px.lut[v > len ? (((v - 1) % len) | 0) + 1 : v] : 0
    if (u32[i] !== c) {
      u32[i] = c
      mark(i)
    }
  }
  if (maxX < 0) return null
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Staged erase cells punch the committed art; the baked background shows back through. */
function punchStagedErases(
  p: StagePaintParams,
  ctx: CanvasRenderingContext2D,
  size: { dpr: number; w: number; h: number },
  cells: ReadonlyMap<number, number | null>,
): void {
  const bw = p.bw
  const sub = p.doc.sub
  let punch: Path2D | null = null
  for (const [i, v] of cells) {
    if (v !== null && v !== 0) continue
    const gx = i % bw
    punch ??= new Path2D()
    punch.rect(gx / sub, (i - gx) / bw / sub, 1 / sub, 1 / sub)
  }
  if (!punch) return
  ctx.save()
  ctx.translate(p.view.x, p.view.y)
  ctx.scale(p.view.zoom, p.view.zoom)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill(punch)
  ctx.globalCompositeOperation = 'destination-over'
  blit(ctx, p.state.bg, size)
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
}
