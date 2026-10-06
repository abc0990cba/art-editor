import { cellShapeFragment } from '../cell-shapes/index.ts'
import { paletteLuma, toneScale } from '../color/color.ts'
import type { Doc, ElementStyle, Link } from '../core/doc'
import { bufferHeight, bufferWidth, cellColor, elementFromDoc } from '../core/doc'
import { visibleObjs } from '../core/scene'
import { isStrokeOn, strokeColorOf } from '../core/stroke.ts'
import { gridBuildGeometry, gridMetaballField } from '../grids/geometry.ts'
import { docGrid, isPlainSquare, makeGrid } from '../grids/index.ts'
import { evalGraphMemo } from '../nodes/eval-memo.ts'
import { elementStyleKey, elementGeometry } from './elements.ts'
import { createInlayColorOf, inlayFragment, isInlayOn } from './inlay.ts'
import { loopsToSmoothPath, metaballIso, traceMetaballLoops } from './metaball-field.ts'
import { metaballGeometry, metaballPreviewField } from './metaball.ts'
import { squareModeGeometry } from './mode.ts'
import { borderRadii, mergedCells, roundedRectPath } from './shape.ts'

export type { Geometry, Staging, StyledPath } from './types.ts'
import type { Geometry, Staging, StyledPath } from './types.ts'

/* ---------------------------------- entry ---------------------------------- */

// Per-layer scratch buffers: each layer's geometry is fully consumed (paths built)
// before the next layer starts, so one pair suffices no matter how many layers exist.
let sceneScratchCells: Uint16Array | null = null
let sceneScratchObjs: Uint32Array | null = null

/**
 * FuseAll renders the whole document as ONE metaball field set: per-layer isolation and frozen
 * element styles are bypassed, the doc-level metaball settings shape everything (perColor still
 * splits by color). Returns null when not fusing. Square grids only — the field pipeline is
 * square-buffer based.
 */
function fusesAll(doc: Doc): boolean {
  return doc.renderMode === 'metaball' && doc.metaball.fuseAll && isPlainSquare(doc)
}

/** The fuseAll fast path: one merged field over the synced composite (plus staged delta). */
function fusedSceneGeometry(
  doc: Doc,
  staging: Staging | undefined,
  preview: boolean,
): Geometry | null {
  if (!fusesAll(doc)) return null
  return metaballGeometry(doc, mergedCells(doc, staging), staging?.links ?? doc.links, preview)
}

/**
 * Scene rendering: one scoped buffer per visible layer, bottom → top. Each layer runs through the
 * regular builders in isolation, which is what makes layers independent compositing spaces —
 * metaball fields and outlines never fuse across layers. Exception: `metaball.fuseAll` skips the
 * isolation on purpose and feeds the synced composite through one merged field.
 */
function sceneGeometry(doc: Doc, staging?: Staging): Geometry {
  const layers = doc.layers!
  const length = doc.cells.length
  const preview = Boolean(staging && staging.cells && staging.cells.size > 0)
  const fused = fusedSceneGeometry(doc, staging, preview)
  if (fused) return fused
  const objLayerOf = new Map<number, number>()
  for (const layer of layers) {
    for (const o of visibleObjs(layer)) objLayerOf.set(o.id, layer.id)
  }
  const paths: StyledPath[] = []
  // staged ink without an explicit layer tag defaults to the topmost layer
  const inkLayerId = staging?.layerId ?? layers.at(-1)?.id
  // graph objects evaluate their node graph; hex colors resolve against the derived palette
  const hexValue = (hex: string) => {
    const i = doc.palette.findIndex((c) => c.toLowerCase() === hex.toLowerCase())
    return (i === -1 ? 0 : i) + 1
  }
  const luma = (value: number) => paletteLuma(doc.palette, value)
  for (const layer of layers) {
    if (!layer.visible) continue
    const objs = visibleObjs(layer)
    const stagedInk = inkLayerId === layer.id
    if (!sceneScratchCells || sceneScratchCells.length !== length) {
      sceneScratchCells = new Uint16Array(length)
    }
    if (!sceneScratchObjs || sceneScratchObjs.length !== length) {
      sceneScratchObjs = new Uint32Array(length)
    }
    const cells = sceneScratchCells
    const cellObjs = sceneScratchObjs
    cells.fill(0)
    cellObjs.fill(0)
    const links: Link[] = []
    for (const o of objs) {
      const { cells: ink } = o.graph
        ? evalGraphMemo(
            o.graph,
            {
              bw: doc.cols * doc.sub,
              bh: doc.rows * doc.sub,
              grid: docGrid(doc),
              paletteLen: length,
              hexValue,
              luma,
              baseStyle: o.style,
            },
            o.cells,
            doc.palette,
          )
        : { cells: o.cells }
      for (const [i, v] of ink) cells[i] = v
      for (const [i] of ink) cellObjs[i] = o.id
      for (const l of o.links) if (l.v > 0) links.push(l)
    }
    // merge the staged delta into the layer it belongs to: ink goes to the active
    // layer, erases follow each cell's composite owner (multi-layer move previews)
    if (staging?.cells && (stagedInk || preview)) {
      for (const [i, v] of staging.cells) {
        if (v === null || v === 0) {
          const owner = doc.cellObj?.[i] ?? 0
          const home = owner > 0 ? (objLayerOf.get(owner) ?? -1) : stagedInk ? layer.id : -1
          if (home === layer.id) {
            cells[i] = 0
            cellObjs[i] = 0
          }
        } else if (stagedInk) {
          cells[i] = v
          cellObjs[i] = staging.objs?.get(i) ?? PENDING_OBJ
        }
      }
    }
    if (staging?.links) {
      for (const l of staging.links) {
        if (l.v === 0) continue
        const home = (l.obj != null && objLayerOf.get(l.obj)) ?? staging.layerId
        if (home === layer.id) links.push(l)
      }
    }
    if (cells.every((v) => v === 0) && links.length === 0) continue
    const scoped: Doc = { ...doc, cells, cellObj: cellObjs, links }
    if (doc.styleScope === 'element') {
      paths.push(...elementGeometry(scoped, cells, links, undefined, preview).paths)
    } else if (isPlainSquare(scoped)) {
      paths.push(...squareModeGeometry(scoped, cells, links, preview))
    } else {
      paths.push(...gridBuildGeometry(scoped, cells, links))
    }
  }
  return { paths }
}

export function buildGeometry(doc: Doc, staging?: Staging): Geometry {
  if (doc.layers) return sceneGeometry(doc, staging)
  const cells = mergedCells(doc, staging)
  const links = staging?.links ?? doc.links
  const preview = Boolean(staging && staging.cells && staging.cells.size > 0)
  const fused = fusedSceneGeometry(doc, staging, preview)
  if (fused) return fused
  if (doc.styleScope === 'element' && (doc.cellObj || staging?.objs)) {
    return elementGeometry(doc, cells, links, staging?.objs, preview)
  }
  if (!isPlainSquare(doc)) return { paths: gridBuildGeometry(doc, cells, links) }
  return { paths: squareModeGeometry(doc, cells, links, preview) }
}

/* --------------------------- diffusion-guides overlay --------------------------- */

/**
 * Threshold contour of the metaball field for the diffusion-guides canvas overlay: the merged
 * iso-line of every visible layer, as smooth SVG path strings in doc coordinates. Overlay-only —
 * never used for artwork or export. Global style scope only (element-scoped ink freezes its own
 * render mode, so a merged doc-level contour would be meaningless there); committed content only.
 */
export function metaballOverlayContours(doc: Doc): string[] {
  if (doc.styleScope !== 'global' || doc.renderMode !== 'metaball') return []
  const trace = (scoped: Doc, cells: Uint16Array, links: readonly Link[]): string => {
    const square = isPlainSquare(scoped)
    const field = square
      ? metaballPreviewField(scoped, cells, links).field
      : gridMetaballField(
          scoped,
          makeGrid(
            scoped.gridType,
            scoped.cols,
            scoped.rows,
            scoped.radialEven,
            scoped.gridRotation ?? 0,
          ),
          cells,
          () => true,
        )
    return loopsToSmoothPath(
      traceMetaballLoops(field, metaballIso(scoped), scoped.metaball.squareEdges && square),
      field.scale,
    )
  }
  if (!doc.layers) {
    return doc.cells.some((v) => v !== 0) || doc.links.length > 0
      ? [trace(doc, doc.cells, doc.links)]
      : []
  }
  const out: string[] = []
  const length = doc.cells.length
  // mirrors sceneGeometry's per-layer merge (no staging: the overlay shows committed ink)
  let scratch: Uint16Array | null = null
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    if (!scratch || scratch.length !== length) scratch = new Uint16Array(length)
    const cells = scratch
    cells.fill(0)
    const links: Link[] = []
    const hexValue = (hex: string) => {
      const i = doc.palette.findIndex((c) => c.toLowerCase() === hex.toLowerCase())
      return (i === -1 ? 0 : i) + 1
    }
    const luma = (value: number) => paletteLuma(doc.palette, value)
    for (const o of visibleObjs(layer)) {
      const { cells: ink } = o.graph
        ? evalGraphMemo(
            o.graph,
            {
              bw: doc.cols * doc.sub,
              bh: doc.rows * doc.sub,
              grid: docGrid(doc),
              paletteLen: length,
              hexValue,
              luma,
              baseStyle: o.style,
            },
            o.cells,
            doc.palette,
          )
        : { cells: o.cells }
      for (const [i, v] of ink) cells[i] = v
      for (const l of o.links) if (l.v > 0) links.push(l)
    }
    if (cells.every((v) => v === 0) && links.length === 0) continue
    const d = trace({ ...doc, cells, cellObj: null, links }, cells, links)
    if (d) out.push(d)
  }
  return out
}

/* ------------------------------- staging preview ------------------------------- */

/**
 * Element id used while a stroke is in flight: out of range for doc.elements, so staged cells
 * preview with the document-level drawing style — exactly the style they will be frozen with when
 * the stroke commits.
 */
export const PENDING_OBJ = 0xff_ff_ff_ff

export interface StagingPreview {
  /** Staged ink: one path per (style group × color), drawn above the committed artwork */
  paths: StyledPath[]
  /** Buffer indices staged as erased; the caller punches these out of the committed layer */
  erase: number[]
}

/**
 * Incremental in-stroke preview built from ONLY the staged cells — a frame costs O(staged cells)
 * instead of a full-document rebuild, which keeps drawing responsive on 500×500+ grids with any
 * corner-rounding option (fragments go through the same path builders as shapeGeometry). Staged
 * cells always preview as their plain per-cell fragments: textured/outline/metaball documents show
 * flat strokes while dragging and gain their global effect on commit (the plain-until- release
 * preview contract — a per-frame whole-document rebuild can never hold a frame budget on large
 * grids). Returns null only when staged cells cannot be rendered as square-cell fragments at all:
 * non-square grids and connector add/remove.
 */
export function stagingPreview(doc: Doc, staging: Staging): StagingPreview | null {
  const s = staging.cells
  if (!s || s.size === 0) return null
  // non-square lattices and rotated grids reshape content outside the staged cell set
  if (!isPlainSquare(doc)) return null
  // connector add/remove redraws every link — needs the full rebuild
  if (staging.links && staging.links.length !== doc.links.length) return null

  const elementScope = doc.styleScope === 'element' && (doc.cellObj || staging.objs)
  const fallback = elementFromDoc(doc)

  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  interface Group {
    frags: Map<number, string[]>
  }
  const groups = new Map<string, Group>()
  const erase: number[] = []
  const colorOf = (v: number) =>
    staging.palette
      ? (staging.palette[(v - 1) % staging.palette.length] ?? '#888')
      : (cellColor(doc, v) ?? '#888')
  // inlay fragments keyed by resolved color, painted after every base group (mirrors shapeGeometry)
  const inlayFrags = new Map<string, string[]>()
  const inlayColorForKey = new Map<string, (v: number) => string>()
  const palette = staging.palette ?? doc.palette

  for (const [i, v] of s) {
    if (v === null || v === 0) {
      erase.push(i)
      continue
    }
    const id = elementScope ? (staging.objs?.get(i) ?? doc.cellObj?.[i] ?? 0) : 0
    const el =
      id >= 1 && id !== PENDING_OBJ && doc.elements[id - 1] ? doc.elements[id - 1] : fallback
    const key = elementStyleKey(el)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { frags: new Map() }))
    let frags = g.frags.get(v)
    if (!frags) g.frags.set(v, (frags = []))
    frags.push(stagedCellPath(el, colorOf(v), i, bw, bh, doc.sub))
    if (isInlayOn(el.style.inlay)) {
      let inlayColorOf = inlayColorForKey.get(key)
      if (!inlayColorOf) {
        inlayColorOf = createInlayColorOf(palette, el.style.inlay)
        inlayColorForKey.set(key, inlayColorOf)
      }
      const ic = inlayColorOf(v)
      let ilist = inlayFrags.get(ic)
      if (!ilist) inlayFrags.set(ic, (ilist = []))
      ilist.push(stagedInlayPath(el, colorOf(v), i, bw, doc.sub))
    }
  }

  const paths: StyledPath[] = []
  const stroke = doc.style.stroke
  const strokeOn = isStrokeOn(stroke)
  for (const g of groups.values()) {
    for (const [v, frags] of g.frags) {
      const d = frags.join('')
      paths.push(
        strokeOn
          ? {
              d,
              fill: stroke.fill ? colorOf(v) : undefined,
              stroke: strokeColorOf(palette, stroke, v),
              strokeWidth: stroke.width,
            }
          : { d, fill: colorOf(v) },
      )
    }
  }
  for (const [ic, ilist] of inlayFrags) {
    paths.push({ d: ilist.join(''), fill: ic })
  }
  return { paths, erase }
}

/** Base figure box of one staged cell (stretch + tone sizing), shared by the base/inlay fragments. */
function stagedFigureBox(
  st: ElementStyle['style'],
  color: string,
  bx: number,
  by: number,
  sub: number,
): { x: number; y: number; w: number; h: number } {
  const cw = st.sizeX / sub
  const ch = st.sizeY / sub
  let x = bx / sub + (1 / sub - cw) / 2
  let y = by / sub + (1 / sub - ch) / 2
  let w = cw
  let h = ch
  if (st.toneSize) {
    // mirrors shapeGeometry: the figure shrinks with its color's lightness
    const k = toneScale(color, st.toneSizeMin)
    w = cw * k
    h = ch * k
    x = bx / sub + (1 / sub - w) / 2
    y = by / sub + (1 / sub - h) / 2
  }
  return { x, y, w, h }
}

/**
 * Path of ONE staged buffer cell rendered with an element style — the exact fragment
 * `stagingPreview` paints per staged cell, exposed for callers that composite staged ink
 * incrementally frame by frame (the canvas stroke layer). `color` feeds toneSize scaling only;
 * radii clamp to the cell box exactly like shapeGeometry's per-cell path.
 */
export function stagedCellPath(
  el: ElementStyle,
  color: string,
  i: number,
  bw: number,
  bh: number,
  sub: number,
): string {
  const st = el.style
  const bx = i % bw
  const by = (i - bx) / bw
  const { x, y, w, h } = stagedFigureBox(st, color, bx, by, sub)
  const rBase = (st.radius * Math.min(st.sizeX, st.sizeY)) / sub
  const corner = (o: number | null) =>
    o === null ? rBase : (o * Math.min(st.sizeX, st.sizeY)) / sub
  const radii = [
    corner(st.corners.tl),
    corner(st.corners.tr),
    corner(st.corners.br),
    corner(st.corners.bl),
  ]
  const radiiHere =
    st.squareEdges && (bx === 0 || by === 0 || bx === bw - 1 || by === bh - 1)
      ? borderRadii(radii, bx === 0, by === 0, bx === bw - 1, by === bh - 1)
      : radii
  const chamfer = st.cornerStyle === 'chamfer'
  return st.shape === 'square' && st.shapeParams.rotation === 0
    ? roundedRectPath(x, y, w, h, radiiHere, chamfer)
    : cellShapeFragment({
        id: st.shape,
        x,
        y,
        w,
        h,
        params: st.shapeParams,
        radius: st.radius,
        chamfer,
      })
}

/** Inlay fragment of ONE staged cell ('' when the style has no inner figure). */
export function stagedInlayPath(
  el: ElementStyle,
  color: string,
  i: number,
  bw: number,
  sub: number,
): string {
  const st = el.style
  if (!isInlayOn(st.inlay)) return ''
  const bx = i % bw
  const by = (i - bx) / bw
  const box = stagedFigureBox(st, color, bx, by, sub)
  return inlayFragment(st.inlay, box, 0, st.radius, st.cornerStyle === 'chamfer')
}

/** Squared distance from a pixel-cell coordinate to a link (for eraser hit testing). */
export function distanceToLinkSq(l: Link, px: number, py: number): number {
  const ax = l.ax + 0.5
  const ay = l.ay + 0.5
  const bx = l.bx + 0.5
  const by = l.by + 0.5
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 > 0 ? ((px + 0.5 - ax) * abx + (py + 0.5 - ay) * aby) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = px + 0.5 - (ax + t * abx)
  const dy = py + 0.5 - (ay + t * aby)
  return dx * dx + dy * dy
}
