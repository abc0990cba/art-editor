/**
 * Scene tree: Photoshop/Illustrator-style layers of groups and paint objects. Pure data plus the
 * composite that feeds the flat rendering engine.
 *
 * `doc.layers === null` is a legacy flat document: ink lives directly in `cells`/`cellObj` and
 * nothing here ever touches it. A doc with layers treats `cells`, `cellObj`, `links` and `elements`
 * as DERIVED fields recomputed by `syncDoc` from the tree, so the whole rendering engine (geometry,
 * outlines, exports) keeps reading the flat buffers unchanged.
 *
 * Object and group ids are stable for their lifetime (never renumbered): selection, links and
 * `cellObj` reference them directly. `nextNodeId` in the Doc hands out fresh ids.
 *
 * Tree order is bottom → top: `children[0]` renders first (lowest), the last child is the topmost.
 * Objects keep their own ink even when covered: within a layer, overlap hides instead of destroying
 * — the composite (last writer wins per cell) decides visibility, so moving or hiding the covering
 * figure reveals the ones beneath intact. Only the eraser (`stealCells`) and explicit bakes remove
 * another object's cells. The layers panel displays the reversed order, like every major editor.
 */

import { paletteLuma } from '../color/color.ts'
import { docGrid } from '../grids/index.ts'
import { graphColors, type Graph } from '../nodes'
import { evalGraphMemo } from '../nodes/eval-memo.ts'
import type { Doc, ElementStyle, Link } from './doc'
import { elementFromDoc } from './doc-style.ts'
export interface SceneObj {
  kind: 'obj'
  id: number
  /** User-visible name; '' = the UI shows a localized default ("Object N") */
  name: string
  visible: boolean
  locked: boolean
  style: ElementStyle
  /** Sparse ink: buffer index → palette value (1-based), always within the current grid */
  cells: Map<number, number>
  links: Link[]
  /**
   * Live node graph: when present, the ink and the appearance are EVALUATED from it at composite
   * time (the `cells`/`style` above act as fallback only for legacy objects).
   */
  graph?: Graph
}

export interface SceneGroup {
  kind: 'group'
  id: number
  name: string
  visible: boolean
  locked: boolean
  children: SceneItem[]
}

export type SceneItem = SceneObj | SceneGroup

/** Any node of the scene: a tree item or a top-level layer. */
export type SceneNode = SceneItem | SceneLayer

export interface SceneLayer {
  kind: 'layer'
  id: number
  name: string
  visible: boolean
  locked: boolean
  children: SceneItem[]
}

/** Fresh empty layer with the next id from the doc's counter. */
export function newLayer(doc: Doc, name = ''): { layer: SceneLayer; doc: Doc } {
  const id = doc.nextNodeId
  return {
    layer: { kind: 'layer', id, name, visible: true, locked: false, children: [] },
    doc: { ...doc, nextNodeId: id + 1 },
  }
}

/** Fresh paint object carrying a frozen style snapshot. */
export function newObj(doc: Doc, style: ElementStyle, name = ''): { obj: SceneObj; doc: Doc } {
  const id = doc.nextNodeId
  return {
    obj: {
      kind: 'obj',
      id,
      name,
      visible: true,
      locked: false,
      style,
      cells: new Map(),
      links: [],
    },
    doc: { ...doc, nextNodeId: id + 1 },
  }
}

export function newGroup(doc: Doc, name = ''): { group: SceneGroup; doc: Doc } {
  const id = doc.nextNodeId
  return {
    group: { kind: 'group', id, name, visible: true, locked: false, children: [] },
    doc: { ...doc, nextNodeId: id + 1 },
  }
}

/** Initial scene for new documents: one empty layer. */
/** Visit every object of the tree (hidden ones included), bottom → top. */
function eachObj(
  layers: SceneLayer[],
  fn: (obj: SceneObj, layer: SceneLayer, visibleChain: boolean) => void,
): void {
  const walk = (items: SceneItem[], layer: SceneLayer, visible: boolean) => {
    for (const item of items) {
      if (item.kind === 'obj') fn(item, layer, visible && item.visible)
      else walk(item.children, layer, visible && item.visible)
    }
  }
  for (const layer of layers) walk(layer.children, layer, layer.visible)
}

/** Every object in the tree, bottom → top. */
export function allObjs(layers: SceneLayer[]): SceneObj[] {
  const out: SceneObj[] = []
  eachObj(layers, (obj) => out.push(obj))
  return out
}

/** Visible objects of one layer in draw order (group visibility respected). */
export function visibleObjs(layer: SceneLayer): SceneObj[] {
  const out: SceneObj[] = []
  const walk = (items: SceneItem[], visible: boolean) => {
    for (const item of items) {
      if (!visible) break
      if (item.kind === 'obj') {
        if (item.visible) out.push(item)
      } else walk(item.children, item.visible)
    }
  }
  walk(layer.children, layer.visible)
  return out
}

export interface SceneNodeRef {
  item: SceneNode
  /** The array holding the item (the layers array, a layer's or a group's children) */
  siblings: SceneNode[]
  layer: SceneLayer
}

/** Locate a node by id (layers, groups and objects share one id space). */
export function findNode(layers: SceneLayer[], id: number): SceneNodeRef | null {
  const visit = (items: SceneItem[], layer: SceneLayer): SceneNodeRef | null => {
    for (const item of items) {
      if (item.id === id) return { item, siblings: items, layer }
      if (item.kind === 'group') {
        const hit = visit(item.children, layer)
        if (hit) return hit
      }
    }
    return null
  }
  for (const layer of layers) {
    if (layer.id === id) return { item: layer, siblings: layers, layer }
    const hit = visit(layer.children, layer)
    if (hit) return hit
  }
  return null
}

/** The layer an object id belongs to, or null. */
export function objLayer(layers: SceneLayer[], objId: number): SceneLayer | null {
  let found: SceneLayer | null = null
  eachObj(layers, (obj, layer) => {
    if (obj.id === objId) found = layer
  })
  return found
}

/**
 * The outermost group that contains the object, or null when it sits directly in a layer. The
 * select tool treats this group as the click unit (Illustrator practice): one click picks the whole
 * group, not the single shape inside it.
 */
export function groupAncestorOf(layers: SceneLayer[], objId: number): SceneGroup | null {
  // undefined = "not on this branch", distinct from null = "found directly in a layer"
  const visit = (items: SceneItem[], outer: SceneGroup | null): SceneGroup | null | undefined => {
    for (const item of items) {
      if (item.kind === 'obj') {
        if (item.id === objId) return outer
      } else {
        const hit = visit(item.children, outer ?? item)
        if (hit !== undefined) return hit
      }
    }
    return undefined
  }
  for (const layer of layers) {
    const hit = visit(layer.children, null)
    if (hit !== undefined) return hit
  }
  return null
}

/** Every object id inside a group's subtree (deep, in tree order). */
export function objIdsWithin(group: SceneGroup): number[] {
  const out: number[] = []
  const walk = (items: SceneItem[]): void => {
    for (const item of items) {
      if (item.kind === 'obj') out.push(item.id)
      else walk(item.children)
    }
  }
  walk(group.children)
  return out
}

/**
 * Effective edit protection: the node itself, any ancestor group or the owning layer is locked, or
 * some ancestor/layer is hidden (hidden content is not editable either).
 */
export function nodeProtected(layers: SceneLayer[], id: number): boolean {
  let locked = false
  const visit = (items: SceneItem[], layer: SceneLayer, vis: boolean, lock: boolean): boolean => {
    for (const item of items) {
      if (item.id === id) return lock || item.locked || !vis || !layer.visible || layer.locked
      if (
        item.kind === 'group' &&
        visit(item.children, layer, vis && item.visible, lock || item.locked)
      )
        return true
    }
    return false
  }
  for (const layer of layers) {
    if (layer.id === id) return layer.locked
    if (visit(layer.children, layer, layer.visible, layer.locked)) {
      locked = true
      break
    }
  }
  return locked
}

/* ---------------------------------- composite ---------------------------------- */

interface Composite {
  cells: Uint16Array
  cellObj: Uint32Array | null
  links: Link[]
  /** Style table indexed by object id - 1; holes are filled with the doc-level fallback */
  elements: ElementStyle[]
  /** Doc palette extended with every color referenced by object graphs */
  palette: string[]
  dims: string
}

// Keyed by the layers array identity: every tree mutation creates a new array, while
// style-only changes keep it — so unchanged docs skip the rebuild entirely and the
// derived buffers keep stable identities across renders.
const compositeCache = new WeakMap<SceneLayer[], Composite>()

function buildComposite(doc: Doc, dims: string): Composite {
  // non-square lattices index cells by grid count, which can exceed the cols×rows buffer
  // (rhombille's 3 faces per hex, octasquare's gap squares) — allocate the larger of the two,
  // mirroring the load-time allocation in project-parse
  const grid = docGrid(doc)
  const length = Math.max(doc.cols * doc.sub * doc.rows * doc.sub, grid.count)
  const cells = new Uint16Array(length)
  const cellObj = new Uint32Array(length)
  const links: Link[] = []
  const fallback = elementFromDoc(doc)
  const all = allObjs(doc.layers!)
  const maxId = all.reduce((m, o) => Math.max(m, o.id), 0)
  const elements: ElementStyle[] = []
  for (let i = 0; i < maxId; i++) elements.push(fallback)

  // pass 1: the derived palette — the doc palette (deduplicated, case-normalized) plus
  // every color any graph references; graph recipes never duplicate palette entries
  const derived: string[] = []
  const hexIdx = new Map<string, number>()
  for (const hex of doc.palette) {
    const key = hex.toLowerCase()
    if (hexIdx.has(key)) continue
    hexIdx.set(key, derived.length)
    derived.push(hex)
  }
  for (const obj of all) {
    if (!obj.graph) continue
    for (const hex of graphColors(obj.graph)) {
      if (!hexIdx.has(hex)) {
        hexIdx.set(hex, derived.length)
        derived.push(hex)
      }
    }
  }
  const hexValue = (hex: string) => (hexIdx.get(hex.toLowerCase()) ?? 0) + 1
  const luma = (value: number) => paletteLuma(derived, value)

  // pass 2: evaluate graphs (or take the stored ink) and paint bottom → top
  for (const obj of all) elements[obj.id - 1] = obj.style
  for (const layer of doc.layers!) {
    for (const obj of visibleObjs(layer)) {
      if (obj.graph) {
        // single eval pass: the raster nodes fill the map, the style nodes write the
        // style clone — the evaluated appearance becomes the object's element style
        const { cells: ink, style } = evalGraphMemo(
          obj.graph,
          {
            bw: doc.cols * doc.sub,
            bh: doc.rows * doc.sub,
            grid,
            paletteLen: derived.length,
            hexValue,
            luma,
            baseStyle: obj.style,
          },
          obj.cells,
          doc.palette,
        )
        for (const [i, v] of ink) {
          if (i < 0 || i >= length) continue
          cells[i] = v
          cellObj[i] = obj.id
        }
        elements[obj.id - 1] = style
      } else {
        for (const [i, v] of obj.cells) {
          if (i < 0 || i >= length) continue
          cells[i] = v
          cellObj[i] = obj.id
        }
      }
      for (const l of obj.links) if (l.v > 0) links.push(l)
    }
  }
  return { cells, cellObj, links, elements, palette: derived, dims }
}

/**
 * Recompute the derived flat buffers from the scene tree. Every store action calls this on its
 * result; unchanged trees hit the cache and return the same Doc identity.
 */
export function syncDoc(doc: Doc): Doc {
  const layers = doc.layers
  if (!layers) return doc
  // the base palette fingerprint is part of the key: graph colors resolve against it,
  // so a palette edit must rebuild the derived palette and re-evaluate the graphs;
  // rotation/even-ness feed the grid the transform nodes evaluate against
  const dims = `${doc.gridType}|${doc.cols}|${doc.rows}|${doc.sub}|${doc.gridRotation ?? 0}|${doc.radialEven ? 'e' : 'u'}|${doc.palette.join(',')}`
  let cached = compositeCache.get(layers)
  if (!cached || cached.dims !== dims) {
    cached = buildComposite(doc, dims)
    compositeCache.set(layers, cached)
  }
  if (
    doc.cells === cached.cells &&
    doc.cellObj === cached.cellObj &&
    doc.links === cached.links &&
    doc.elements === cached.elements &&
    doc.palette === cached.palette
  )
    return doc
  return {
    ...doc,
    cells: cached.cells,
    cellObj: cached.cellObj,
    links: cached.links,
    elements: cached.elements,
    palette: cached.palette,
  }
}

/* --------------------------- legacy → scene migration --------------------------- */

/**
 * Build a scene from legacy flat element data: one layer, one object per element (its cells read
 * from `cellObj`), unattributed ink as one bottom object with the doc-level frozen style. Used when
 * opening v1/v2 projects and when the user first needs structure on an old document.
 */

export {
  convertedGridDoc,
  resizedDoc,
  subbedDoc,
  ensureScene,
  updateNode,
  removeObjs,
  stealCells,
  pruneEmptyObjs,
  appendToLayer,
  groupObjs,
  ungroupAround,
  reorderNode,
  shiftTarget,
  translateObjCells,
  encodeObjCells,
  decodeObjCells,
} from './scene-resize.ts'
export { sceneFromLegacy } from './scene-legacy.ts'
