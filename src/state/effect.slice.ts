import { bufferWidth, resolveColor, type Doc } from '../engine/core/doc.ts'
import {
  allObjs,
  objLayer,
  pruneEmptyObjs,
  stealCells,
  syncDoc,
  updateNode,
} from '../engine/core/scene.ts'
import {
  DEFAULT_PIXEL_OP_PARAMS,
  pixelOpInk,
  type PixelOp,
  type PixelOpParams,
} from '../engine/effects/morpho.ts'
import { selectionBox, type CellBox, type InkCell } from '../engine/effects/selection-xform.ts'
import {
  DEFAULT_STYLIZE_PARAMS,
  stylizeInk,
  type StylizeOp,
  type StylizeParams,
} from '../engine/effects/stylize.ts'
import {
  DEFAULT_WARP_PARAMS,
  warpInk,
  type WarpKind,
  type WarpParams,
} from '../engine/effects/warp.ts'
import { isPlainSquare } from '../engine/grids/index.ts'
import type { State } from './editor.store.ts'

/**
 * The effect slice: whole-selection artistic post-ops beyond geometry — displacement warps (bulge /
 * twirl / waves / zigzag / polar / roughen) and one-click stylize (outline / shadow / glow). Both
 * bake through the same nearest-neighbor ink remap as the transform slice, so procedural
 * (graph-driven) objects freeze into plain cells; the non-destructive path for them is the
 * `mod.warp` node. All actions are undoable; square grid only.
 */

/** Snapshot of the selection's ink: buffer index → palette value + owner id. */
function selectionInk(doc: Doc, selection: number[]): Map<number, InkCell> | null {
  if (!doc.cellObj) return null
  const sel = new Set(selection)
  const src = new Map<number, InkCell>()
  for (let i = 0; i < doc.cellObj.length; i++) {
    const o = doc.cellObj[i]
    if (o > 0 && sel.has(o) && doc.cells[i] > 0) src.set(i, { v: doc.cells[i], o })
  }
  return src.size === 0 ? null : src
}

/** Flat (legacy, layer-less) write-back: erase selected cells, then lay the mapped ink down. */
function bakeFlat(doc: Doc, selection: number[], mapped: Map<number, InkCell>): Doc {
  const sel = new Set(selection)
  const cells = doc.cells.slice()
  const cellObj = doc.cellObj!.slice()
  for (let i = 0; i < cellObj.length; i++) {
    if (cellObj[i] > 0 && sel.has(cellObj[i])) {
      cells[i] = 0
      cellObj[i] = 0
    }
  }
  for (const [i, cell] of mapped) {
    cells[i] = cell.v
    cellObj[i] = cell.o
  }
  return { ...doc, cells, cellObj }
}

/** Scene write-back: targets steal from the objects beneath (tree order wins), then per-object ink. */
function bakeScene(doc: Doc, selection: number[], mapped: Map<number, InkCell>): Doc {
  const sel = new Set(selection)
  const movers = allObjs(doc.layers!).filter((o) => sel.has(o.id))
  const claims = new Map<number, Set<number>>()
  for (const [i, cell] of mapped) {
    const layer = objLayer(doc.layers!, cell.o)
    if (!layer) continue
    let claim = claims.get(layer.id)
    if (!claim) claims.set(layer.id, (claim = new Set()))
    claim.add(i)
  }
  let layers = doc.layers!
  for (const [layerId, idxs] of claims) layers = stealCells(layers, layerId, idxs)
  for (const mover of movers) {
    const cells = new Map<number, number>()
    for (const [i, cell] of mapped) if (cell.o === mover.id) cells.set(i, cell.v)
    layers =
      updateNode(layers, mover.id, (n) =>
        n.kind === 'obj' ? { ...n, cells, graph: undefined } : n,
      ) ?? layers
  }
  const { layers: pruned } = pruneEmptyObjs(layers, sel)
  return syncDoc({ ...doc, layers: pruned })
}

/** Snapshot → box → remap → bake; null when there is nothing to remap. */
function bakeSelection(
  doc: Doc,
  selection: number[],
  map: (src: Map<number, InkCell>, box: CellBox, bw: number, bh: number) => Map<number, InkCell>,
): Doc | null {
  const bw = bufferWidth(doc)
  const bh = doc.rows * doc.sub
  const src = selectionInk(doc, selection)
  if (!src) return null
  const box = selectionBox(doc.cells, doc.cellObj, selection, bw, bh)
  if (!box) return null
  const mapped = map(src, box, bw, bh)
  if (mapped.size === 0) return null
  return doc.layers ? bakeScene(doc, selection, mapped) : bakeFlat(doc, selection, mapped)
}

/** The effect slice surface, composed into the main store. */
export interface EffectSlice {
  /** Warp the selected objects' ink through a displacement field (undoable; square grid only) */
  warpSelection: (kind: WarpKind, params?: Partial<WarpParams>) => void
  /** Outline / shadow / glow the selection ink in a color (undoable; square grid only) */
  stylizeSelection: (op: StylizeOp, params?: Partial<StylizeParams>, color?: string) => void
  /** Pixel-art morphology op on the selection (undoable; square grid only) */
  pixelOpSelection: (op: PixelOp, params?: Partial<PixelOpParams>) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

export function createEffectSlice({ set, get }: SliceApi): EffectSlice {
  return {
    warpSelection: (kind, params) =>
      set((s) => {
        if (s.selection.length === 0 || !isPlainSquare(s.doc)) return s
        const p = { ...DEFAULT_WARP_PARAMS, ...params }
        const next = bakeSelection(s.doc, s.selection, (src, box, bw, bh) =>
          warpInk(src, kind, p, { box, bw, bh }),
        )
        return next ? { doc: next } : s
      }),

    stylizeSelection: (op, params, color) =>
      set((s) => {
        if (s.selection.length === 0 || !isPlainSquare(s.doc)) return s
        const p = { ...DEFAULT_STYLIZE_PARAMS, ...params }
        const r = resolveColor(s.doc, color ?? s.color)
        const next = bakeSelection(r.doc, s.selection, (src, _box, bw, bh) =>
          stylizeInk(op, src, r.v, p, { bw, bh }),
        )
        if (!next) return s
        get().pushRecent(r.doc.palette[r.v - 1] ?? s.color)
        return { doc: next }
      }),

    pixelOpSelection: (op, params) =>
      set((s) => {
        if (s.selection.length === 0 || !isPlainSquare(s.doc)) return s
        const p = { ...DEFAULT_PIXEL_OP_PARAMS, ...params }
        // recoloring ops take the current color (resolving extends the palette on demand);
        // pure morphology ops leave the palette alone
        const recolors = op === 'silhouette' || op === 'longShadow' || op === 'scanlines'
        const r = recolors ? resolveColor(s.doc, s.color) : { doc: s.doc, v: 0 }
        const next = bakeSelection(r.doc, s.selection, (src, _region, bw, bh) =>
          pixelOpInk(op, src, r.v, p, { bw, bh }),
        )
        if (!next) return s
        if (recolors) get().pushRecent(r.doc.palette[r.v - 1] ?? s.color)
        return { doc: next }
      }),
  }
}
