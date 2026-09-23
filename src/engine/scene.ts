/**
 * Scene tree: Photoshop/Illustrator-style layers of groups and paint objects. Pure data
 * plus the composite that feeds the flat rendering engine.
 *
 * `doc.layers === null` is a legacy flat document: ink lives directly in `cells`/`cellObj`
 * and nothing here ever touches it. A doc with layers treats `cells`, `cellObj`, `links`
 * and `elements` as DERIVED fields recomputed by `syncDoc` from the tree, so the whole
 * rendering engine (geometry, outlines, exports) keeps reading the flat buffers unchanged.
 *
 * Object and group ids are stable for their lifetime (never renumbered): selection, links
 * and `cellObj` reference them directly. `nextNodeId` in the Doc hands out fresh ids.
 *
 * Tree order is bottom → top: `children[0]` renders first (lowest), the last child is the
 * topmost. The layers panel displays the reversed order, like every major editor.
 */

import type { Doc, ElementStyle, GridType, Link, SubDetail } from './doc'
import { changeSub, elementFromDoc, resizeDoc } from './doc'
import { convertGridDoc, convertLink, gridConvertMap } from './grids'
import { evalGraph, graphColors, nodeDef, type Graph } from './nodes'

export interface SceneObj {
  kind: 'obj'
  id: number
  /** user-visible name; '' = the UI shows a localized default ("Object N") */
  name: string
  visible: boolean
  locked: boolean
  style: ElementStyle
  /** sparse ink: buffer index → palette value (1-based), always within the current grid */
  cells: Map<number, number>
  links: Link[]
  /**
   * Live node graph: when present, the ink and the appearance are EVALUATED from it at
   * composite time (the `cells`/`style` above act as fallback only for legacy objects).
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

export function isObj(item: SceneItem): item is SceneObj {
  return item.kind === 'obj'
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
    obj: { kind: 'obj', id, name, visible: true, locked: false, style, cells: new Map(), links: [] },
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
export function initialScene(doc: Doc): Pick<Doc, 'layers' | 'nextNodeId'> {
  const { layer, doc: d } = newLayer(doc)
  return { layers: [layer], nextNodeId: d.nextNodeId }
}

/** Visit every object of the tree (hidden ones included), bottom → top. */
export function eachObj(
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
  /** the array holding the item (the layers array, a layer's or a group's children) */
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
 * Effective edit protection: the node itself, any ancestor group or the owning layer is
 * locked, or some ancestor/layer is hidden (hidden content is not editable either).
 */
export function nodeProtected(layers: SceneLayer[], id: number): boolean {
  let locked = false
  const visit = (items: SceneItem[], layer: SceneLayer, vis: boolean, lock: boolean): boolean => {
    for (const item of items) {
      if (item.id === id) return lock || item.locked || !vis || !layer.visible || layer.locked
      if (item.kind === 'group' && visit(item.children, layer, vis && item.visible, lock || item.locked))
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
  /** style table indexed by object id - 1; holes are filled with the doc-level fallback */
  elements: ElementStyle[]
  /** doc palette extended with every color referenced by object graphs */
  palette: string[]
  dims: string
}

// Keyed by the layers array identity: every tree mutation creates a new array, while
// style-only changes keep it — so unchanged docs skip the rebuild entirely and the
// derived buffers keep stable identities across renders.
const compositeCache = new WeakMap<SceneLayer[], Composite>()

function buildComposite(doc: Doc, dims: string): Composite {
  const length = doc.cols * doc.sub * doc.rows * doc.sub
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

  // pass 2: evaluate graphs (or take the stored ink) and paint bottom → top
  for (const obj of all) elements[obj.id - 1] = obj.style
  for (const layer of doc.layers!) {
    for (const obj of visibleObjs(layer)) {
      if (obj.graph) {
        // single eval pass: the raster nodes fill the map, the style nodes write the
        // style clone — the evaluated appearance becomes the object's element style
        const { cells: ink, style } = evalGraph(obj.graph, {
          bw: doc.cols * doc.sub,
          bh: doc.rows * doc.sub,
          paletteLen: derived.length,
          hexValue,
          baseStyle: obj.style,
        }, obj.cells)
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
 * Recompute the derived flat buffers from the scene tree. Every store action calls this
 * on its result; unchanged trees hit the cache and return the same Doc identity.
 */
export function syncDoc(doc: Doc): Doc {
  const layers = doc.layers
  if (!layers) return doc
  // the base palette fingerprint is part of the key: graph colors resolve against it,
  // so a palette edit must rebuild the derived palette and re-evaluate the graphs
  const dims = `${doc.gridType}|${doc.cols}|${doc.rows}|${doc.sub}|${doc.palette.join(',')}`
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
 * Build a scene from legacy flat element data: one layer, one object per element
 * (its cells read from `cellObj`), unattributed ink as one bottom object with the
 * doc-level frozen style. Used when opening v1/v2 projects and when the user first
 * needs structure on an old document.
 */
export function sceneFromLegacy(doc: Doc): Pick<Doc, 'layers' | 'nextNodeId'> {
  const length = doc.cells.length
  const byEl = new Map<number, Map<number, number>>()
  for (let i = 0; i < length; i++) {
    const v = doc.cells[i]
    if (v === 0) continue
    const owner = doc.cellObj ? doc.cellObj[i] : 0
    let bucket = byEl.get(owner)
    if (!bucket) byEl.set(owner, (bucket = new Map()))
    bucket.set(i, v)
  }
  let next = doc.nextNodeId
  const mkObj = (style: ElementStyle, cells: Map<number, number>, links: Link[]): SceneObj => ({
    kind: 'obj',
    id: next++,
    name: '',
    visible: true,
    locked: false,
    style,
    cells,
    links,
  })
  const objs: SceneObj[] = []
  const unattributed = byEl.get(0)
  if (unattributed) objs.push(mkObj(elementFromDoc(doc), unattributed, doc.links.filter((l) => !l.obj)))
  const objLinks = doc.links.filter((l) => l.obj)
  for (let id = 1; id <= doc.elements.length; id++) {
    const cells = byEl.get(id)
    if (!cells && !objLinks.some((l) => l.obj === id)) continue
    const style = doc.elements[id - 1] ?? elementFromDoc(doc)
    objs.push(mkObj(style, cells ?? new Map(), objLinks.filter((l) => l.obj === id)))
  }
  // links referencing unknown elements (corrupt data) survive on the last object
  const stray = objLinks.filter((l) => l.obj === undefined || l.obj > doc.elements.length)
  if (stray.length > 0 && objs.length > 0) objs[objs.length - 1].links.push(...stray)
  const layer: SceneLayer = {
    kind: 'layer',
    id: next++,
    name: '',
    visible: true,
    locked: false,
    children: objs,
  }
  return { layers: [layer], nextNodeId: next }
}

/* ------------------------ buffer transforms over the tree ------------------------ */

/** Clone the tree, moving every object's sparse cells through a 1:1 old→new index map. */
function remapTree1to1(
  layers: SceneLayer[],
  map: Int32Array,
  mapLink: (l: Link) => Link | null,
): SceneLayer[] {
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.map((item) => {
      if (item.kind === 'group') return { ...item, children: walk(item.children) }
      const cells = new Map<number, number>()
      for (const [i, v] of item.cells) {
        const j = i >= 0 && i < map.length ? map[i] : -1
        if (j >= 0) cells.set(j, v)
      }
      const links: Link[] = []
      for (const l of item.links) {
        const mapped = mapLink(l)
        if (mapped) links.push(mapped)
      }
      return { ...item, cells, links }
    })
  return layers.map((layer) => ({ ...layer, children: walk(layer.children) }))
}

/**
 * Invert a new→old sampling map into a packed old→[new…] adjacency, so an object's ink can
 * fan out to every target cell that samples it (upsampling duplicates, unlike a 1:1 map).
 */
function invertSampleMap(newToOld: Int32Array, oldLength: number): {
  starts: Int32Array
  targets: Int32Array
} {
  const starts = new Int32Array(oldLength + 1)
  for (let j = 0; j < newToOld.length; j++) {
    const i = newToOld[j]
    if (i >= 0) starts[i + 1]++
  }
  for (let i = 0; i < oldLength; i++) starts[i + 1] += starts[i]
  const targets = new Int32Array(starts[oldLength])
  const cursor = starts.slice(0, oldLength)
  for (let j = 0; j < newToOld.length; j++) {
    const i = newToOld[j]
    if (i >= 0) targets[cursor[i]++] = j
  }
  return { starts, targets }
}

/** Clone the tree, copying every object's ink to all cells that sample it. */
function remapTreeSample(
  layers: SceneLayer[],
  starts: Int32Array,
  targets: Int32Array,
  mapLink: (l: Link) => Link | null,
): SceneLayer[] {
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.map((item) => {
      if (item.kind === 'group') return { ...item, children: walk(item.children) }
      const cells = new Map<number, number>()
      for (const [i, v] of item.cells) {
        for (let k = starts[i] ?? 0; k < (starts[i + 1] ?? 0); k++) cells.set(targets[k], v)
      }
      const links: Link[] = []
      for (const l of item.links) {
        const mapped = mapLink(l)
        if (mapped) links.push(mapped)
      }
      return { ...item, cells, links }
    })
  return layers.map((layer) => ({ ...layer, children: walk(layer.children) }))
}

/** Scene-aware resizeDoc: same top-left anchoring as the flat transform, per object. */
export function resizedDoc(doc: Doc, cols: number, rows: number): Doc {
  const flat = resizeDoc(doc, cols, rows)
  if (!doc.layers) return flat
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  const nbw = flat.cols * flat.sub
  const nbh = flat.rows * flat.sub
  const map = new Int32Array(doc.cells.length).fill(-1)
  for (let y = 0; y < Math.min(bh, nbh); y++) {
    for (let x = 0; x < Math.min(bw, nbw); x++) map[y * bw + x] = y * nbw + x
  }
  const layers = remapTree1to1(doc.layers, map, (l) =>
    l.ax < flat.cols && l.bx < flat.cols && l.ay < flat.rows && l.by < flat.rows ? l : null,
  )
  return syncDoc({ ...flat, layers })
}

/** Scene-aware changeSub: the same nearest-neighbor sampler, applied per object. */
export function subbedDoc(doc: Doc, sub: SubDetail): Doc {
  const flat = changeSub(doc, sub)
  if (!doc.layers || sub === doc.sub) return flat
  const oldSub = doc.sub
  const oldBw = doc.cols * oldSub
  const oldBh = doc.rows * oldSub
  const nbw = doc.cols * sub
  const nbh = doc.rows * sub
  // new→old, exactly the formulas of doc.changeSub
  const newToOld = new Int32Array(nbw * nbh).fill(-1)
  for (let y = 0; y < nbh; y++) {
    const oy = Math.min(
      oldBh - 1,
      Math.floor(y / sub) * oldSub + Math.floor(((y % sub) * oldSub) / sub),
    )
    for (let x = 0; x < nbw; x++) {
      const ox = Math.min(
        oldBw - 1,
        Math.floor(x / sub) * oldSub + Math.floor(((x % sub) * oldSub) / sub),
      )
      newToOld[y * nbw + x] = oy * oldBw + ox
    }
  }
  const { starts, targets } = invertSampleMap(newToOld, oldBw * oldBh)
  const layers = remapTreeSample(doc.layers, starts, targets, (l) => l)
  return syncDoc({ ...flat, layers })
}

/** Scene-aware grid conversion: per-object resample + connector remap. */
export function convertedGridDoc(
  doc: Doc,
  gridType: GridType,
  cols?: number,
  rows?: number,
  even?: boolean,
): Doc {
  const flat = convertGridDoc(doc, gridType, cols, rows, even)
  if (!doc.layers) return flat
  const m = gridConvertMap(doc, gridType, cols, rows, even)
  const newToOld = Int32Array.from(m.map)
  const { starts, targets } = invertSampleMap(newToOld, doc.cells.length)
  const layers = remapTreeSample(doc.layers, starts, targets, (l) => convertLink(l, m))
  return syncDoc({ ...flat, layers })
}

/**
 * Bring a legacy element-scope document into the scene model (one layer, one object per
 * element). Global-scope documents stay flat — their layers UI shows the scope hint.
 */
export function ensureScene(doc: Doc): Doc {
  if (doc.layers) return doc
  if (doc.styleScope !== 'element') return doc
  return syncDoc({ ...doc, ...sceneFromLegacy(doc) })
}

/* ----------------------------- tree editing (pure) ----------------------------- */

/**
 * Immutably replace one node anywhere in the tree. The root array is always cloned so the
 * composite cache (keyed by its identity) invalidates. Returns null when the id is unknown.
 */
export function updateNode(
  layers: SceneLayer[],
  id: number,
  updater: (node: SceneNode) => SceneNode,
): SceneLayer[] | null {
  let hit = false
  const mapItem = (item: SceneItem): SceneItem => {
    if (hit) return item
    if (item.id === id) {
      hit = true
      return updater(item) as SceneItem
    }
    if (item.kind === 'group') return { ...item, children: item.children.map(mapItem) }
    return item
  }
  const next = layers.map((layer) => {
    if (hit) return layer
    if (layer.id === id) {
      hit = true
      return updater(layer) as SceneLayer
    }
    return { ...layer, children: layer.children.map(mapItem) }
  })
  return hit ? next : null
}

/** Remove objects by id (groups and layers stay); returns the removed objects. */
export function removeObjs(
  layers: SceneLayer[],
  ids: ReadonlySet<number>,
): { layers: SceneLayer[]; removed: SceneObj[] } {
  const removed: SceneObj[] = []
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.flatMap<SceneItem>((item) => {
      if (item.kind === 'obj') {
        if (ids.has(item.id)) {
          removed.push(item)
          return []
        }
        return [item]
      }
      return [{ ...item, children: walk(item.children) }]
    })
  return { layers: layers.map((l) => ({ ...l, children: walk(l.children) })), removed }
}

/**
 * Drop the given buffer indices from every object of one layer (the paint-over rule:
 * within a layer a cell has exactly one owner, and new ink takes it over).
 */
export function stealCells(
  layers: SceneLayer[],
  layerId: number,
  idxs: ReadonlySet<number>,
): SceneLayer[] {
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.map((item) => {
      if (item.kind === 'group') return { ...item, children: walk(item.children) }
      if (item.cells.size === 0) return item
      let cells: Map<number, number> | null = null
      for (const i of idxs) {
        if (item.cells.has(i)) {
          cells ??= new Map(item.cells)
          cells.delete(i)
        }
      }
      return cells ? { ...item, cells } : item
    })
  return layers.map((layer) =>
    layer.id === layerId ? { ...layer, children: walk(layer.children) } : layer,
  )
}

/**
 * Drop objects that own no cells and no links (idempotent GC after erasing). Objects
 * with a source node are NEVER dropped: their graph regenerates ink from parameters,
 * so empty stored cells do not mean an empty object.
 */
export function pruneEmptyObjs(
  layers: SceneLayer[],
  keep: ReadonlySet<number> = new Set(),
): { layers: SceneLayer[]; removedIds: number[] } {
  const removedIds: number[] = []
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.flatMap<SceneItem>((item) => {
      if (item.kind === 'obj') {
        const regenerates =
          !!item.graph?.nodes.some((nd) => !nd.unknown && nodeDef(nd.op)?.kind === 'source')
        if (
          item.cells.size === 0 &&
          item.links.length === 0 &&
          !keep.has(item.id) &&
          !regenerates
        ) {
          removedIds.push(item.id)
          return []
        }
        return [item]
      }
      return [{ ...item, children: walk(item.children) }]
    })
  return { layers: layers.map((l) => ({ ...l, children: walk(l.children) })), removedIds }
}

/** Append an item on top of a layer's children. */
export function appendToLayer(layers: SceneLayer[], layerId: number, item: SceneItem): SceneLayer[] {
  return layers.map((layer) =>
    layer.id === layerId ? { ...layer, children: [...layer.children, item] } : layer,
  )
}

/**
 * Group the given objects. v1 rule: all members must be direct children of the same
 * parent (layer or group) — the group is inserted at the slot of the bottommost member,
 * preserving the members' relative order.
 */
export function groupObjs(
  layers: SceneLayer[],
  doc: Doc,
  memberIds: ReadonlySet<number>,
): { layers: SceneLayer[]; group: SceneGroup } | null {
  const refs = [...memberIds].map((id) => findNode(layers, id))
  if (refs.length === 0 || refs.some((r) => !r || r.item.kind !== 'obj')) return null
  const siblings = refs[0]!.siblings
  if (refs.some((r) => r!.siblings !== siblings)) return null
  // owner of the shared list: a layer, or the group that contains it
  const ownerRef: { node: SceneNode | null } = { node: null }
  const findOwner = (items: SceneItem[], container: SceneNode): boolean => {
    if (items === (siblings as SceneItem[])) {
      ownerRef.node = container
      return true
    }
    for (const item of items)
      if (item.kind === 'group' && findOwner(item.children, item)) return true
    return false
  }
  for (const layer of layers) if (findOwner(layer.children, layer)) break
  const owner = ownerRef.node
  if (!owner) return null
  const list = siblings as SceneItem[]
  const idxs = refs.map((r) => list.indexOf(r!.item as SceneItem)).sort((a, b) => a - b)
  const { group } = newGroup(doc)
  group.children = idxs.map((i) => list[i])
  const next = updateNode(layers, owner.id, (node) => {
    const children = (node as SceneGroup | SceneLayer).children.filter(
      (c) => !memberIds.has(c.id),
    )
    children.splice(idxs[0], 0, group)
    return { ...node, children } as SceneNode
  })
  return next ? { layers: next, group } : null
}

/**
 * Dissolve the outermost group containing each selected object: its children are lifted
 * into the group's own parent list at its position. One level per call.
 */
export function ungroupAround(
  layers: SceneLayer[],
  memberIds: ReadonlySet<number>,
): SceneLayer[] {
  const hasSelected = (items: SceneItem[]): boolean =>
    items.some((i) => (i.kind === 'obj' ? memberIds.has(i.id) : hasSelected(i.children)))
  const walk = (items: SceneItem[], dissolved: boolean): SceneItem[] =>
    items.flatMap((item) => {
      if (item.kind !== 'group') return [item]
      if (dissolved) return [{ ...item, children: walk(item.children, true) }]
      if (hasSelected(item.children)) return walk(item.children, true)
      return [{ ...item, children: walk(item.children, false) }]
    })
  return layers.map((l) => ({ ...l, children: walk(l.children, false) }))
}

/**
 * Move a node next to a target node as its sibling: `place` is expressed in tree order
 * ('before' = below the target, 'after' = above it). The layers panel displays the
 * reversed order, so it translates its drop position before calling this.
 */
export function reorderNode(
  layers: SceneLayer[],
  dragId: number,
  targetId: number,
  place: 'before' | 'after',
): SceneLayer[] | null {
  if (dragId === targetId) return null
  const drag = findNode(layers, dragId)
  const target = findNode(layers, targetId)
  if (!drag || !target) return null
  // never move a node into its own subtree
  let inSubtree = false
  const check = (node: SceneNode): void => {
    if (node.id === targetId) inSubtree = true
    if (node.kind === 'group' || node.kind === 'layer')
      (node.children as SceneItem[]).forEach(check)
  }
  check(drag.item)
  if (inSubtree) return null
  const insert = (nodes: SceneNode[]): SceneNode[] =>
    nodes.flatMap<SceneNode>((n) => {
      if (n.id === dragId) return []
      if (n.id === targetId) return place === 'before' ? [drag.item, n] : [n, drag.item]
      if (n.kind !== 'group') return [n]
      return [{ ...n, children: insert(n.children) as SceneItem[] }]
    })
  return insert(layers as SceneNode[]) as SceneLayer[]
}

/**
 * The sibling to move `id` next to when shifting it one slot in tree order (null at a
 * container edge). Feeds the Ctrl+[ / Ctrl+] stacking shortcuts.
 */
export function shiftTarget(
  layers: SceneLayer[],
  id: number,
  dir: 'before' | 'after',
): { targetId: number; place: 'before' | 'after' } | null {
  const ref = findNode(layers, id)
  if (!ref) return null
  const list = ref.siblings
  const at = list.indexOf(ref.item)
  if (dir === 'after') return at + 1 < list.length ? { targetId: list[at + 1].id, place: 'after' } : null
  return at - 1 >= 0 ? { targetId: list[at - 1].id, place: 'before' } : null
}

/** Translate one object's cells by whole pixel cells, dropping anything off-canvas. */
export function translateObjCells(
  obj: SceneObj,
  bdx: number,
  bdy: number,
  bw: number,
  bh: number,
): Map<number, number> {
  const cells = new Map<number, number>()
  for (const [i, v] of obj.cells) {
    const x = (i % bw) + bdx
    const y = Math.floor(i / bw) + bdy
    if (x < 0 || y < 0 || x >= bw || y >= bh) continue
    cells.set(y * bw + x, v)
  }
  return cells
}

/* --------------------------- sparse cell serialization --------------------------- */
/** [index, value, index, value, …] pairs for one object's sparse ink. */
export function encodeObjCells(cells: Map<number, number>): number[] {
  const out: number[] = []
  for (const [i, v] of cells) out.push(i, v)
  return out
}

/** Inverse of encodeObjCells; out-of-range indices are dropped. */
export function decodeObjCells(raw: unknown, length: number): Map<number, number> {
  const out = new Map<number, number>()
  if (!Array.isArray(raw)) return out
  for (let k = 0; k + 1 < raw.length; k += 2) {
    const i = Math.floor(Number(raw[k]))
    const v = Math.floor(Number(raw[k + 1]))
    if (!Number.isFinite(i) || !Number.isFinite(v) || i < 0 || i >= length || v <= 0) continue
    out.set(i, v)
  }
  return out
}
