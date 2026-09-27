import { normalizeTraceParams } from '../engine/trace/params.ts'
import { normalizeName } from '../storage/projects.ts'
import {
  deleteVectorPreset as deleteVectorPresetRow,
  listVectorPresets,
  newVectorPresetId,
  saveVectorPreset,
  sortVectorPresets,
  type VectorPresetEntry,
} from '../storage/vector-presets.ts'
import type { State } from './editor.store.ts'

/** The vector-presets slice: user trace presets (built-ins come from engine/trace/params). */
export interface VectorPresetsSlice {
  vectorPresets: VectorPresetEntry[]
  vectorPresetsReady: boolean
  loadVectorPresets: () => Promise<void>
  createVectorPreset: (name: string) => Promise<VectorPresetEntry>
  overwriteVectorPreset: (id: string) => Promise<void>
  deleteVectorPreset: (id: string) => Promise<void>
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/** User vector-preset library, composed into the main store (same pattern as presets.slice.ts). */
export function createVectorPresetsSlice({ set, get }: SliceApi): VectorPresetsSlice {
  return {
    vectorPresets: [],
    vectorPresetsReady: false,

    loadVectorPresets: async () => {
      try {
        set({ vectorPresets: await listVectorPresets(), vectorPresetsReady: true })
      } catch {
        set({ vectorPresetsReady: true })
      }
    },
    createVectorPreset: async (name) => {
      const entry: VectorPresetEntry = {
        id: newVectorPresetId(),
        name: normalizeName(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        params: normalizeTraceParams(get().vectorParams),
      }
      await saveVectorPreset(entry)
      set((s) => ({ vectorPresets: sortVectorPresets([entry, ...s.vectorPresets]) }))
      return entry
    },
    overwriteVectorPreset: async (id) => {
      const existing = get().vectorPresets.find((p) => p.id === id)
      if (!existing) return
      const updated: VectorPresetEntry = {
        ...existing,
        params: normalizeTraceParams(get().vectorParams),
        updatedAt: Date.now(),
      }
      await saveVectorPreset(updated)
      set((s) => ({
        vectorPresets: sortVectorPresets(s.vectorPresets.map((p) => (p.id === id ? updated : p))),
      }))
    },
    deleteVectorPreset: async (id) => {
      await deleteVectorPresetRow(id)
      set((s) => ({ vectorPresets: s.vectorPresets.filter((p) => p.id !== id) }))
    },
  }
}
