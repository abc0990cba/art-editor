import { withStyleScope } from '../engine/core/doc.ts'
import { convertedGridDoc, resizedDoc, subbedDoc } from '../engine/core/scene.ts'
import {
  normalizePresetConfig,
  presetFromDoc,
  type EditorPreset,
  type PresetConfig,
} from '../engine/presets/index.ts'
import {
  deletePreset as deletePresetRow,
  listPresets,
  newPresetId,
  savePreset,
  sortPresets,
  type PresetEntry,
} from '../storage/presets.ts'
import { duplicateName, normalizeName } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

/** The presets slice: user preset library (built-ins come from engine/presets). */
export interface PresetsSlice {
  presets: PresetEntry[]
  presetsReady: boolean
  // preset library actions
  loadPresets: () => Promise<void>
  createPreset: (name: string) => Promise<PresetEntry>
  overwritePreset: (id: string) => Promise<void>
  renamePreset: (id: string, name: string) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  duplicatePreset: (src: { name: string; config: PresetConfig }) => Promise<PresetEntry>
  applyPreset: (preset: EditorPreset) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Preset-library state and actions, composed into the main store. Kept apart so editor.store.ts
 * stays under the file-size ratchet (same pattern as glyph.slice.ts).
 */
export function createPresetsSlice({ set, get }: SliceApi): PresetsSlice {
  return {
    presets: [],
    presetsReady: false,

    loadPresets: async () => {
      try {
        set({ presets: await listPresets(), presetsReady: true })
      } catch {
        set({ presetsReady: true })
      }
    },
    createPreset: async (name) => {
      const s = get()
      const entry: PresetEntry = {
        id: newPresetId(),
        name: normalizeName(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: presetFromDoc(s.doc, s.symmetry),
      }
      await savePreset(entry)
      set({ presets: sortPresets([entry, ...s.presets]) })
      return entry
    },
    overwritePreset: async (id) => {
      const existing = get().presets.find((p) => p.id === id)
      if (!existing) return
      const s = get()
      const updated: PresetEntry = {
        ...existing,
        config: presetFromDoc(s.doc, s.symmetry),
        updatedAt: Date.now(),
      }
      await savePreset(updated)
      set({ presets: sortPresets(get().presets.map((p) => (p.id === id ? updated : p))) })
    },
    renamePreset: async (id, name) => {
      const existing = get().presets.find((p) => p.id === id)
      if (!existing) return
      const updated: PresetEntry = {
        ...existing,
        name: normalizeName(name),
        updatedAt: Date.now(),
      }
      await savePreset(updated)
      set({ presets: sortPresets(get().presets.map((p) => (p.id === id ? updated : p))) })
    },
    deletePreset: async (id) => {
      await deletePresetRow(id)
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
    },
    duplicatePreset: async (src) => {
      const s = get()
      const copy: PresetEntry = {
        id: newPresetId(),
        name: duplicateName(
          src.name,
          s.presets.map((p) => p.name),
        ),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: normalizePresetConfig(src.config),
      }
      await savePreset(copy)
      set({ presets: sortPresets([copy, ...s.presets]) })
      return copy
    },
    applyPreset: (preset) =>
      set((s) => {
        const c = preset.config
        const even = c.gridType === 'radial' && c.radialEven
        let doc = s.doc
        const gridChanged =
          doc.gridType !== c.gridType ||
          doc.cols !== c.cols ||
          doc.rows !== c.rows ||
          (c.gridType === 'radial' && doc.radialEven !== even)
        if (gridChanged) {
          doc =
            c.gridType === 'square' && doc.gridType === 'square'
              ? resizedDoc(doc, c.cols, c.rows)
              : convertedGridDoc(doc, c.gridType, c.cols, c.rows, even)
        }
        if (doc.sub !== c.sub) doc = subbedDoc(doc, c.sub)
        // a preset carries the style scope too: materialize existing art before the
        // preset's drawing style takes over, so nothing visibly changes on the switch
        if (c.styleScope === 'global' || c.styleScope === 'element') {
          doc = withStyleScope(doc, c.styleScope)
        }
        doc = {
          ...doc,
          radialEven: even,
          gridRotation: c.gridRotation || undefined,
          palette: [...c.palette],
          style: { ...c.style, corners: { ...c.style.corners } },
          renderMode: c.renderMode,
          connectivity: c.connectivity,
          metaball: { ...c.metaball },
          texture: { ...c.texture },
          bg: c.bg,
          connectorWidth: c.connectorWidth,
        }
        return { doc, symmetry: { ...c.symmetry } }
      }),
  }
}
