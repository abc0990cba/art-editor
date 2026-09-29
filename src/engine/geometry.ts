import { cellShapeFragment } from './cell-shapes.ts'
import { hexLuminance } from './color.ts'
import type { Doc, ElementStyle, Link, PixelStyle } from './doc'
import { bufferHeight, bufferWidth, cellColor, elementFromDoc } from './doc'
import { elementStyleKey, elementGeometry } from './geometry-elements.ts'
import { metaballGeometry } from './geometry-metaball.ts'
import { borderRadii, mergedCells, roundedRectPath, shapeGeometry } from './geometry-shape.ts'
import { gridBuildGeometry } from './grid-geometry.ts'
import { evalGraphMemo } from './nodes/eval-memo.ts'
import { outlineGeometry } from './outline'
import { visibleObjs } from './scene'

export type { Geometry, Staging, StyledPath } from './geometry-types.ts'
import type { Geometry, Staging, StyledPath } from './geometry-types.ts'

/* ---------------------------------- entry ---------------------------------- */

// Per-layer scratch buffers: each layer's geometry is fully consumed (paths built)
// before the next layer starts, so one pair suffices no matter how many layers exist.
let sceneScratchCells: Uint16Array | null = null
let sceneScratchObjs: Uint32Array | null = null

/**
 * Scene rendering: one scoped buffer per visible layer, bottom → top. Each layer runs through the
 * regular builders in isolation, which is what makes layers independent compositing spaces —
 * metaball fields and outlines never fuse across layers.
 */
function sceneGeometry(doc: Doc, staging?: Staging): Geometry {
  const layers = doc.layers!
  const length = doc.cells.length
  const preview = Boolean(staging && staging.cells && staging.cells.size > 0)
  // staged erase cells without a layer tag punch wherever their composite owner lives
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
              paletteLen: length,
              hexValue,
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
    } else if (doc.gridType !== 'square') {
      paths.push(...gridBuildGeometry(scoped, cells, links))
    } else if (doc.renderMode === 'metaball') {
      paths.push(...metaballGeometry(scoped, cells, links, preview).paths)
    } else if (doc.renderMode === 'outline') {
      paths.push(...outlineGeometry(scoped, cells, links))
    } else {
      paths.push(...shapeGeometry(scoped, cells, links).paths)
    }
  }
  return { paths }
}

export function buildGeometry(doc: Doc, staging?: Staging): Geometry {
  if (doc.layers) return sceneGeometry(doc, staging)
  const cells = mergedCells(doc, staging)
  const links = staging?.links ?? doc.links
  const preview = Boolean(staging && staging.cells && staging.cells.size > 0)
  if (doc.styleScope === 'element' && (doc.cellObj || staging?.objs)) {
    return elementGeometry(doc, cells, links, staging?.objs, preview)
  }
  if (doc.gridType !== 'square') return { paths: gridBuildGeometry(doc, cells, links) }
  if (doc.renderMode === 'metaball') return metaballGeometry(doc, cells, links, preview)
  if (doc.renderMode === 'outline') return { paths: outlineGeometry(doc, cells, links) }
  return shapeGeometry(doc, cells, links)
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
 * corner-rounding option (fragments go through the same path builders as shapeGeometry). Returns
 * null when the preview needs global context and the caller must fall back to buildGeometry:
 * outline/metaball contours, baked textures, connector edits and non-square grids all reshape
 * content outside the staged cell set.
 */
export function stagingPreview(doc: Doc, staging: Staging): StagingPreview | null {
  const s = staging.cells
  if (!s || s.size === 0) return null
  if (doc.gridType !== 'square') return null
  // connector add/remove redraws every link — needs the full rebuild
  if (staging.links && staging.links.length !== doc.links.length) return null

  const elementScope = doc.styleScope === 'element' && (doc.cellObj || staging.objs)
  const fallback = elementFromDoc(doc)
  const usable = (el: ElementStyle) => el.renderMode === 'pixels' && el.texture.effect === 'none'
  // global scope renders outline/metaball/textured docs canvas-wide, erase included
  if (!elementScope && !usable(fallback)) return null

  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  interface Group {
    style: PixelStyle
    frags: Map<number, string[]>
  }
  const groups = new Map<string, Group>()
  const erase: number[] = []
  const colorOf = (v: number) =>
    staging.palette
      ? (staging.palette[(v - 1) % staging.palette.length] ?? '#888')
      : (cellColor(doc, v) ?? '#888')

  for (const [i, v] of s) {
    if (v === null || v === 0) {
      // erasing reshapes the contour of whatever element owned the cell
      const owner = elementScope ? (doc.cellObj?.[i] ?? 0) : 0
      if (owner > 0) {
        const el = doc.elements[owner - 1]
        if (el && !usable(el)) return null
      }
      erase.push(i)
      continue
    }
    const id = elementScope ? (staging.objs?.get(i) ?? doc.cellObj?.[i] ?? 0) : 0
    const el =
      id >= 1 && id !== PENDING_OBJ && doc.elements[id - 1] ? doc.elements[id - 1] : fallback
    if (!usable(el)) return null
    const key = elementStyleKey(el)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { style: el.style, frags: new Map() }))
    let frags = g.frags.get(v)
    if (!frags) g.frags.set(v, (frags = []))
    const cw = el.style.sizeX / doc.sub
    const ch = el.style.sizeY / doc.sub
    const bx = i % bw
    const by = (i - bx) / bw
    const x = bx / doc.sub + (1 / doc.sub - cw) / 2
    const y = by / doc.sub + (1 / doc.sub - ch) / 2
    const rBase = el.style.radius * Math.min(cw, ch)
    const corner = (o: number | null) => (o === null ? rBase : o * Math.min(cw, ch))
    const radii = [
      corner(el.style.corners.tl),
      corner(el.style.corners.tr),
      corner(el.style.corners.br),
      corner(el.style.corners.bl),
    ]
    const radiiHere =
      el.style.squareEdges && (bx === 0 || by === 0 || bx === bw - 1 || by === bh - 1)
        ? borderRadii(radii, bx === 0, by === 0, bx === bw - 1, by === bh - 1)
        : radii
    const chamfer = el.style.cornerStyle === 'chamfer'
    let fx = x
    let fy = y
    let fw = cw
    let fh = ch
    if (el.style.toneSize) {
      // mirrors shapeGeometry: the figure shrinks with its color's lightness
      const k = el.style.toneSizeMin + (1 - el.style.toneSizeMin) * (1 - hexLuminance(colorOf(v)))
      fw = cw * k
      fh = ch * k
      fx = bx / doc.sub + (1 / doc.sub - fw) / 2
      fy = by / doc.sub + (1 / doc.sub - fh) / 2
    }
    frags.push(
      el.style.shape === 'square' && el.style.shapeParams.rotation === 0
        ? roundedRectPath(fx, fy, fw, fh, radiiHere, chamfer)
        : cellShapeFragment({
            id: el.style.shape,
            x: fx,
            y: fy,
            w: fw,
            h: fh,
            params: el.style.shapeParams,
            radius: el.style.radius,
            chamfer,
          }),
    )
  }

  const paths: StyledPath[] = []
  for (const g of groups.values()) {
    for (const [v, frags] of g.frags) {
      paths.push({ d: frags.join(''), fill: colorOf(v) })
    }
  }
  return { paths, erase }
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
