import type { Doc, Link } from '../engine/doc.ts'
import { bufferWidth } from '../engine/doc.ts'
import type { GraphNode } from '../engine/nodes/index.ts'
import {
  allObjs,
  objLayer,
  pruneEmptyObjs,
  stealCells,
  syncDoc,
  updateNode,
  type SceneItem,
  type SceneLayer,
} from '../engine/scene.ts'
import {
  mapInk,
  selectionBox,
  xformMatrices,
  type InkCell,
  type SelectionXform,
} from '../engine/selection-xform.ts'
import type { State } from './editor.store.ts'
import { compactElements } from './selection.slice.ts'
import { genNodeId } from './store-internals.util.ts'

/**
 * The transform slice: whole-selection geometry edits beyond translation — scale/rotate/flip by
 * nearest-neighbor cell remapping, plus in-place duplication. All actions are undoable doc edits.
 * Procedural (graph-driven) objects bake: their live geometry is frozen into plain cells, since a
 * source node cannot express scale or rotation.
 */

/** Shift the trailing Offset node of a procedural graph (create it when the graph has none). */
function shiftedOffsetNodes(nodes: GraphNode[], dx: number, dy: number): GraphNode[] {
  const lastOffset = [...nodes].reverse().find((nd) => nd.op === 'mod.offset')
  if (!lastOffset) return [...nodes, { id: genNodeId(), op: 'mod.offset', params: { dx, dy } }]
  const next = [...nodes]
  const at = next.indexOf(lastOffset)
  next[at] = {
    ...lastOffset,
    params: {
      ...lastOffset.params,
      dx: (Number(lastOffset.params['dx']) || 0) + dx,
      dy: (Number(lastOffset.params['dy']) || 0) + dy,
    },
  }
  return next
}

/** Both endpoints of a connector still land inside the canvas. */
function linkInBounds(l: Link, cols: number, rows: number): boolean {
  return (
    l.ax >= 0 &&
    l.ay >= 0 &&
    l.bx >= 0 &&
    l.by >= 0 &&
    l.ax < cols &&
    l.ay < rows &&
    l.bx < cols &&
    l.by < rows
  )
}

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

/** Scene path of a transform: remap each object's ink through the shared nearest-neighbor sampler. */
function transformScene(doc: Doc, selection: number[], x: SelectionXform): Doc | null {
  const bw = bufferWidth(doc)
  const bh = doc.rows * doc.sub
  const src = selectionInk(doc, selection)
  if (!src) return null
  const box = selectionBox(doc.cells, doc.cellObj, selection, bw, bh)
  if (!box) return null
  const m = xformMatrices(x, box)
  const mapped = mapInk(src, m, box, bw, bh)
  const sel = new Set(selection)
  const movers = allObjs(doc.layers!).filter((o) => sel.has(o.id))
  if (movers.length === 0) return null
  // targets steal from the objects beneath (tree order decides overlap winners), like a move
  const claims = new Map<number, Set<number>>()
  for (const [i, cell] of mapped) {
    const layer = objLayer(doc.layers!, cell.o)!
    let claim = claims.get(layer.id)
    if (!claim) claims.set(layer.id, (claim = new Set()))
    claim.add(i)
  }
  let layers = doc.layers!
  for (const [layerId, idxs] of claims) layers = stealCells(layers, layerId, idxs)
  // connector endpoints ride the same affine map
  const mapLink = (l: Link): Link => mappedLink(l, m)
  for (const mover of movers) {
    const cells = new Map<number, number>()
    for (const [i, cell] of mapped) if (cell.o === mover.id) cells.set(i, cell.v)
    const links = mover.links.map(mapLink).filter((l) => linkInBounds(l, doc.cols, doc.rows))
    layers =
      updateNode(layers, mover.id, (n) =>
        n.kind === 'obj' ? { ...n, cells, links, graph: undefined } : n,
      ) ?? layers
  }
  const { layers: pruned } = pruneEmptyObjs(layers, sel)
  return syncDoc({ ...doc, layers: pruned })
}

/** Flat (legacy, layer-less) path of a transform. */
function transformFlat(
  doc: Doc,
  selection: number[],
  x: SelectionXform,
): { doc: Doc; selection: number[] } | null {
  const bw = bufferWidth(doc)
  const bh = doc.rows * doc.sub
  const src = selectionInk(doc, selection)
  if (!src) return null
  const box = selectionBox(doc.cells, doc.cellObj, selection, bw, bh)
  if (!box) return null
  const m = xformMatrices(x, box)
  const mapped = mapInk(src, m, box, bw, bh)
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
  const links = doc.links.map((l) => (l.obj && sel.has(l.obj) ? mappedLink(l, m) : l))
  return compactElements({ ...doc, cells, cellObj, links }, selection)
}

function mappedLink(l: Link, m: { fwd: (x: number, y: number) => [number, number] }): Link {
  const [ax, ay] = m.fwd(l.ax + 0.5, l.ay + 0.5)
  const [bx, by] = m.fwd(l.bx + 0.5, l.by + 0.5)
  return {
    ...l,
    ax: Math.floor(ax),
    ay: Math.floor(ay),
    bx: Math.floor(bx),
    by: Math.floor(by),
  }
}

/** Deep-clone context: selection set, collected clone ids, the id counter and the buffer size. */
interface CloneCtx {
  sel: Set<number>
  clones: number[]
  nextId: { v: number }
  bw: number
  bh: number
}

/** Deep-clone every selected object in place, offset by one cell; returns the clone tree + ids. */
function cloneSelected(items: SceneItem[], ctx: CloneCtx): SceneItem[] {
  const out: SceneItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.kind === 'obj' && ctx.sel.has(item.id)) {
      const id = ctx.nextId.v++
      ctx.clones.push(id)
      const graph = item.graph
        ? { ...item.graph, nodes: shiftedOffsetNodes(item.graph.nodes, 1, 1) }
        : undefined
      const cells = new Map<number, number>()
      for (const [i, v] of item.cells) {
        const x = (i % ctx.bw) + 1
        const y = Math.floor(i / ctx.bw) + 1
        if (x < 0 || y < 0 || x >= ctx.bw || y >= ctx.bh) continue
        cells.set(y * ctx.bw + x, v)
      }
      out.push({
        ...item,
        id,
        cells: item.graph ? item.cells : cells,
        links: item.links.map((l) => ({
          ...l,
          ax: l.ax + 1,
          ay: l.ay + 1,
          bx: l.bx + 1,
          by: l.by + 1,
        })),
        ...(graph ? { graph } : {}),
      })
    } else if (item.kind === 'group') {
      out[out.length - 1] = { ...item, children: cloneSelected(item.children, ctx) }
    }
  }
  return out
}

/** The transform slice surface, composed into the main store. */
export interface TransformSlice {
  /** Scale / rotate / flip every selected object's ink (undoable; square grid only) */
  transformSelection: (x: SelectionXform) => void
  /** Clone the selected objects, offset one cell down-right; the clones become the selection */
  duplicateSelection: () => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

export function createTransformSlice({ set }: SliceApi): TransformSlice {
  return {
    transformSelection: (x) =>
      set((s) => {
        if (s.selection.length === 0 || s.doc.gridType !== 'square') return s
        const doc = s.doc
        if (doc.layers) {
          const next = transformScene(doc, s.selection, x)
          return next ? { doc: next } : s
        }
        const next = transformFlat(doc, s.selection, x)
        return next ?? s
      }),

    duplicateSelection: () =>
      set((s) => {
        if (s.selection.length === 0 || s.doc.gridType !== 'square') return s
        const doc = s.doc
        const bw = bufferWidth(doc)
        const bh = doc.rows * doc.sub
        const sel = new Set(s.selection)
        if (doc.layers) {
          const clones: number[] = []
          const nextId = { v: doc.nextNodeId }
          const layers: SceneLayer[] = doc.layers.map((layer) => ({
            ...layer,
            children: cloneSelected(layer.children, { sel, clones, nextId, bw, bh }),
          }))
          if (clones.length === 0) return s
          return {
            doc: syncDoc({ ...doc, layers, nextNodeId: nextId.v }),
            selection: clones,
          }
        }
        // flat legacy doc: append clone elements after the existing ones
        const idShift = doc.elements.length
        const clonedIds = s.selection.filter((id) => id >= 1 && id <= idShift)
        if (clonedIds.length === 0) return s
        const remap = new Map<number, number>()
        clonedIds.forEach((id, k) => remap.set(id, idShift + k + 1))
        const cells = doc.cells.slice()
        const cellObj = doc.cellObj!.slice()
        // snapshot first: writes land one cell down-right, so in-place iteration
        // would otherwise cascade the copies
        const moved: [number, number, number][] = []
        for (let i = 0; i < cells.length; i++) {
          const o = cellObj[i]
          if (o > 0 && sel.has(o) && cells[i] > 0) moved.push([i, cells[i], o])
        }
        for (const [i, v, o] of moved) {
          const x = (i % bw) + 1
          const y = Math.floor(i / bw) + 1
          if (x >= bw || y >= bh) continue
          const t = y * bw + x
          cells[t] = v
          cellObj[t] = remap.get(o) ?? 0
        }
        const elements = [...doc.elements, ...clonedIds.map((id) => doc.elements[id - 1])]
        const links = [
          ...doc.links,
          ...doc.links
            .filter((l) => l.obj && sel.has(l.obj))
            .map((l) => ({
              ...l,
              obj: remap.get(l.obj!) ?? 0,
              ax: l.ax + 1,
              ay: l.ay + 1,
              bx: l.bx + 1,
              by: l.by + 1,
            })),
        ]
        return {
          doc: { ...doc, cells, cellObj, elements, links },
          selection: clonedIds.map((id) => remap.get(id) ?? 0),
        }
      }),
  }
}
