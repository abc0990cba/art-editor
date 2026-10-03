import type { Doc, Link } from '../engine/core/doc.ts'
import { elementFromDoc, resolveColor } from '../engine/core/doc.ts'
import { nodeProtected, syncDoc, type SceneItem } from '../engine/core/scene.ts'
import type { State } from './editor.store.ts'
import {
  activeLayerOf,
  commitStroke,
  commitStrokeParametric,
  linkKey,
  resolveElement,
} from './store-internals.util.ts'

/** Remove links whose keys are listed from every object of an item list (immutable). */
function filterLinks(items: SceneItem[], removedKeys: ReadonlySet<string>): SceneItem[] {
  return items.map((item) => {
    if (item.kind === 'group') return { ...item, children: filterLinks(item.children, removedKeys) }
    if (item.links.length === 0 || !item.links.some((l) => removedKeys.has(linkKey(l)))) return item
    return { ...item, links: item.links.filter((l) => !removedKeys.has(linkKey(l))) }
  })
}

/**
 * Scene path of paintCells: erase entries steal cells back on the active layer, paint entries join
 * a fresh object appended on top of it (one stroke = one object).
 */
function paintCellsScene(
  doc: Doc,
  activeLayerId: number | null,
  cells: ReadonlyMap<number, number | null>,
  v: number,
  links: readonly Link[] | undefined,
): Doc | null {
  const erase = new Set<number>()
  const paint = new Map<number, number>()
  for (const [i, val] of cells) {
    if (val === null || v === 0) erase.add(i)
    else paint.set(i, v)
  }
  // staged connector edits: sync each object's links with the staged list
  let linksDiff: readonly Link[] = []
  if (links && doc.links.length !== links.length) {
    const kept = new Set(links.map(linkKey))
    const compositeKeys = new Set(doc.links.map(linkKey))
    const removed = doc.links.filter((l) => !kept.has(linkKey(l)))
    const added = links.filter((l) => !compositeKeys.has(linkKey(l)))
    let layers = doc.layers!
    if (removed.length > 0) {
      layers = layers.map((layer) => ({
        ...layer,
        children: filterLinks(layer.children, new Set(removed.map(linkKey))),
      }))
    }
    doc = { ...doc, layers }
    linksDiff = added.map((l) => ({ ...l, v }))
  }
  return commitStroke(doc, activeLayerId, erase, paint, linksDiff)
}

/** Flat (legacy, layer-less) path of paintCells: direct cell writes plus element attribution. */
function paintCellsFlat(
  doc: Doc,
  sourceDoc: Doc,
  cells: ReadonlyMap<number, number | null>,
  v: number,
  links: readonly Link[] | undefined,
): { doc: Doc } {
  const next = doc.cells.slice()
  for (const [i, val] of cells) next[i] = val === null ? 0 : v
  if (links) doc = { ...doc, links: [...links] }
  // element scope: painted cells join the frozen-style element of this stroke
  let cellObj = doc.cellObj
  if (doc.styleScope === 'element' && cells.size > 0 && v > 0) {
    const er = resolveElement(doc, elementFromDoc(sourceDoc))
    doc = er.doc
    cellObj = (cellObj ?? new Uint32Array(next.length)).slice()
    for (const [i, val] of cells) cellObj[i] = val === null ? 0 : er.id
    if (links && doc.links.some((l) => !l.obj)) {
      doc = { ...doc, links: doc.links.map((l) => (l.obj ? l : { ...l, obj: er.id })) }
    }
  } else if (doc.styleScope === 'element' && v === 0 && cellObj) {
    cellObj = cellObj.slice()
    for (const [i, val] of cells) if (val === null) cellObj[i] = 0
  }
  return { doc: { ...doc, cells: next, cellObj } }
}

/** The paint slice: brush-stroke commits and canvas wipe (undoable doc actions). */
export interface PaintSlice {
  paintCells: (
    cells: ReadonlyMap<number, number | null>,
    color: string,
    links?: readonly Link[],
  ) => void
  /**
   * Shape-tool commit with final per-cell palette values: the caller pre-resolves every color
   * (fill, pattern second color, stroke color) into `resolved`'s palette, so the staged preview and
   * the commit share one set of values. One undoable step; in element scope all written cells join
   * one frozen-style element.
   */
  paintCellsValues: (
    cells: ReadonlyMap<number, number>,
    resolved: Doc,
    /** Single-color shape → parametric source node params */
    parametric?: { op: string; params: Record<string, number | string | boolean> },
  ) => void
  clear: () => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Ink-committing actions of the pencil/eraser/shape tools, composed into the main store. Kept apart
 * so editor.store.ts stays under the file-size ratchet.
 */
export function createPaintSlice({ set, get }: SliceApi): PaintSlice {
  return {
    paintCells: (cells, color, links) =>
      set((s) => {
        if (color) get().pushRecent(color)
        let doc = s.doc
        let v = 0
        if (color) {
          const r = resolveColor(doc, color)
          doc = r.doc
          v = r.v
        }
        if (doc.layers) {
          const next = paintCellsScene(doc, s.activeLayerId, cells, v, links)
          return next ? { doc: next } : { doc }
        }
        return paintCellsFlat(doc, s.doc, cells, v, links)
      }),
    paintCellsValues: (cells, resolved, parametric) =>
      set((s) => {
        if (cells.size === 0) return s
        // scene path: the whole shape (fill + stroke) joins one fresh object
        if (s.doc.layers) {
          const doc = resolved
          const layer = activeLayerOf(doc, s.activeLayerId)
          if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return s
          const erase = new Set<number>()
          const paint = new Map<number, number>()
          for (const [i, val] of cells) {
            if (val > 0) paint.set(i, val)
            else erase.add(i)
          }
          const next = parametric
            ? commitStrokeParametric(doc, s.activeLayerId, paint, parametric)
            : commitStroke(doc, s.activeLayerId, erase, paint, [])
          return next ? { doc: next } : s
        }
        let doc = resolved
        const next = doc.cells.slice()
        for (const [i, val] of cells) next[i] = val
        // element scope: the whole shape (fill + stroke) joins one frozen-style element
        let cellObj = doc.cellObj
        if (doc.styleScope === 'element') {
          const er = resolveElement(doc, elementFromDoc(s.doc))
          doc = er.doc
          cellObj = (cellObj ?? new Uint32Array(next.length)).slice()
          for (const i of cells.keys()) cellObj[i] = er.id
        }
        return { doc: { ...doc, cells: next, cellObj } }
      }),
    clear: () =>
      set((s) => {
        // scene path: wipe the ink but keep the layer/group structure
        if (s.doc.layers) {
          const layers = s.doc.layers.map((l) => ({ ...l, children: [] }))
          return { doc: syncDoc({ ...s.doc, layers }), selection: [] }
        }
        return {
          doc: {
            ...s.doc,
            cells: new Uint16Array(s.doc.cells.length),
            cellObj: null,
            elements: [],
            links: [],
          },
          selection: [],
        }
      }),
  }
}
