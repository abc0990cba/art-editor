import { isCellShapeId } from '../engine/cell-shapes/index.ts'
import { normalizeBrush } from '../engine/paint/brush.ts'
import type { Brush } from '../engine/paint/brush.ts'
import {
  deleteBrush as deleteBrushRow,
  listBrushes,
  newBrushId,
  saveBrush,
  sortBrushes,
  type BrushPresetEntry,
} from '../storage/brushes.ts'
import { normalizeName } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

/** The brushes slice: user brush preset library (built-ins come from engine/brush). */
export interface BrushesSlice {
  brushPresets: BrushPresetEntry[]
  brushesReady: boolean
  // brush preset library actions
  loadBrushes: () => Promise<void>
  createBrush: (name: string) => Promise<BrushPresetEntry>
  overwriteBrush: (id: string) => Promise<void>
  renameBrush: (id: string, name: string) => Promise<void>
  deleteBrushPreset: (id: string) => Promise<void>
  /** Make a preset the single current brush */
  applyBrushPreset: (id: string, brush: Brush) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Brush-library state and actions, composed into the main store. Kept apart so editor.store.ts
 * stays under the file-size ratchet (same pattern as glyph.slice.ts).
 */
export function createBrushesSlice({ set, get }: SliceApi): BrushesSlice {
  return {
    brushPresets: [],
    brushesReady: false,

    loadBrushes: async () => {
      try {
        set({ brushPresets: await listBrushes(), brushesReady: true })
      } catch {
        set({ brushesReady: true })
      }
    },
    createBrush: async (name) => {
      const s = get()
      const entry: BrushPresetEntry = {
        id: newBrushId(),
        name: normalizeName(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        brush: normalizeBrush(s.brush),
        color: s.color,
      }
      await saveBrush(entry)
      set({ brushPresets: sortBrushes([entry, ...s.brushPresets]) })
      return entry
    },
    overwriteBrush: async (id) => {
      const existing = get().brushPresets.find((b) => b.id === id)
      if (!existing) return
      const s = get()
      const updated: BrushPresetEntry = {
        ...existing,
        brush: normalizeBrush(s.brush),
        color: s.color,
        updatedAt: Date.now(),
      }
      await saveBrush(updated)
      set({
        brushPresets: sortBrushes(get().brushPresets.map((b) => (b.id === id ? updated : b))),
      })
    },
    renameBrush: async (id, name) => {
      const existing = get().brushPresets.find((b) => b.id === id)
      if (!existing) return
      const updated: BrushPresetEntry = {
        ...existing,
        name: normalizeName(name),
        updatedAt: Date.now(),
      }
      await saveBrush(updated)
      set({
        brushPresets: sortBrushes(get().brushPresets.map((b) => (b.id === id ? updated : b))),
      })
    },
    deleteBrushPreset: async (id) => {
      await deleteBrushRow(id)
      set((s) => ({ brushPresets: s.brushPresets.filter((b) => b.id !== id) }))
    },
    // picking a preset restores its tip, working color and cell form (a preset without a
    // form leaves the current pixel style alone)
    applyBrushPreset: (id, brush) =>
      set((s) => {
        const entry = s.brushPresets.find((b) => b.id === id)
        const shape = isCellShapeId(brush.shape) ? brush.shape : undefined
        return {
          brush: normalizeBrush(brush),
          brushId: id,
          ...(entry?.color ? { color: entry.color } : {}),
          ...(shape
            ? {
                doc: {
                  ...s.doc,
                  style: { ...s.doc.style, shape, shapeParams: { ...s.doc.style.shapeParams } },
                },
              }
            : {}),
        }
      }),
  }
}
