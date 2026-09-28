import type {
  Connectivity,
  Doc,
  ElementStyle,
  Link,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  TextureSettings,
} from '../engine/doc.ts'
import { nodeDef, type GraphNode } from '../engine/nodes/index.ts'
import {
  allObjs,
  nodeProtected,
  objLayer,
  pruneEmptyObjs,
  removeObjs,
  stealCells,
  syncDoc,
  translateObjCells,
  updateNode,
  type SceneObj,
} from '../engine/scene.ts'
import type { State } from './editor.store.ts'
import { genNodeId } from './store-internals.util.ts'

/**
 * Partial update applied to every selected element: style parts patch the frozen pixel style, the
 * rest replace whole setting blocks (metaball/texture patch their blocks).
 */
export interface ElementStylePatch {
  style?: Partial<PixelStyle>
  renderMode?: RenderMode
  connectivity?: Connectivity
  metaball?: Partial<MetaballSettings>
  texture?: Partial<TextureSettings>
}

/** Drop elements no longer referenced by any cell or connector; remap ids (and selection). */
function compactElements(doc: Doc, selection: number[]): { doc: Doc; selection: number[] } {
  const used = new Set<number>()
  if (doc.cellObj) {
    for (let i = 0; i < doc.cellObj.length; i++) if (doc.cellObj[i] > 0) used.add(doc.cellObj[i])
  }
  for (const l of doc.links) if (l.obj) used.add(l.obj)
  const remap = new Map<number, number>()
  const elements: ElementStyle[] = []
  for (let id = 1; id <= doc.elements.length; id++) {
    if (!used.has(id)) continue
    remap.set(id, elements.length + 1)
    elements.push(doc.elements[id - 1])
  }
  if (elements.length === doc.elements.length) return { doc, selection }
  const cellObj = doc.cellObj?.slice() ?? null
  if (cellObj) {
    for (let i = 0; i < cellObj.length; i++) cellObj[i] = remap.get(cellObj[i]) ?? 0
  }
  const links = doc.links.map((l) => (l.obj ? { ...l, obj: remap.get(l.obj) ?? 0 } : l))
  return {
    doc: { ...doc, elements, cellObj, links },
    selection: selection.map((id) => remap.get(id) ?? 0).filter((id) => id > 0),
  }
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

/** Shift a connector set by dx/dy, dropping ones that leave the canvas. */
function translateLinks(
  links: readonly Link[],
  dx: number,
  dy: number,
  cols: number,
  rows: number,
): Link[] {
  return links
    .map((l) => ({ ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy }))
    .filter((l) => linkInBounds(l, cols, rows))
}

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

/** Canvas indexes (doc-cell space) covered by the movers' own ink. */
function movedPixelSet(movers: SceneObj[], cols: number, sub: number): Set<number> {
  const bw = cols * sub
  const movedPixels = new Set<number>()
  for (const mover of movers) {
    for (const [i] of mover.cells) {
      movedPixels.add(Math.floor((i % bw) / sub) + Math.floor(i / bw / sub) * cols)
    }
  }
  return movedPixels
}

/**
 * Scene path of a selection move: translate each object's own cells; targets steal from the objects
 * beneath (tree order decides who wins when movers overlap).
 */
function moveSelectionScene(doc: Doc, selection: number[], dx: number, dy: number): Doc | null {
  const sub = doc.sub
  const bdx = dx * sub
  const bdy = dy * sub
  const bw = doc.cols * sub
  const bh = doc.rows * sub
  const sel = new Set(selection)
  const movers = allObjs(doc.layers!).filter((o) => sel.has(o.id))
  if (movers.length === 0) return null
  // procedural graphs regenerate their ink from params: the move is written
  // into the trailing Offset node instead of the stored cells
  const procedural = new Set(
    movers
      .filter((o) => o.graph?.nodes.some((nd) => !nd.unknown && nodeDef(nd.op)?.kind === 'source'))
      .map((o) => o.id),
  )
  const claims = new Map<number, Set<number>>()
  for (const mover of movers) {
    if (procedural.has(mover.id)) continue
    const layer = objLayer(doc.layers!, mover.id)!
    let claim = claims.get(layer.id)
    if (!claim) claims.set(layer.id, (claim = new Set()))
    for (const [i] of translateObjCells(mover, bdx, bdy, bw, bh)) claim.add(i)
  }
  let layers = doc.layers!
  for (const [layerId, idxs] of claims) layers = stealCells(layers, layerId, idxs)
  for (const mover of movers) {
    if (procedural.has(mover.id)) {
      console.log('DEBUG store: procedural move for', mover.id)
      layers =
        updateNode(layers, mover.id, (nd) =>
          nd.kind === 'obj' && nd.graph
            ? { ...nd, graph: { ...nd.graph, nodes: shiftedOffsetNodes(nd.graph.nodes, dx, dy) } }
            : nd,
        ) ?? layers
      continue
    }
    const cells = translateObjCells(mover, bdx, bdy, bw, bh)
    const links = translateLinks(mover.links, dx, dy, doc.cols, doc.rows)
    layers =
      updateNode(layers, mover.id, (n) => (n.kind === 'obj' ? { ...n, cells, links } : n)) ?? layers
  }
  // connectors visually attached to moved pixels follow the move even when
  // their own object stays put (both endpoints must land on moved pixels)
  const movedPixels = movedPixelSet(movers, doc.cols, sub)
  const onMoved = (l: Link): boolean =>
    movedPixels.has(l.ay * doc.cols + l.ax) && movedPixels.has(l.by * doc.cols + l.bx)
  for (const o of allObjs(layers)) {
    if (sel.has(o.id) || !o.links.some(onMoved)) continue
    layers =
      updateNode(layers, o.id, (n) => {
        if (n.kind !== 'obj') return n
        return {
          ...n,
          links: n.links
            .map((l) =>
              onMoved(l) ? { ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy } : l,
            )
            .filter((l) => linkInBounds(l, doc.cols, doc.rows)),
        }
      }) ?? layers
  }
  const { layers: pruned } = pruneEmptyObjs(layers, sel)
  return syncDoc({ ...doc, layers: pruned })
}

/** Flat (legacy, layer-less) path of a selection move. */
function moveSelectionFlat(
  doc: Doc,
  selection: number[],
  dx: number,
  dy: number,
): { doc: Doc; selection: number[] } {
  const sub = doc.sub
  const bdx = dx * sub
  const bdy = dy * sub
  const bw = doc.cols * sub
  const bh = doc.rows * sub
  const sel = new Set(selection)
  const cells = doc.cells.slice()
  const cellObj = doc.cellObj!.slice()
  // snapshot the sources, blank them, then write the copies at the offset so
  // overlapping regions of the same move behave like paint-over
  const moved: [number, number, number][] = []
  for (let i = 0; i < cellObj.length; i++) {
    const o = cellObj[i]
    if (o > 0 && sel.has(o) && cells[i] > 0) {
      moved.push([i, cells[i], o])
      cells[i] = 0
      cellObj[i] = 0
    }
  }
  for (const [i, v, o] of moved) {
    const x = (i % bw) + bdx
    const y = Math.floor(i / bw) + bdy
    if (x < 0 || y < 0 || x >= bw || y >= bh) continue
    const t = y * bw + x
    cells[t] = v
    cellObj[t] = o
  }
  const links = doc.links
    .map((l) =>
      l.obj && sel.has(l.obj)
        ? { ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy }
        : l,
    )
    .filter((l) => linkInBounds(l, doc.cols, doc.rows))
  return compactElements({ ...doc, cells, cellObj, links }, selection)
}

/** The selection slice: element selection plus selection-scoped edits (undoable where noted). */
export interface SelectionSlice {
  /** Selected element ids (1-based); empty = no selection */
  selection: number[]
  // element selection (UI state; the styled edits themselves are undoable doc actions)
  selectElements: (ids: number[]) => void
  /** Drop the given ids from the selection (Shift/Alt deselect of groups and marquee hits) */
  removeFromSelection: (ids: number[]) => void
  clearSelection: () => void
  selectAllElements: () => void
  /** Restyle every selected element (undoable) */
  restyleSelection: (patch: ElementStylePatch) => void
  /** Erase all cells of the selected elements (undoable) */
  deleteSelection: () => void
  /** Move the selection by dx/dy pixel cells on the square grid (undoable) */
  moveSelection: (dx: number, dy: number) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Selection state and selection-scoped actions, composed into the main store. Kept apart so
 * editor.store.ts stays under the file-size ratchet.
 */
export function createSelectionSlice({ set }: SliceApi): SelectionSlice {
  return {
    selection: [],

    selectElements: (ids) => set({ selection: [...new Set(ids)].filter((id) => id > 0) }),
    removeFromSelection: (ids) =>
      set((s) => {
        const drop = new Set(ids)
        const next = s.selection.filter((id) => !drop.has(id))
        return next.length === s.selection.length ? s : { selection: next }
      }),
    clearSelection: () => set((s) => (s.selection.length > 0 ? { selection: [] } : s)),
    selectAllElements: () =>
      set((s) => {
        // scene path: every object of the tree (hidden ones included — they are in the panel)
        if (s.doc.layers) return { selection: allObjs(s.doc.layers).map((o) => o.id) }
        const ids = new Set<number>()
        if (s.doc.cellObj) {
          for (let i = 0; i < s.doc.cellObj.length; i++) {
            const o = s.doc.cellObj[i]
            if (o > 0) ids.add(o)
          }
        }
        for (const l of s.doc.links) if (l.obj) ids.add(l.obj)
        return { selection: [...ids] }
      }),
    restyleSelection: (patch) =>
      set((s) => {
        if (s.selection.length === 0) return s
        // scene path: patch the frozen style of each selected object
        if (s.doc.layers) {
          let layers = s.doc.layers
          for (const id of s.selection) {
            layers =
              updateNode(layers, id, (n) => {
                if (n.kind !== 'obj') return n
                const el = n.style
                return {
                  ...n,
                  style: {
                    style: patch.style
                      ? {
                          ...el.style,
                          ...patch.style,
                          corners: patch.style.corners ?? el.style.corners,
                        }
                      : el.style,
                    renderMode: patch.renderMode ?? el.renderMode,
                    connectivity: patch.connectivity ?? el.connectivity,
                    metaball: patch.metaball ? { ...el.metaball, ...patch.metaball } : el.metaball,
                    texture: patch.texture ? { ...el.texture, ...patch.texture } : el.texture,
                  },
                }
              }) ?? layers
          }
          return { doc: syncDoc({ ...s.doc, layers }) }
        }
        const sel = new Set(s.selection)
        const elements = s.doc.elements.map((el, i) => {
          if (!sel.has(i + 1)) return el
          return {
            style: patch.style
              ? { ...el.style, ...patch.style, corners: patch.style.corners ?? el.style.corners }
              : el.style,
            renderMode: patch.renderMode ?? el.renderMode,
            connectivity: patch.connectivity ?? el.connectivity,
            metaball: patch.metaball ? { ...el.metaball, ...patch.metaball } : el.metaball,
            texture: patch.texture ? { ...el.texture, ...patch.texture } : el.texture,
          }
        })
        return { doc: { ...s.doc, elements } }
      }),
    deleteSelection: () =>
      set((s) => {
        if (s.selection.length === 0) return s
        // scene path: remove the objects themselves (locked/hidden ones are skipped)
        if (s.doc.layers) {
          const removable = new Set(s.selection.filter((id) => !nodeProtected(s.doc.layers!, id)))
          if (removable.size === 0) return s
          const { layers } = removeObjs(s.doc.layers, removable)
          return { doc: syncDoc({ ...s.doc, layers }), selection: [] }
        }
        const sel = new Set(s.selection)
        let doc = s.doc
        if (doc.cellObj) {
          const cells = doc.cells.slice()
          const cellObj = doc.cellObj.slice()
          let changed = false
          for (let i = 0; i < cellObj.length; i++) {
            if (cellObj[i] > 0 && sel.has(cellObj[i])) {
              cellObj[i] = 0
              cells[i] = 0
              changed = true
            }
          }
          if (changed) doc = { ...doc, cells, cellObj }
        }
        if (doc.links.some((l) => l.obj && sel.has(l.obj))) {
          doc = { ...doc, links: doc.links.filter((l) => !(l.obj && sel.has(l.obj))) }
        }
        const c = compactElements(doc, [])
        return { doc: c.doc, selection: [] }
      }),
    moveSelection: (dx, dy) =>
      set((s) => {
        if ((dx === 0 && dy === 0) || s.selection.length === 0) return s
        const doc = s.doc
        if (doc.gridType !== 'square') return s
        if (doc.layers) {
          const next = moveSelectionScene(doc, s.selection, dx, dy)
          return next ? { doc: next } : s
        }
        if (!doc.cellObj) return s
        return moveSelectionFlat(doc, s.selection, dx, dy)
      }),
  }
}
