import { elementFromDoc } from '../../engine/core/doc-style.ts'
import type { Doc, ElementStyle } from '../../engine/core/doc.ts'
import { cellColor } from '../../engine/core/doc.ts'
import {
  buildGeometry,
  stagedCellPath,
  stagingPreview,
  type Staging,
} from '../../engine/geometry/index.ts'
import { drawGeometry } from '../../engine/output/png.ts'
import { sizeCanvas } from './canvas-stage.util.ts'
import { ensureBackground, ensureGrid } from './stage-paint-layers.util.ts'
import { pixelFrame, pixelPreviewEligible } from './stage-paint-pixel.util.ts'
import { eraseOwnerUsable, splitStagedRects } from './stage-paint-rects.util.ts'
import {
  blit,
  plainSquarePreviewStyle,
  strokePreviewCapable,
  type StagePaintParams,
  type StagePaintState,
} from './stage-paint.util.ts'
import { materializeShapeStaging } from './stage-shape-raster.util.ts'

/**
 * The base-canvas frame: committed artwork blit + in-stroke composite + baked background/grid.
 * Stroke frames cost O(newly staged cells); pan/zoom frames cost one full vector pass; every other
 * frame costs O(blits + one geometry draw). Split across stage-paint*.util to keep every file under
 * its size ratchet: this module owns dispatch + the incremental stroke layer + the legacy fragment
 * path; the pixel-bitmap preview lives in stage-paint-pixel.util.
 */
/**
 * Staged cells of the in-flight drag. Typed shape-drag buffers count as staging: the pixel preview
 * reads them directly, any other path materializes the Maps once here (no worse than the old
 * per-move Map writes).
 */
function stagingCellsOf(p: StagePaintParams): {
  cells: ReadonlyMap<number, number | null> | undefined
  buffered: boolean
} {
  const st = p.staging.current
  const buffered = !!st?.cellsBuf && (!st.cells || st.cells.size === 0)
  if (buffered && st && !pixelPreviewEligible(p)) materializeShapeStaging(st)
  const cells = st?.cells
  return { cells: cells && cells.size > 0 ? cells : undefined, buffered }
}

export function paintStage(p: StagePaintParams): void {
  const state = p.state
  if (!p.canvas || !p.wrap) return
  const size = sizeCanvas(p.canvas, p.wrap)
  if (!size) return
  const ctx = p.canvas.getContext('2d')
  if (!ctx) return
  ensureBackground(p, size)
  ensureGrid(p, size)
  const art = ensureArt(p, size)

  const { cells: stCells, buffered: bufActive } = stagingCellsOf(p)
  const view = p.view
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  if (!stCells && !bufActive) {
    state.session = null
    state.dead = null
    if (state.px) state.px.last.length = 0
    ctx.clearRect(0, 0, size.w, size.h)
    blit(ctx, state.bg, size)
    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)
    drawGeometry(ctx, p.geometry.paths)
    ctx.restore()
    blit(ctx, state.grid, size)
    return
  }
  if (bufActive && p.staging.current) {
    if (pixelPreviewEligible(p) && pixelFrame(p, ctx, size, art)) return
    legacyFrame(p, ctx, size)
    return
  }
  const st = p.staging.current
  if (!st) return
  const viewKey = `${view.x}|${view.y}|${view.zoom}|${size.w}|${size.h}|${size.dpr}`
  const incremental =
    p.isDrawStroke && strokePreviewCapable(p.doc, st) && drawStrokeFrame(p, ctx, size, art, viewKey)
  if (incremental) return
  state.session = null
  if (pixelPreviewEligible(p) && pixelFrame(p, ctx, size, art)) return
  legacyFrame(p, ctx, size)
}

/** Committed-artwork bitmap, rebuilt only when the geometry or the view changes. */
function ensureArt(
  p: StagePaintParams,
  size: { dpr: number; w: number; h: number },
): NonNullable<StagePaintState['art']> {
  const state = p.state
  let art = state.art
  if (!art) {
    art = state.art = {
      canvas: document.createElement('canvas'),
      w: 0,
      h: 0,
      dpr: 1,
      zoom: 1,
      x: 0,
      y: 0,
      geometry: null,
    }
  }
  if (
    art.geometry !== p.geometry ||
    art.zoom !== p.view.zoom ||
    art.x !== p.view.x ||
    art.y !== p.view.y ||
    art.w !== size.w ||
    art.h !== size.h ||
    art.dpr !== size.dpr
  ) {
    art.geometry = p.geometry
    art.zoom = p.view.zoom
    art.x = p.view.x
    art.y = p.view.y
    art.w = size.w
    art.h = size.h
    art.dpr = size.dpr
    art.canvas.width = Math.round(size.w * size.dpr)
    art.canvas.height = Math.round(size.h * size.dpr)
    const actx = art.canvas.getContext('2d')
    if (actx) {
      actx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      actx.clearRect(0, 0, size.w, size.h)
      actx.save()
      actx.translate(p.view.x, p.view.y)
      actx.scale(p.view.zoom, p.view.zoom)
      drawGeometry(actx, p.geometry.paths)
      actx.restore()
    }
  }
  return art
}

/**
 * Incremental pencil/eraser frames: newly staged cells render straight into a persistent stroke
 * layer (ink) or punch a copy of the committed art (eraser), so a frame costs O(new cells) no
 * matter how long the stroke already is. Returns false when the stroke hit content the incremental
 * path cannot composite — the caller falls back to the legacy rebuild.
 */
function drawStrokeFrame(
  p: StagePaintParams,
  ctx: CanvasRenderingContext2D,
  size: { dpr: number; w: number; h: number },
  art: NonNullable<StagePaintState['art']>,
  viewKey: string,
): boolean {
  const state = p.state
  const st = p.staging.current!
  if (state.dead === st) return false
  const fresh = !state.session || state.session.st !== st
  if (fresh && !openStrokeLayer(state, size, art, p.tool === 'eraser' ? 'erase' : 'ink', st)) {
    return false
  }
  const sess = state.session
  const sctx = state.stroke?.getContext('2d')
  if (!sess || !sctx) return false
  if (sess.key !== viewKey) {
    // view/size changed mid-stroke: the layer content is doc-space, replay every applied cell
    replayStrokeLayer(state, sess, art)
    if (!applyStaged(p, sess, sctx, size, sess.applied)) return deadEnd(state, st)
    sess.key = viewKey
  }
  const delta = p.delta.current
  if (delta && delta.length > 0) {
    if (!applyStaged(p, sess, sctx, size, delta)) return deadEnd(state, st)
    for (const idx of delta) sess.applied.push(idx)
    delta.length = 0
  }
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.w, size.h)
  blit(ctx, state.bg, size)
  if (sess.mode === 'ink') blit(ctx, art.canvas, size)
  blit(ctx, state.stroke, size)
  blit(ctx, state.grid, size)
  return true
}

/** Mark a staging object as un-incremental and reset the session (caller falls back). */
function deadEnd(state: StagePaintState, st: Staging): false {
  state.dead = st
  state.session = null
  return false
}

/** Fresh stroke layer for a new session: sized, cleared; eraser sessions copy the committed art. */
function openStrokeLayer(
  state: StagePaintState,
  size: { dpr: number; w: number; h: number },
  art: NonNullable<StagePaintState['art']>,
  mode: 'ink' | 'erase',
  st: Staging,
): boolean {
  state.stroke ??= document.createElement('canvas')
  const c = state.stroke
  const w = Math.round(size.w * size.dpr)
  const h = Math.round(size.h * size.dpr)
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const sctx = c.getContext('2d')
  if (!sctx) return deadEnd(state, st)
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.globalCompositeOperation = 'source-over'
  sctx.clearRect(0, 0, w, h)
  if (mode === 'erase') sctx.drawImage(art.canvas, 0, 0)
  state.session = { st, mode, applied: [], key: '' }
  return true
}

function replayStrokeLayer(
  state: StagePaintState,
  sess: NonNullable<StagePaintState['session']>,
  art: NonNullable<StagePaintState['art']>,
): void {
  const sctx = state.stroke!.getContext('2d')!
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.globalCompositeOperation = 'source-over'
  sctx.clearRect(0, 0, state.stroke!.width, state.stroke!.height)
  if (sess.mode === 'erase') sctx.drawImage(art.canvas, 0, 0)
}

/** Render staged buffer indices onto the stroke layer (ink fragments / erase punches). */
function applyStaged(
  p: StagePaintParams,
  sess: NonNullable<StagePaintState['session']>,
  sctx: CanvasRenderingContext2D,
  size: { dpr: number; w: number; h: number },
  idxs: number[],
): boolean {
  const cells = sess.st.cells
  if (!cells) return true
  const doc = p.doc
  const el = elementFromDoc(doc)
  const colorOf = (v: number) =>
    sess.st.palette
      ? (sess.st.palette[(v - 1) % sess.st.palette.length] ?? '#888')
      : (cellColor(doc, v) ?? '#888')
  sctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  sctx.save()
  sctx.translate(p.view.x, p.view.y)
  sctx.scale(p.view.zoom, p.view.zoom)
  // plain full-cell squares skip the path roundtrip entirely: same-row runs merge into one
  // fillRect (the exact geometry run merging produces at commit), so a fast scribble costs
  // microseconds per frame instead of a Path2D parse per staged cell
  const rects = plainSquarePreviewStyle(el.style)
    ? splitStagedRects({ cells, idxs, sess, doc, bw: p.bw, sub: doc.sub, colorOf })
    : null
  if (rects === null) {
    const drawn = splitStaged({
      cells,
      idxs,
      sess,
      doc,
      el,
      bw: p.bw,
      bh: p.bh,
      sub: doc.sub,
      colorOf,
    })
    if (!drawn) return bail(sctx)
    sctx.globalCompositeOperation = 'source-over'
    for (const [color, fp] of drawn.fills) {
      sctx.fillStyle = color
      sctx.fill(fp)
    }
    if (drawn.punch) {
      sctx.globalCompositeOperation = 'destination-out'
      sctx.fill(drawn.punch)
    }
  } else {
    sctx.globalCompositeOperation = 'source-over'
    sctx.fillStyle = rects.color
    for (const [x, y, w, h] of rects.runs) sctx.fillRect(x, y, w, h)
    if (rects.punch) {
      sctx.globalCompositeOperation = 'destination-out'
      sctx.fillStyle = '#000'
      for (const [x, y, w, h] of rects.punch) sctx.fillRect(x, y, w, h)
    }
  }
  sctx.restore()
  sctx.globalCompositeOperation = 'source-over'
  return true
}

/** Classify staged indices into per-color ink batches and an erase punch path (null = bail). */
function splitStaged(s: StagedCtx): StagedDraw | null {
  const fills = new Map<string, Path2D>()
  let punch: Path2D | null = null
  for (const idx of s.idxs) {
    const v = s.cells.get(idx)
    if (v === null || v === undefined || v === 0) {
      if (s.sess.mode !== 'erase' || !eraseOwnerUsable(s.doc, idx)) return null
      const gx = idx % s.bw
      punch ??= new Path2D()
      punch.rect(gx / s.sub, (idx - gx) / s.bw / s.sub, 1 / s.sub, 1 / s.sub)
      continue
    }
    if (s.sess.mode !== 'ink') return null
    const color = s.colorOf(v)
    const frag = new Path2D(stagedCellPath(s.el, color, idx, s.bw, s.bh, s.sub))
    let fp = fills.get(color)
    if (!fp) fills.set(color, (fp = new Path2D()))
    fp.addPath(frag)
  }
  return { fills, punch }
}

interface StagedCtx {
  cells: ReadonlyMap<number, number | null>
  idxs: number[]
  sess: NonNullable<StagePaintState['session']>
  doc: Doc
  el: ElementStyle
  bw: number
  bh: number
  sub: number
  colorOf: (v: number) => string
}

interface StagedDraw {
  fills: Map<string, Path2D>
  punch: Path2D | null
}

/** Undo the partially applied transform and tell the caller to fall back. */
function bail(sctx: CanvasRenderingContext2D): false {
  sctx.restore()
  sctx.globalCompositeOperation = 'source-over'
  return false
}

/** Legacy frame: full preview fragment strings, or the global fallback rebuild. */
function legacyFrame(
  p: StagePaintParams,
  ctx: CanvasRenderingContext2D,
  size: { dpr: number; w: number; h: number },
): void {
  const state = p.state
  const st = p.staging.current!
  const view = p.view
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.w, size.h)
  const preview = stagingPreview(p.doc, st)
  if (preview) {
    blit(ctx, state.art?.canvas ?? null, size)
    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)
    if (preview.erase.length > 0) fillLegacyPunch(p, ctx, preview.erase)
    ctx.globalCompositeOperation = 'destination-over'
    blit(ctx, state.bg, size)
    ctx.globalCompositeOperation = 'source-over'
    drawGeometry(ctx, preview.paths)
    ctx.restore()
  } else {
    let paths = p.geometry.paths
    if (st.cells && st.cells.size > 0) {
      paths = buildGeometry(st.palette ? { ...p.doc, palette: [...st.palette] } : p.doc, st).paths
    }
    blit(ctx, state.bg, size)
    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)
    drawGeometry(ctx, paths)
    ctx.restore()
  }
  blit(ctx, state.grid, size)
}

function fillLegacyPunch(
  p: StagePaintParams,
  ctx: CanvasRenderingContext2D,
  erase: number[],
): void {
  const bw = p.bw
  const sub = p.doc.sub
  const punch = new Path2D()
  for (const i of erase) {
    const gx = i % bw
    punch.rect(gx / sub, (i - gx) / bw / sub, 1 / sub, 1 / sub)
  }
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill(punch)
}
