import { useSyncExternalStore } from 'react'
import { temporal, type ZundoOptions } from 'zundo'
import { create } from 'zustand'

import type { Brush } from '../engine/brush.ts'
import type {
  Connectivity,
  Doc,
  GridType,
  Link,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  StyleScope,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from '../engine/doc.ts'
import type { FillStyle } from '../engine/fillpatterns.ts'
import type { GlyphTileSet } from '../engine/glyph-tiles.ts'
import type { ImportResult } from '../engine/import-image.ts'
import type { PalettePreset } from '../engine/palettes.ts'
import type { EditorPreset, PresetConfig } from '../engine/presets.ts'
import type { BrushPresetEntry } from '../storage/brushes.ts'
import type { GlyphTileSetEntry } from '../storage/glyph-tiles.ts'
import type { PresetEntry } from '../storage/presets.ts'
import { createBrushesSlice } from './brushes.slice.ts'
import { createDocSlice, DOC_KEY } from './doc.slice.ts'
import { createFillSlice } from './fill.slice.ts'
import { createGlyphSlice } from './glyph.slice.ts'
import { createPaintSlice } from './paint.slice.ts'
import { createPresetsSlice } from './presets.slice.ts'
import { createProjectSlice } from './project.slice.ts'
import { createSelectionSlice, type ElementStylePatch } from './selection.slice.ts'
import { setupStoreEffects } from './store.effects.ts'
import { createStyleSlice } from './style.slice.ts'
import {
  createToolsSlice,
  type FillScope,
  type ImportLayering,
  type ShapePaint,
  type Tool,
  type ToolOpts,
} from './tools.slice.ts'
import { createUiSlice, type ResolvedTheme, type ThemePref } from './ui.slice.ts'

export type { Tool, ToolOpts } from './tools.slice.ts'
export type { ThemePref, ResolvedTheme } from './ui.slice.ts'
export { THEME_PREF_CYCLE, nextThemePref, resolvedTheme } from './ui.slice.ts'

export interface State {
  doc: Doc
  // UI state (outside undo history)
  tool: Tool
  /** Selected element ids (1-based); empty = no selection */
  selection: number[]
  /** Id of the layer new ink goes to; null = the topmost layer */
  activeLayerId: number | null
  color: string
  /** Active brush: pixel size (tip grid) + on/off tip pattern */
  brush: Brush
  /** Which brush preset is current (built-in or user id); null = tip edited by hand */
  brushId: string | null
  /** Snap brush stamps to the pixel-size grid (Alt stamps freely, centered on the cursor) */
  brushSnap: boolean
  symmetry: SymmetryState
  /** Radial grid only: what a fill click covers (cell / sector wedge / ring) */
  fillScope: FillScope
  /** Fill tool styling: solid color or a two-color pattern/dither fill */
  fillStyle: FillStyle
  /** Shape tools styling: interior fill + outline with placement, drawn as one object */
  shapePaint: ShapePaint
  showGrid: boolean
  /** On: picking a palette recolors the canvas; off: it only offers colors to paint with */
  paletteAutoApply: boolean
  /** Left tool rail is expanded (names shown); false = collapsed to icon-only strip */
  railOpen: boolean
  /** Right settings panel collapsed to a section-icon strip (desktop only) */
  panelCollapsed: boolean
  /** Quick-settings fab panel next to the tool rail is expanded (desktop only) */
  fabOpen: boolean
  /** Per-tool shape settings (star rays, gear teeth, rotation, …) */
  toolOpts: ToolOpts
  /**
   * Sample grid of the tool-settings preview, in cells; null = the automatic per-context size.
   * User-adjustable, clamped to the current canvas dimensions.
   */
  previewGrid: { cols: number; rows: number } | null
  /** How an imported image splits into layers/objects at commit time */
  importLayering: ImportLayering
  lang: 'en' | 'ru'
  themePref: ThemePref
  resolvedTheme: ResolvedTheme
  /** PNG export size in px; null = auto (canvas × 8, clamped) */
  pngWidth: number | null
  pngHeight: number | null
  exportBg: boolean
  recent: string[]
  /** Display name of the current project, shown in the top bar */
  projectName: string
  /** Id of the saved project currently open; null = unsaved work (Untitled) */
  projectId: string | null
  /**
   * True while the document holds changes not written to the projects library (or no project is
   * bound at all): the top-bar Save button is enabled exactly when this is true, Photoshop-style.
   */
  projectDirty: boolean
  /** The doc as it was last written to / loaded from the projects library */
  savedDoc: Doc | null
  /** Normalized radii of the concentric-circles / concentric-rects tools */
  concentricRadii: number[]
  // preset library (user presets; built-ins come from engine/presets)
  presets: PresetEntry[]
  presetsReady: boolean
  // brush preset library (user brushes; built-ins come from engine/brush)
  brushPresets: BrushPresetEntry[]
  brushesReady: boolean
  // glyph tile set library (user sets; built-ins come from engine/glyph-tiles)
  glyphSets: GlyphTileSetEntry[]
  glyphSetsReady: boolean
  /** The glyph set currently being edited in the right panel; null = a built-in/new */
  glyphDraft: GlyphTileSet
  glyphDraftId: string | null // library entry id; null = unsaved custom draft
  // actions on the document (undoable)
  setSize: (cols: number, rows: number) => void
  setGridType: (gridType: GridType) => void
  /** Radial grid only: toggle ~equal cells per ring, resampling the artwork */
  setRadialEven: (even: boolean) => void
  setSub: (sub: SubDetail) => void
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
  /** Flood-fill from every seed (symmetry copies of the clicked cell) */
  fillAt: (seeds: readonly number[], color: string) => void
  /** Paint a pre-computed region set (radial sector/ring scope) with the current fill style */
  paintFillRegion: (seeds: readonly number[], color: string) => void
  /** Re-fill every painted cell of the selected elements with the current fill style (undoable) */
  fillSelection: () => void
  addLink: (link: Link, color: string) => void
  /** Add several links at once (symmetry copies), as a single undoable change */
  addLinks: (links: readonly Link[], color: string) => void
  removeLinksNear: (px: number, py: number, radius: number) => void
  clear: () => void
  patchStyle: (patch: Partial<PixelStyle>) => void
  setRenderMode: (mode: RenderMode) => void
  setConnectivity: (c: Connectivity) => void
  patchMetaball: (patch: Partial<MetaballSettings>) => void
  patchTexture: (patch: Partial<TextureSettings>) => void
  /** Switch between per-element frozen styles and the global canvas-wide style */
  setStyleScope: (scope: StyleScope) => void
  // element selection (UI state; the styled edits themselves are undoable doc actions)
  selectElements: (ids: number[]) => void
  toggleSelection: (id: number) => void
  clearSelection: () => void
  selectAllElements: () => void
  /** Restyle every selected element (undoable) */
  restyleSelection: (patch: ElementStylePatch) => void
  /** Erase all cells of the selected elements (undoable) */
  deleteSelection: () => void
  /** Move the selection by dx/dy pixel cells on the square grid (undoable) */
  moveSelection: (dx: number, dy: number) => void
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
  /** Same-style objects on one layer merge into shared fields/silhouettes */
  setFuseObjects: (v: boolean) => void
  /** Attach, replace or remove the live node graph of one object (undoable) */
  setObjectGraph: (id: number, graph: import('../engine/nodes/index.ts').Graph | null) => void
  /** Apply a named node-graph preset: to the selected object, or to a fresh one */
  applyGraphPreset: (presetId: string) => void
  setBg: (bg: string) => void
  setConnectorWidth: (w: number) => void
  applyPalette: (preset: PalettePreset) => void
  /** Replace the document palette with an arbitrary color list (palette import) */
  replacePalette: (colors: string[]) => void
  loadDoc: (doc: Doc) => void
  newDoc: () => void
  /** Replace the canvas with converted photo pixels (square grid); one undoable step */
  importPixels: (r: ImportResult) => void
  // preset library actions
  loadPresets: () => Promise<void>
  createPreset: (name: string) => Promise<PresetEntry>
  overwritePreset: (id: string) => Promise<void>
  renamePreset: (id: string, name: string) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  duplicatePreset: (src: { name: string; config: PresetConfig }) => Promise<PresetEntry>
  applyPreset: (preset: EditorPreset) => void
  // brush preset library actions
  loadBrushes: () => Promise<void>
  createBrush: (name: string) => Promise<BrushPresetEntry>
  overwriteBrush: (id: string) => Promise<void>
  renameBrush: (id: string, name: string) => Promise<void>
  deleteBrushPreset: (id: string) => Promise<void>
  /** Make a preset the single current brush */
  applyBrushPreset: (id: string, brush: Brush) => void
  // glyph tile set library + editor
  loadGlyphSets: () => Promise<void>
  patchGlyphDraft: (patch: Partial<GlyphTileSet>) => void
  setGlyphDraftId: (id: string | null) => void
  saveGlyphDraft: (name: string) => Promise<void>
  overwriteGlyphDraft: (id: string) => Promise<void>
  renameGlyphSet: (id: string, name: string) => Promise<void>
  deleteGlyphSet: (id: string) => Promise<void>
  applyGlyphSet: (id: string | null, set: GlyphTileSet) => void
  // UI actions
  setTool: (tool: Tool) => void
  /**
   * Rename the current project (shown in the top bar, used in export file names); renames the open
   * saved project in the library too
   */
  setProjectName: (name: string) => void
  /** Bind the editor to a saved project (open/save); null detaches back to unsaved */
  setCurrentProject: (id: string | null, name: string) => void
  /** Photoshop-style Save: overwrite the bound project or create + bind a new one */
  saveToLibrary: () => Promise<void>
  /** Mark the current doc as matching the library entry (after open/save) */
  markProjectSaved: () => void
  /** Resize the radii list of the concentric tools (1..8 loops) */
  setConcentricCount: (n: number) => void
  /** Set one loop radius of the concentric tools */
  setConcentricRadius: (index: number, r: number) => void
  setColor: (color: string) => void
  patchBrush: (patch: Partial<Brush>) => void
  setBrushSnap: (v: boolean) => void
  patchSymmetry: (patch: Partial<SymmetryState>) => void
  setFillScope: (scope: FillScope) => void
  patchFillStyle: (patch: Partial<FillStyle>) => void
  patchShapePaint: (patch: Partial<ShapePaint>) => void
  setShowGrid: (v: boolean) => void
  setPaletteAutoApply: (v: boolean) => void
  toggleRail: () => void
  togglePanelCollapsed: () => void
  toggleFab: () => void
  patchToolOpts: (patch: Partial<ToolOpts>) => void
  /** Override the tool-settings preview grid; null returns to the automatic size */
  setPreviewGrid: (grid: { cols: number; rows: number } | null) => void
  /** Layer/object split and stacking of imported images */
  patchImportLayering: (patch: Partial<ImportLayering>) => void
  setLang: (lang: 'en' | 'ru') => void
  setThemePref: (pref: ThemePref) => void
  setPngWidth: (v: number | null) => void
  setPngHeight: (v: number | null) => void
  setExportBg: (v: boolean) => void
  pushRecent: (hex: string) => void
  /** Bumped to ask CanvasStage to zoom so the whole canvas is visible */
  requestFit: () => void
  fitSignal: number
  /** The dedicated node-editor space over the canvas area */
  nodeEditorOpen: boolean
  /**
   * How the node editor shares space with the canvas: `split` puts them side by side with a
   * draggable divider (live result feedback), `overlay` covers the canvas.
   */
  nodeEditorMode: 'split' | 'overlay'
  /** Editor width as a fraction of the canvas row (split mode, 0.25..0.8) */
  nodeEditorSplit: number
  openNodeEditor: () => void
  closeNodeEditor: () => void
  setNodeEditorMode: (mode: 'split' | 'overlay') => void
  setNodeEditorSplit: (fraction: number) => void
}

/** Whether an autosaved document exists in localStorage (fresh users see the start dialog). */
export function hasAutosave(): boolean {
  try {
    return Boolean(localStorage.getItem(DOC_KEY))
  } catch {
    return false
  }
}

/** Trailing throttle so slider drags collapse into one history entry. */
function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: A | undefined
  return (...args: A) => {
    lastArgs = args
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      if (lastArgs) fn(...lastArgs)
    }, ms)
  }
}

// Undo history stores whole cell buffers; cap the number of steps so huge
// canvases stay within a ~32 MB history budget (never fewer than 8 steps).
// zundo reads `limit` from this options object on every history push, so
// mutating it here changes the effective cap.
const temporalOptions: ZundoOptions<State, { doc: Doc }> = {
  // root-shaped slice: zundo restores via setState() merge, so the
  // partialized value must itself be shaped like the store root
  partialize: (s) => ({ doc: s.doc }),
  limit: 100,
  handleSet: (handleSet) => throttle(handleSet, 350),
}

/**
 * The single app store (zustand + zundo undo history), assembled from vertical slices — each
 * `src/state/*.slice.ts` owns its initial state + actions; this file owns the shared `State` type,
 * the undo-history wiring and the module-level side effects (see store.effects.ts).
 */
export const useStore = create<State>()(
  temporal(
    (set, get) => ({
      ...createUiSlice({ set, get }),
      ...createToolsSlice({ set, get }),
      ...createDocSlice({ set, get }),
      ...createStyleSlice({ set, get }),
      ...createPaintSlice({ set, get }),
      ...createFillSlice({ set, get }),
      ...createSelectionSlice({ set, get }),
      ...createProjectSlice({ set, get }),
      ...createPresetsSlice({ set, get }),
      ...createBrushesSlice({ set, get }),
      ...createGlyphSlice({ set, get }),
    }),
    temporalOptions,
  ),
)

setupStoreEffects(useStore, temporalOptions)

/** Undo/redo helpers plus reactive canUndo/canRedo flags. */
export const undo = () => useStore.temporal.getState().undo()
export const redo = () => useStore.temporal.getState().redo()

export function useCanUndoRedo(): { canUndo: boolean; canRedo: boolean } {
  const t = useStore.temporal
  const snapshot = useSyncExternalStore(
    (cb) => t.subscribe(cb),
    () => `${t.getState().pastStates.length}|${t.getState().futureStates.length}`,
  )
  const [past, future] = snapshot.split('|').map(Number)
  return { canUndo: past > 0, canRedo: future > 0 }
}

// Dev-only handle for browser-console debugging (no-op outside the browser).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
