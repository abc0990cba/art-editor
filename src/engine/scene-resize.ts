import type { Doc, Link, SubDetail } from './doc'
import { changeSub, resizeDoc } from './doc'
import { convertGridDoc, convertLink, gridConvertMap, type GridType } from './grids'
import { nodeDef } from './nodes'
import type { SceneGroup, SceneItem, SceneLayer, SceneNode, SceneObj } from './scene'
import { findNode, newGroup, syncDoc } from './scene'
import { sceneFromLegacy } from './scene-legacy'

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
 * Bring a legacy element-scope document into the scene model (one layer, one object per element).
 * Global-scope documents stay flat — their layers UI shows the scope hint.
 */
export function ensureScene(doc: Doc): Doc {
  if (doc.layers) return doc
  if (doc.styleScope !== 'element') return doc
  return syncDoc({ ...doc, ...sceneFromLegacy(doc) })
}

/* ----------------------------- tree editing (pure) ----------------------------- */

/**
 * Immutably replace one node anywhere in the tree. The root array is always cloned so the composite
 * cache (keyed by its identity) invalidates. Returns null when the id is unknown.
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
 * Drop the given buffer indices from every object of one layer (the paint-over rule: within a layer
 * a cell has exactly one owner, and new ink takes it over).
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
 * Drop objects that own no cells and no links (idempotent GC after erasing). Objects with a source
 * node are NEVER dropped: their graph regenerates ink from parameters, so empty stored cells do not
 * mean an empty object.
 */
export function pruneEmptyObjs(
  layers: SceneLayer[],
  keep: ReadonlySet<number> = new Set(),
): { layers: SceneLayer[]; removedIds: number[] } {
  const removedIds: number[] = []
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.flatMap<SceneItem>((item) => {
      if (item.kind === 'obj') {
        const regenerates = Boolean(
          item.graph?.nodes.some((nd) => !nd.unknown && nodeDef(nd.op)?.kind === 'source'),
        )
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
export function appendToLayer(
  layers: SceneLayer[],
  layerId: number,
  item: SceneItem,
): SceneLayer[] {
  return layers.map((layer) =>
    layer.id === layerId ? { ...layer, children: [...layer.children, item] } : layer,
  )
}

/**
 * Group the given objects. v1 rule: all members must be direct children of the same parent (layer
 * or group) — the group is inserted at the slot of the bottommost member, preserving the members'
 * relative order.
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
    const children = (node as SceneGroup | SceneLayer).children.filter((c) => !memberIds.has(c.id))
    children.splice(idxs[0], 0, group)
    return { ...node, children } as SceneNode
  })
  return next ? { layers: next, group } : null
}

/**
 * Dissolve the outermost group containing each selected object: its children are lifted into the
 * group's own parent list at its position. One level per call.
 */
export function ungroupAround(layers: SceneLayer[], memberIds: ReadonlySet<number>): SceneLayer[] {
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
 * Move a node next to a target node as its sibling: `place` is expressed in tree order ('before' =
 * below the target, 'after' = above it). The layers panel displays the reversed order, so it
 * translates its drop position before calling this.
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
 * The sibling to move `id` next to when shifting it one slot in tree order (null at a container
 * edge). Feeds the Ctrl+[ / Ctrl+] stacking shortcuts.
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
  if (dir === 'after')
    return at + 1 < list.length ? { targetId: list[at + 1].id, place: 'after' } : null
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

export function remapTree1to1(
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
 * Invert a new→old sampling map into a packed old→[new…] adjacency, so an object's ink can fan out
 * to every target cell that samples it (upsampling duplicates, unlike a 1:1 map).
 */

export function invertSampleMap(
  newToOld: Int32Array,
  oldLength: number,
): {
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
export function remapTreeSample(
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
