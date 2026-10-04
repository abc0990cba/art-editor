import { updateNode, syncDoc } from '../engine/core/scene.ts'
import { emptyPath, type CurvePath } from '../engine/curves/index.ts'
import type { State } from './editor.store.ts'

/**
 * The pen tool's working draft: the Bézier path being drawn or edited plus which anchor is picked
 * for handle editing. Pure UI state — like the selection it lives outside the undo history; the
 * committed rasterization is what becomes an undoable object.
 */
export interface PenDraft {
  path: CurvePath
  /** Selected anchor index (handles render for it); null = no anchor picked */
  selected: number | null
  /**
   * When set, committing replaces this scene object instead of appending a new one — the re-edit
   * loop of a committed parametric `source.bezier` object.
   */
  replaceObjId: number | null
}

/** The pen slice: the current draft and its direct setters. */
export interface PenSlice {
  /** The path being drawn/edited; null = the pen has nothing on canvas */
  pen: PenDraft | null
  /** Start (or restart) a draft; init fields override the empty defaults */
  beginPen: (init?: Partial<PenDraft>) => void
  /** Patch the draft (path edits, selection, replace target) */
  patchPen: (patch: Partial<PenDraft>) => void
  /** Drop the draft without committing (Escape, tool switch away) */
  endPen: () => void
  /**
   * Commit a re-edited draft over its original object: cells and the `source.bezier` params are
   * swapped in place (one undoable step), the tree slot and the node's mod-chain stay untouched.
   */
  commitPenReplace: (
    paint: ReadonlyMap<number, number>,
    params: Record<string, number | string | boolean>,
  ) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Pen draft state, composed into the main store. Kept apart so editor.store.ts stays under the
 * file-size ratchet.
 */
export function createPenSlice({ set }: SliceApi): PenSlice {
  return {
    pen: null,

    beginPen: (init) =>
      set({
        pen: {
          path: init?.path ?? emptyPath(),
          selected: init?.selected ?? null,
          replaceObjId: init?.replaceObjId ?? null,
        },
      }),
    patchPen: (patch) => set((s) => (s.pen ? { pen: { ...s.pen, ...patch } } : s)),
    endPen: () => set({ pen: null }),
    commitPenReplace: (paint, params) =>
      set((s) => {
        const id = s.pen?.replaceObjId
        if (!id || !s.doc.layers) return s
        const layers = updateNode(s.doc.layers, id, (n) => {
          if (n.kind !== 'obj') return n
          return {
            ...n,
            cells: new Map(paint),
            graph: n.graph
              ? {
                  ...n.graph,
                  nodes: n.graph.nodes.map((nd) =>
                    nd.op === 'source.bezier' ? { ...nd, params: { ...params } } : nd,
                  ),
                }
              : n.graph,
          }
        })
        if (!layers) return s
        return { doc: syncDoc({ ...s.doc, layers }) }
      }),
  }
}
