import {
  normalizeScene,
  templateScene,
  type SvgScene,
  type TemplateId,
} from '../engine/svgart/index.ts'
import { saveProject, type SvgArtProjectEntry } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

/** What the studio stage and panels have selected. */
export interface SvgArtSelection {
  layerId: string | null
  /** Index into the selected layer's fill stack. */
  fillIndex: number
}

/** The SVG-studio slice: runtime host of the open studio project (outside undo history). */
export interface SvgArtSlice {
  svgartScene: SvgScene
  svgartSelection: SvgArtSelection
  /** Immutable scene updater — the feature builds the next scene, the store just receives it. */
  updateSvgArtScene: (update: (scene: SvgScene) => SvgScene) => void
  selectSvgArtLayer: (layerId: string | null, fillIndex?: number) => void
  /** Replace the scene with a fresh template (also the creation-dialog entry point). */
  applySvgArtTemplate: (id: TemplateId) => void
  /** Restore the workspace from the opened project's authored scene */
  loadSvgArtEntry: (entry: SvgArtProjectEntry) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

const SAVE_THROTTLE_MS = 1500

/**
 * SVG-studio state and actions, composed into the main store — the gradient slice pattern. Every
 * change is written back into the bound `SvgArtProjectEntry` (throttled; scenes are small JSON).
 */
export function createSvgArtSlice({ set, get }: SliceApi): SvgArtSlice {
  let lastSave = 0
  const saveSoon = (): void => {
    const now = Date.now()
    if (now - lastSave < SAVE_THROTTLE_MS) return
    lastSave = now
    void saveCurrent(get())
  }
  return {
    svgartScene: templateScene('blank'),
    svgartSelection: { layerId: null, fillIndex: 0 },

    updateSvgArtScene: (update) => {
      set((s) => ({ svgartScene: update(s.svgartScene) }))
      saveSoon()
    },
    selectSvgArtLayer: (layerId, fillIndex = 0) => {
      set({ svgartSelection: { layerId, fillIndex } })
    },
    applySvgArtTemplate: (id) => {
      set({ svgartScene: templateScene(id), svgartSelection: { layerId: null, fillIndex: 0 } })
      saveSoon()
    },
    loadSvgArtEntry: (entry) => {
      set({
        svgartScene: normalizeScene(entry.scene),
        svgartSelection: { layerId: null, fillIndex: 0 },
      })
      lastSave = 0
      saveSoon()
    },
  }
}

/** Write the authored scene into the bound svgart project (also persists clearing it). */
async function saveCurrent(s: State): Promise<void> {
  const entry = s.boundEntry
  if (!entry || entry.kind !== 'svgart') return
  await saveProject({ ...entry, scene: s.svgartScene, updatedAt: Date.now() })
}
