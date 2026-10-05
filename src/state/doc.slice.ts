import type { Doc, GridType, SubDetail } from '../engine/core/doc.ts'
import { defaultDoc, elementFromDoc } from '../engine/core/doc.ts'
import { deserialize } from '../engine/core/project.ts'
import { mergeObjsByColor } from '../engine/core/scene-merge.ts'
import type { SceneLayer, SceneObj } from '../engine/core/scene.ts'
import {
  appendToLayer,
  convertedGridDoc,
  ensureScene,
  findNode,
  groupObjs,
  newLayer,
  newObj,
  nodeProtected,
  objIdsWithin,
  reorderNode as reorderNodeInTree,
  resizedDoc,
  subbedDoc,
  syncDoc,
  ungroupAround,
  updateNode,
} from '../engine/core/scene.ts'
import { isRepeat } from '../engine/effects/symmetry.ts'
import { colorRegions, type ImportResult } from '../engine/import/index.ts'
import type { Graph } from '../engine/nodes/index.ts'
import { fitGraphToCanvas } from '../engine/nodes/index.ts'
import { GRAPH_PRESETS } from '../engine/nodes/presets.ts'
import type { State } from './editor.store.ts'
import { activeLayerOf } from './store-internals.util.ts'
import type { ImportLayering } from './tools.slice.ts'

export const DOC_KEY = 'glyph.doc'

/** A brand-new project: 128×128 grid, fresh scene of one layer. */
function freshDoc(): Doc {
  return ensureScene(resizedDoc(defaultDoc(), 128, 128))
}

function initialDoc(): Doc {
  try {
    const raw = localStorage.getItem(DOC_KEY)
    if (raw) return ensureScene(deserialize(JSON.parse(raw)))
  } catch {
    /* corrupted autosave — start fresh */
  }
  return freshDoc()
}

/** The doc slice: document, grid conversions and scene-tree structure actions (undoable). */
export interface DocSlice {
  doc: Doc
  /** Id of the layer new ink goes to; null = the topmost layer */
  activeLayerId: number | null
  setSize: (cols: number, rows: number) => void
  setGridType: (gridType: GridType) => void
  /** Whole-grid rotation in degrees; geometry-only, the artwork stays in place */
  setGridRotation: (deg: number) => void
  /** Radial grid only: toggle ~equal cells per ring, resampling the artwork */
  setRadialEven: (even: boolean) => void
  setSub: (sub: SubDetail) => void
  loadDoc: (doc: Doc) => void
  newDoc: () => void
  /** Replace the canvas with converted photo pixels (square grid); one undoable step */
  importPixels: (r: ImportResult) => void
  // layers panel — structure actions mutate the doc's scene tree (undoable)
  setActiveLayer: (id: number | null) => void
  addLayer: () => void
  deleteLayer: (id: number) => void
  renameNode: (id: number, name: string) => void
  toggleNodeVisible: (id: number) => void
  toggleNodeLocked: (id: number) => void
  /** Move a node next to a target in tree order ('before' = below the target) */
  reorderNode: (dragId: number, targetId: number, place: 'before' | 'after') => void
  /** Wrap the selected objects into one group (same parent required) */
  groupSelection: () => void
  /** Dissolve the outermost groups containing the selected objects */
  ungroupSelection: () => void
  /** Unite same-color same-style objects of each layer into one object per color (undoable) */
  mergeSameColors: () => void
  /** Same-style objects on one layer merge into shared fields/silhouettes */
  setFuseObjects: (v: boolean) => void
  /** Attach, replace or remove the live node graph of one object (undoable) */
  setObjectGraph: (id: number, graph: Graph | null) => void
  /** Apply a named node-graph preset: to the selected object, or to a fresh one */
  applyGraphPreset: (presetId: string) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Stack a converted import into a scene tree according to the layering options: one layer per final
 * color (or a single layer), optionally one object per connected region, stacked by covered area or
 * strict palette order.
 */
function importSceneLayers(
  r: ImportResult,
  base: Doc,
  L: ImportLayering,
): { layers: SceneLayer[]; nextNodeId: number } {
  const bw = r.cols * base.sub
  const bh = r.rows * base.sub
  const byValue = new Map<number, number[]>()
  for (let i = 0; i < r.cells.length; i++) {
    const v = r.cells[i]
    if (v === 0) continue
    let bucket = byValue.get(v)
    if (!bucket) byValue.set(v, (bucket = []))
    bucket.push(i)
  }
  const style = elementFromDoc(base)
  let doc = base
  const buildObj = (v: number, idxs: number[]): SceneObj => {
    const cells = new Map<number, number>()
    for (const i of idxs) cells.set(i, v)
    const { obj, doc: next } = newObj(doc, style)
    obj.cells = cells
    doc = next
    return obj
  }
  const buildLayer = (name: string, children: SceneObj[]): SceneLayer => {
    const { layer, doc: next } = newLayer(doc, name)
    layer.children = children
    doc = next
    return layer
  }
  const layers: SceneLayer[] = []
  const ordered = [...byValue.entries()]
  if (L.layerOrder === 'area') ordered.sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
  else ordered.sort((a, b) => a[0] - b[0])
  if (L.splitByColor) {
    for (const [v, idxs] of ordered) {
      const regions = L.splitConnected
        ? [...(colorRegions(r.cells, bw, bh).get(v) ?? [])].sort((a, b) => b.length - a.length)
        : [idxs]
      layers.push(
        buildLayer(
          r.palette[v - 1] ?? '',
          regions.map((idxs2) => buildObj(v, idxs2)),
        ),
      )
    }
  } else {
    const children: SceneObj[] = []
    if (L.splitConnected) {
      // every connected region of any color becomes its own object
      const regions: { v: number; idxs: number[] }[] = []
      for (const [v, rs] of [...colorRegions(r.cells, bw, bh).entries()].sort(
        (a, b) => a[0] - b[0],
      )) {
        for (const idxs of rs) regions.push({ v, idxs })
      }
      regions.sort((a, b) => b.idxs.length - a.idxs.length)
      for (const { v, idxs } of regions) children.push(buildObj(v, idxs))
    } else {
      // even on a single layer the split stays per color, so one click still
      // selects all pixels of a color
      for (const [v, idxs] of ordered) children.push(buildObj(v, idxs))
    }
    layers.push(buildLayer('', children))
  }
  // fully transparent result: still leave one usable empty layer
  if (layers.length === 0) {
    const { layer, doc: next } = newLayer(doc)
    layer.children = []
    doc = next
    layers.push(layer)
  }
  return { layers, nextNodeId: doc.nextNodeId }
}

/**
 * Apply a named node-graph preset: to the single selected object, or to a fresh object on the
 * active layer. Returns the state untouched when the preset is not applicable.
 */
function applyGraphPresetToDoc(s: State, presetId: string): Partial<State> {
  if (!s.doc.layers) return s
  const preset = GRAPH_PRESETS.find((p) => p.id === presetId)
  if (!preset) return s
  // fresh deep copy per apply, rescaled from the preset's 16×16 design grid
  // to the current canvas so recipes always span the working area
  const graph = fitGraphToCanvas(
    JSON.parse(JSON.stringify(preset.graph)) as Graph,
    s.doc.cols * s.doc.sub,
    s.doc.rows * s.doc.sub,
  )
  const target = s.selection.length === 1 ? s.selection[0] : null
  const targetOk =
    target != null &&
    findNode(s.doc.layers, target) !== null &&
    findNode(s.doc.layers, target)!.item.kind === 'obj' &&
    !nodeProtected(s.doc.layers, target)
  if (targetOk) {
    const layers = updateNode(s.doc.layers, target, (n) => ({ ...n, graph }) as never)
    return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
  }
  // nothing selected (or the selection is a group): a fresh object carries the recipe
  const layer = activeLayerOf(s.doc, s.activeLayerId)
  if (!layer || nodeProtected(s.doc.layers, layer.id)) return s
  const er = newObj(s.doc, elementFromDoc(s.doc))
  er.obj.graph = graph
  return {
    doc: syncDoc({
      ...er.doc,
      layers: appendToLayer(er.doc.layers!, layer.id, er.obj),
    }),
    selection: [er.obj.id],
    activeLayerId: layer.id,
  }
}

/** The merge scope: the selection's objects (groups expand to members), or undefined = whole doc. */
function mergeScope(layers: SceneLayer[], selection: number[]): Set<number> | undefined {
  const scope = new Set<number>()
  for (const id of selection) {
    const ref = findNode(layers, id)
    if (!ref) continue
    if (ref.item.kind === 'obj') scope.add(id)
    else if (ref.item.kind === 'group') for (const oid of objIdsWithin(ref.item)) scope.add(oid)
  }
  return scope.size > 0 ? scope : undefined
}

/**
 * Document/grid/scene-structure state and actions, composed into the main store. Kept apart so
 * editor.store.ts stays under the file-size ratchet.
 */
export function createDocSlice({ set }: SliceApi): DocSlice {
  return {
    doc: initialDoc(),
    activeLayerId: null,

    setSize: (cols, rows) =>
      set((s) => ({
        doc:
          s.doc.gridType === 'square'
            ? resizedDoc(s.doc, cols, rows)
            : convertedGridDoc(s.doc, s.doc.gridType, cols, rows),
      })),
    setGridType: (gridType: GridType) =>
      set((s) => {
        // repeat/wallpaper modes are square-grid features: drop them when leaving square
        const symmetry =
          gridType !== 'square' && isRepeat(s.symmetry.mode)
            ? { ...s.symmetry, mode: 'none' as const }
            : s.symmetry
        return { doc: convertedGridDoc(s.doc, gridType), symmetry }
      }),
    setGridRotation: (deg: number) =>
      set((s) => {
        const gridRotation = ((Math.round(deg) % 360) + 360) % 360
        if ((s.doc.gridRotation ?? 0) === gridRotation) return {}
        return { doc: { ...s.doc, gridRotation } }
      }),
    setRadialEven: (even: boolean) =>
      set((s) => {
        if (s.doc.gridType !== 'radial' || s.doc.radialEven === even) return {}
        return {
          doc: convertedGridDoc(s.doc, s.doc.gridType, s.doc.cols, s.doc.rows, even),
        }
      }),
    setSub: (sub) => set((s) => ({ doc: subbedDoc(s.doc, sub) })),
    loadDoc: (doc) => set({ doc: ensureScene(doc) }),
    newDoc: () => set({ doc: freshDoc() }),
    importPixels: (r) =>
      set((s) => {
        // the import replaces all content, like clear(): connectors, objects and frozen
        // elements belong to the old artwork and must not survive it — only the grid
        // size carries over (r.cols/rows are pre-clamped by the conversion pipeline)
        const base: Doc = { ...s.doc, cols: r.cols, rows: r.rows }
        if (s.doc.layers) {
          const { layers, nextNodeId } = importSceneLayers(r, base, s.importLayering)
          return {
            doc: syncDoc({ ...base, palette: [...r.palette], links: [], layers, nextNodeId }),
            selection: [],
            activeLayerId: layers[layers.length - 1].id,
          }
        }
        const flat: Doc = {
          ...base,
          cells: r.cells,
          palette: [...r.palette],
          links: [],
          cellObj: null,
          elements: [],
          layers: null,
        }
        return {
          doc: flat,
          selection: [],
        }
      }),

    setActiveLayer: (id) => set({ activeLayerId: id }),
    addLayer: () =>
      set((s) => {
        if (!s.doc.layers) return s
        const { layer, doc } = newLayer(s.doc)
        // insert directly above the active layer (tree order: bottom → top)
        const idx = s.doc.layers.findIndex((l) => l.id === s.activeLayerId)
        const layers = [...s.doc.layers]
        layers.splice(idx === -1 ? layers.length : idx + 1, 0, layer)
        return { doc: syncDoc({ ...doc, layers }), activeLayerId: layer.id }
      }),
    deleteLayer: (id) =>
      set((s) => {
        if (!s.doc.layers || s.doc.layers.length <= 1) return s
        const idx = s.doc.layers.findIndex((l) => l.id === id)
        if (idx === -1) return s
        const layers = s.doc.layers.filter((l) => l.id !== id)
        const activeLayerId =
          s.activeLayerId === id
            ? (layers[Math.min(idx, layers.length - 1)]?.id ?? null)
            : s.activeLayerId
        return { doc: syncDoc({ ...s.doc, layers }), activeLayerId }
      }),
    renameNode: (id, name) =>
      set((s) => {
        if (!s.doc.layers) return s
        const layers = updateNode(s.doc.layers, id, (n) => ({ ...n, name }))
        return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
      }),
    toggleNodeVisible: (id) =>
      set((s) => {
        if (!s.doc.layers) return s
        const layers = updateNode(s.doc.layers, id, (n) => ({ ...n, visible: !n.visible }))
        return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
      }),
    toggleNodeLocked: (id) =>
      set((s) => {
        if (!s.doc.layers) return s
        const layers = updateNode(s.doc.layers, id, (n) => ({ ...n, locked: !n.locked }))
        return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
      }),
    reorderNode: (dragId, targetId, place) =>
      set((s) => {
        if (!s.doc.layers) return s
        const layers = reorderNodeInTree(s.doc.layers, dragId, targetId, place)
        return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
      }),
    groupSelection: () =>
      set((s) => {
        if (!s.doc.layers || s.selection.length === 0) return s
        const res = groupObjs(s.doc.layers, s.doc, new Set(s.selection))
        if (!res) return s
        return { doc: syncDoc({ ...s.doc, layers: res.layers }) }
      }),
    ungroupSelection: () =>
      set((s) => {
        if (!s.doc.layers || s.selection.length === 0) return s
        return {
          doc: syncDoc({ ...s.doc, layers: ungroupAround(s.doc.layers, new Set(s.selection)) }),
        }
      }),
    mergeSameColors: () =>
      set((s) => {
        if (!s.doc.layers) return s
        const res = mergeObjsByColor(s.doc.layers, mergeScope(s.doc.layers, s.selection))
        if (!res) return s
        return {
          doc: syncDoc({ ...s.doc, layers: res.layers }),
          selection: [...new Set(s.selection.map((id) => res.idMap.get(id) ?? id))],
        }
      }),
    setFuseObjects: (v) => set((s) => ({ doc: { ...s.doc, fuseObjects: v } })),
    setObjectGraph: (id, graph) =>
      set((s) => {
        if (!s.doc.layers) return s
        const layers = updateNode(s.doc.layers, id, (n) => {
          if (n.kind !== 'obj') return n
          if (!graph) {
            const { graph: _drop, ...rest } = n
            return rest
          }
          return { ...n, graph }
        })
        return layers ? { doc: syncDoc({ ...s.doc, layers }) } : s
      }),
    applyGraphPreset: (presetId) => set((s) => applyGraphPresetToDoc(s, presetId)),
  }
}
