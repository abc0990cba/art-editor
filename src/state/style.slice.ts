import type { PalettePreset } from '../engine/color/index.ts'
import type {
  Connectivity,
  ExtrudeSettings,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  StyleScope,
  TextureSettings,
} from '../engine/core/doc.ts'
import { withStyleScope } from '../engine/core/doc.ts'
import type { State } from './editor.store.ts'

/** The style slice: canvas-wide drawing style, background and palette (undoable doc edits). */
export interface StyleSlice {
  patchStyle: (patch: Partial<PixelStyle>) => void
  setRenderMode: (mode: RenderMode) => void
  setConnectivity: (c: Connectivity) => void
  patchMetaball: (patch: Partial<MetaballSettings>) => void
  patchTexture: (patch: Partial<TextureSettings>) => void
  patchExtrude: (patch: Partial<ExtrudeSettings>) => void
  /** Switch between per-element frozen styles and the global canvas-wide style */
  setStyleScope: (scope: StyleScope) => void
  setBg: (bg: string) => void
  setConnectorWidth: (w: number) => void
  applyPalette: (preset: PalettePreset) => void
  /** Replace the document palette with an arbitrary color list (palette import) */
  replacePalette: (colors: string[]) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Document style/background/palette actions, composed into the main store. Kept apart so
 * editor.store.ts stays under the file-size ratchet.
 */
export function createStyleSlice({ set }: SliceApi): StyleSlice {
  return {
    patchStyle: (patch) => set((s) => ({ doc: { ...s.doc, style: { ...s.doc.style, ...patch } } })),
    setRenderMode: (mode) => set((s) => ({ doc: { ...s.doc, renderMode: mode } })),
    setConnectivity: (connectivity) => set((s) => ({ doc: { ...s.doc, connectivity } })),
    patchMetaball: (patch) =>
      set((s) => ({ doc: { ...s.doc, metaball: { ...s.doc.metaball, ...patch } } })),
    patchTexture: (patch) =>
      set((s) => ({ doc: { ...s.doc, texture: { ...s.doc.texture, ...patch } } })),
    patchExtrude: (patch) =>
      set((s) => ({ doc: { ...s.doc, extrude: { ...s.doc.extrude, ...patch } } })),
    setStyleScope: (scope) =>
      set((s) => {
        const doc = withStyleScope(s.doc, scope)
        return doc === s.doc ? s : { doc, selection: [] }
      }),
    setBg: (bg) => set((s) => ({ doc: { ...s.doc, bg } })),
    setConnectorWidth: (w) => set((s) => ({ doc: { ...s.doc, connectorWidth: w } })),
    applyPalette: (preset) =>
      set((s) => ({
        doc: { ...s.doc, palette: [...new Set(preset.colors.map((c) => c.toLowerCase()))] },
      })),
    replacePalette: (colors) => set((s) => ({ doc: { ...s.doc, palette: [...colors] } })),
  }
}
