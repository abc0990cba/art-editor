import { useSyncExternalStore } from 'react'
import { temporal, type ZundoOptions } from 'zundo'
import { create } from 'zustand'

import { normalizeBrush, resizeBrush, squareBrush, type Brush } from '../engine/brush'
import type {
  Connectivity,
  Doc,
  ElementStyle,
  GridType,
  Link,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  StyleScope,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from '../engine/doc'
import {
  defaultDoc,
  elementFromDoc,
  resolveColor,
  sameElementStyle,
  withStyleScope,
} from '../engine/doc'
import {
  applyFillStyle,
  DEFAULT_FILL_STYLE,
  fillSelectionCells,
  patternCoord,
  type FillStyle,
} from '../engine/fillpatterns'
import { floodFillDoc, floodRegion } from '../engine/floodfill'
import { colorRegions } from '../engine/importImage'
import type { ImportResult } from '../engine/importImage'
import { fitGraphToCanvas, nodeDef, type GraphNode } from '../engine/nodes'
import { GRAPH_PRESETS } from '../engine/nodes/presets'
import type { PalettePreset } from '../engine/palettes'
import { clampPngSide, renderThumbnailDataURL } from '../engine/png'
import type { EditorPreset, PresetConfig } from '../engine/presets'
import { normalizePresetConfig, presetFromDoc } from '../engine/presets'
import { deserialize, serialize, type ProjectJSON } from '../engine/project'
import {
  allObjs,
  appendToLayer,
  convertedGridDoc,
  findNode,
  newObj,
  newLayer,
  nodeProtected,
  objLayer,
  pruneEmptyObjs,
  removeObjs,
  reorderNode as reorderNodeInTree,
  resizedDoc,
  ensureScene,
  stealCells,
  subbedDoc,
  syncDoc,
  translateObjCells,
  ungroupAround,
  updateNode,
  visibleObjs,
  groupObjs,
  type SceneItem,
  type SceneLayer,
  type SceneObj,
} from '../engine/scene'
import { isRepeat } from '../engine/symmetry'
import {
  deleteBrush as deleteBrushRow,
  listBrushes,
  newBrushId,
  saveBrush,
  sortBrushes,
  type BrushPresetEntry,
} from '../storage/brushes'
import {
  deletePreset as deletePresetRow,
  listPresets,
  newPresetId,
  savePreset,
  sortPresets,
  type PresetEntry,
} from '../storage/presets'
import {
  duplicateName,
  loadProject,
  newProjectId,
  normalizeName,
  saveProject,
} from '../storage/projects'

export type { SymmetryState }

export type Tool =
  | 'select'
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'connector'
  | 'star'
  | 'polygon'
  | 'diamond'
  | 'heart'
  | 'spiral'
  | 'arrow'
  | 'lightning'
  | 'moon'
  | 'wave'
  | 'cross'
  | 'flower'
  | 'gear'
  | 'sun'
  | 'bento'
  | 'zigzag'
  | 'ring'
  | 'arc'
  | 'drop'
  | 'chevron'
  | 'concentric'
  | 'concentricRect'
  | 'skull'

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

/**
 * Fill + stroke semantics of the shape tools (Illustrator-style): a drawn shape is one object whose
 * interior fill and brush outline move together via selection. `fill` 'pattern' reuses the fill
 * tool's current dither/pattern style; `strokeColor` may be any hex (resolved into the palette at
 * draw time).
 */
export interface ShapePaint {
  fill: 'none' | 'solid' | 'pattern'
  stroke: boolean
  /** Outline placement relative to the shape edge */
  align: 'inner' | 'center' | 'outer'
  strokeColor: string
}

export const DEFAULT_SHAPE_PAINT: ShapePaint = {
  fill: 'none',
  stroke: true,
  align: 'center',
  // empty = follow the current brush color, so fresh installs draw exactly like before
  strokeColor: '',
}

/** How importPixels stacks a converted image into the scene tree. */
export interface ImportLayering {
  /** One layer per distinct final color; off = everything lands on a single layer */
  splitByColor: boolean
  /** Every connected region of one color becomes its own object inside its layer */
  splitConnected: boolean
  /** Layer stacking: by covered area (largest at the bottom) or strict palette order */
  layerOrder: 'palette' | 'area'
}

export const DEFAULT_IMPORT_LAYERING: ImportLayering = {
  splitByColor: true,
  splitConnected: false,
  layerOrder: 'area',
}

/** Geometry knobs of the shape tools, edited via the rail's per-tool settings. */
export interface ToolOpts {
  starRays: number
  starInner: number
  starRotation: number
  polygonSides: number
  polygonRotation: number
  diamondRotation: number
  heartRotation: number
  spiralTurns: number
  spiralDir: number
  spiralRotation: number
  arrowHead: number
  arrowSpread: number
  lightningRotation: number
  moonThickness: number
  moonRotation: number
  wavePeriods: number
  waveAmplitude: number
  crossThickness: number
  crossRotation: number
  flowerPetals: number
  flowerRotation: number
  gearTeeth: number
  gearDepth: number
  gearRotation: number
  sunRays: number
  sunCore: number
  sunRayBase: number
  sunRayLength: number
  sunAlternate: number
  sunTaper: number
  sunWidth: number
  sunWave: number
  sunWavePeriods: number
  sunTwist: number
  sunRotation: number
  bentoCols: number
  bentoRows: number
  bentoGap: number
  bentoRadius: number
  bentoInset: number
  bentoChaos: number
  bentoMerge: number
  bentoSeed: number
  /** Corner rounding shared by rect/diamond/polygon/star, 0..0.5 */
  shapeCorner: number
  /** Side curvature shared by rect/diamond: negative = pinched, positive = bowed */
  shapeBulge: number
  /** Superellipse exponent for the ellipse tool: <2 pinched, 2 = ellipse, >2 squircle */
  ellipsePower: number
  /** Hole radius of the ring tool as a fraction of the outer radius */
  ringThickness: number
  /* --- skull --- */
  skullCraniumWidth: number
  skullCraniumHeight: number
  skullCrown: 'round' | 'flat'
  skullBrowRidge: number
  skullCheekWidth: number
  skullJawWidth: number
  skullJawHeight: number
  skullMandible: boolean
  skullEyeSize: number
  skullEyeSpacing: number
  skullEyeY: number
  skullEyeShape: 'round' | 'oval' | 'square' | 'angled'
  skullEyeTilt: number
  skullEyeAsym: number
  skullNoseWidth: number
  skullNoseHeight: number
  skullNoseY: number
  skullNoseShape: 'triangle' | 'heart' | 'teardrop' | 'slit'
  skullTeethCount: number
  skullTeethLen: number
  skullTeethGap: number
  skullTeethShape: 'rect' | 'rounded' | 'pointed' | 'fangs'
  skullMouthY: number
}

const DEFAULT_TOOL_OPTS: ToolOpts = {
  starRays: 5,
  starInner: 0.42,
  starRotation: 0,
  polygonSides: 6,
  polygonRotation: 0,
  diamondRotation: 0,
  heartRotation: 0,
  spiralTurns: 2.75,
  spiralDir: 1,
  spiralRotation: 0,
  arrowHead: 0.35,
  arrowSpread: 0.6,
  lightningRotation: 0,
  moonThickness: 0.293,
  moonRotation: 0,
  wavePeriods: 3,
  waveAmplitude: 0.15,
  crossThickness: 1 / 3,
  crossRotation: 0,
  flowerPetals: 5,
  flowerRotation: 0,
  gearTeeth: 8,
  gearDepth: 0.14,
  gearRotation: 0,
  sunRays: 12,
  sunCore: 0.18,
  sunRayBase: 0.22,
  sunRayLength: 1,
  sunAlternate: 1,
  sunTaper: 0,
  sunWidth: 0.55,
  sunWave: 0,
  sunWavePeriods: 2,
  sunTwist: 0,
  sunRotation: 0,
  bentoCols: 3,
  bentoRows: 3,
  bentoGap: 0.08,
  bentoRadius: 0.15,
  bentoInset: 0,
  bentoChaos: 0,
  bentoMerge: 0,
  bentoSeed: 1,
  shapeCorner: 0,
  shapeBulge: 0,
  ellipsePower: 2,
  ringThickness: 0.25,
  skullCraniumWidth: 1,
  skullCraniumHeight: 0.6,
  skullCrown: 'round',
  skullBrowRidge: 0.03,
  skullCheekWidth: 0.92,
  skullJawWidth: 0.72,
  skullJawHeight: 0.22,
  skullMandible: true,
  skullEyeSize: 0.16,
  skullEyeSpacing: 0.26,
  skullEyeY: 0.48,
  skullEyeShape: 'round',
  skullEyeTilt: 0,
  skullEyeAsym: 0,
  skullNoseWidth: 0.09,
  skullNoseHeight: 0.11,
  skullNoseY: 0.63,
  skullNoseShape: 'triangle',
  skullTeethCount: 8,
  skullTeethLen: 0.08,
  skullTeethGap: 0.35,
  skullTeethShape: 'rect',
  skullMouthY: 0.82,
}

/** What one fill click covers on a radial grid: a cell, the whole sector wedge or the ring. */
export type FillScope = 'cell' | 'sector' | 'ring'

interface State {
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
  /** Left tool rail is expanded (names shown); false = collapsed to icon-only strip */
  railOpen: boolean
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
  resolvedTheme: 'dark' | 'light'
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
  setObjectGraph: (id: number, graph: import('../engine/nodes').Graph | null) => void
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
  toggleRail: () => void
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

const DOC_KEY = 'glyph.doc'
const LANG_KEY = 'glyph.lang'
const THEME_KEY = 'glyph.theme'
const RECENT_KEY = 'glyph.recent'
const PROJECT_NAME_KEY = 'glyph.projectName'
const PROJECT_ID_KEY = 'glyph.projectId'
const RAIL_KEY = 'glyph.rail'

export type ThemePref = 'dark' | 'light' | 'auto'

function initialThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'dark' || v === 'light' || v === 'auto') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

/** Whether an autosaved document exists in localStorage (fresh users see the start dialog). */
export function hasAutosave(): boolean {
  try {
    return !!localStorage.getItem(DOC_KEY)
  } catch {
    return false
  }
}

export function resolvedTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'auto') return pref
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

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

function initialProjectName(): string {
  try {
    const raw = localStorage.getItem(PROJECT_NAME_KEY)
    if (typeof raw === 'string') return raw
  } catch {
    /* ignore */
  }
  return ''
}

function initialProjectId(): string | null {
  try {
    const raw = localStorage.getItem(PROJECT_ID_KEY)
    return raw ?? null
  } catch {
    /* ignore */
  }
  return null
}

function initialRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (Array.isArray(arr)) return arr.filter((c) => typeof c === 'string')
  } catch {
    /* ignore */
  }
  return []
}

function initialLang(): 'en' | 'ru' {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'ru' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return 'ru'
}

function initialRailOpen(): boolean {
  try {
    const v = localStorage.getItem(RAIL_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return true
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

/** Resolve (or lazily append) the element id matching a snapshot of the drawing style. */
function resolveElement(doc: Doc, snapshot: ElementStyle): { doc: Doc; id: number } {
  const existing = doc.elements.findIndex((el) => sameElementStyle(el, snapshot))
  if (existing >= 0) return { doc, id: existing + 1 }
  return { doc: { ...doc, elements: [...doc.elements, snapshot] }, id: doc.elements.length + 1 }
}

/** Fresh id for a graph node (unique within its graph). */
const genNodeId = () => `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

/** The position node auto-attached to every drawn object: dx/dy editable in the node editor. */
function offsetGraphNodes(): GraphNode[] {
  return [{ id: genNodeId(), op: 'mod.offset', params: { dx: 0, dy: 0 } }]
}

/** The layer new ink goes to; repairs a stale id (after undo or layer deletion). */
function activeLayerOf(doc: Doc, activeLayerId: number | null): SceneLayer | null {
  if (!doc.layers || doc.layers.length === 0) return null
  if (activeLayerId != null) {
    const found = doc.layers.find((l) => l.id === activeLayerId)
    if (found) return found
  }
  // no explicit choice (fresh boot, stale id): the topmost VISIBLE unlocked layer,
  // matching CanvasStage's activeLayerState — never a hidden layer
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    if (doc.layers[i].visible && !doc.layers[i].locked) return doc.layers[i]
  }
  return doc.layers[doc.layers.length - 1]
}

/** Order-independent key of a connector (endpoints may come in either way). */
function linkKey(l: Link): string {
  const a = `${l.ax},${l.ay}`
  const b = `${l.bx},${l.by}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Remove links whose keys are listed from every object of an item list (immutable). */
function filterLinks(items: SceneItem[], removedKeys: ReadonlySet<string>): SceneItem[] {
  return items.map((item) => {
    if (item.kind === 'group') return { ...item, children: filterLinks(item.children, removedKeys) }
    if (item.links.length === 0 || !item.links.some((l) => removedKeys.has(linkKey(l)))) return item
    return { ...item, links: item.links.filter((l) => !removedKeys.has(linkKey(l))) }
  })
}

/**
 * Scene-path paint commit shared by paintCells / paintCellsValues / fills: erase entries steal
 * cells back on the active layer, paint entries join a fresh object appended on top (one stroke =
 * one object — interrupted lines stay separately selectable).
 */
function commitStroke(
  doc: Doc,
  activeLayerId: number | null,
  erase: ReadonlySet<number>,
  paint: ReadonlyMap<number, number>,
  extraLinks: readonly Link[],
): Doc | null {
  const layer = activeLayerOf(doc, activeLayerId)
  // a hidden or locked layer is not a paint target
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  let layers = doc.layers!
  if (erase.size > 0) layers = stealCells(layers, layer.id, erase)
  const er = newObj(doc, elementFromDoc(doc))
  for (const [i, v] of paint) er.obj.cells.set(i, v)
  // every drawn object gets a live graph: the position node makes dx/dy editable
  // in the node editor right away
  er.obj.graph = { graphVersion: 1, nodes: offsetGraphNodes() }
  if (paint.size > 0 || extraLinks.length > 0) {
    er.obj.links.push(...extraLinks)
    layers = stealCells(layers, layer.id, new Set(paint.keys()))
    layers = appendToLayer(layers, layer.id, er.obj)
  }
  layers = pruneEmptyObjs(layers, new Set([er.obj.id])).layers
  return syncDoc({ ...er.doc, layers })
}

/**
 * Shape-tool commit as a parametric source graph: the node regenerates the ink from its parameters,
 * so geometry edits in the node editor move the shape on the canvas.
 */
function commitStrokeParametric(
  doc: Doc,
  activeLayerId: number | null,
  paint: ReadonlyMap<number, number>,
  parametric: { op: string; params: Record<string, number | string | boolean> },
): Doc | null {
  const layer = activeLayerOf(doc, activeLayerId)
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  let layers = doc.layers!
  const er = newObj(doc, elementFromDoc(doc))
  for (const [i, v] of paint) er.obj.cells.set(i, v)
  er.obj.graph = {
    graphVersion: 1,
    nodes: [{ id: genNodeId(), op: parametric.op, params: { ...parametric.params } }],
  }
  layers = stealCells(layers, layer.id, new Set(paint.keys()))
  layers = appendToLayer(layers, layer.id, er.obj)
  return syncDoc({ ...er.doc, layers })
}

// Renaming via the top-bar input lands in the projects library as a debounced
// background write, so typing never floods IndexedDB. updatedAt is left alone:
// a rename is metadata, not a content save, and must not reorder the library.
let renameTimer: ReturnType<typeof setTimeout> | undefined
function scheduleProjectRename(id: string, name: string): void {
  clearTimeout(renameTimer)
  renameTimer = setTimeout(() => {
    void loadProject(id)
      .then((entry) => {
        const trimmed = name.trim()
        // empty mid-edit text keeps the last good name; Save applies the fallback
        if (!entry || !trimmed || entry.name === trimmed) return
        return saveProject({ ...entry, name: trimmed })
      })
      .catch(() => {
        /* storage unavailable — the name still lives in the top bar */
      })
  }, 400)
}

/** In element scope, attribute every cell a fill changed to the current frozen-style element. */
function attributeFill(
  base: Doc,
  doc: Doc,
  prev: Uint16Array,
  cells: Uint16Array,
): { doc: Doc; cellObj: Uint32Array | null } {
  if (doc.styleScope !== 'element') return { doc, cellObj: doc.cellObj }
  const er = resolveElement(doc, elementFromDoc(base))
  const cellObj = (doc.cellObj ?? new Uint32Array(cells.length)).slice()
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== prev[i]) cellObj[i] = cells[i] === 0 ? 0 : er.id
  }
  return { doc: er.doc, cellObj }
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

export const useStore = create<State>()(
  temporal(
    (set, get) => ({
      doc: initialDoc(),
      tool: 'pencil',
      selection: [],
      activeLayerId: null,
      color: '#e63946',
      brush: squareBrush(1),
      brushId: 'px1',
      brushSnap: true,
      symmetry: { mode: 'none', n: 8, cell: 16, showGuides: true, fill: 100, phase: 0, twist: 0 },
      fillScope: 'cell',
      fillStyle: { ...DEFAULT_FILL_STYLE },
      shapePaint: { ...DEFAULT_SHAPE_PAINT },
      showGrid: true,
      railOpen: initialRailOpen(),
      toolOpts: { ...DEFAULT_TOOL_OPTS },
      previewGrid: null,
      importLayering: { ...DEFAULT_IMPORT_LAYERING },
      lang: initialLang(),
      themePref: initialThemePref(),
      resolvedTheme: resolvedTheme(initialThemePref()),
      pngWidth: null,
      pngHeight: null,
      exportBg: true,
      recent: initialRecent(),
      projectName: initialProjectName(),
      projectId: initialProjectId(),
      projectDirty: true,
      savedDoc: null,
      concentricRadii: [1, 0.66, 0.33],
      presets: [],
      presetsReady: false,
      brushPresets: [],
      brushesReady: false,
      fitSignal: 0,

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
      setRadialEven: (even: boolean) =>
        set((s) => {
          if (s.doc.gridType !== 'radial' || s.doc.radialEven === even) return {}
          return {
            doc: convertedGridDoc(s.doc, s.doc.gridType, s.doc.cols, s.doc.rows, even),
          }
        }),
      setSub: (sub) => set((s) => ({ doc: subbedDoc(s.doc, sub) })),
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
          // scene path: erase steals cells back on the active layer, paint joins a fresh
          // object appended on top of it (one stroke = one object)
          if (doc.layers) {
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
              let layers = doc.layers
              if (removed.length > 0) {
                layers = doc.layers.map((layer) => ({
                  ...layer,
                  children: filterLinks(layer.children, new Set(removed.map(linkKey))),
                }))
              }
              doc = { ...doc, layers }
              linksDiff = added.map((l) => ({ ...l, v }))
            }
            const next = commitStroke(doc, s.activeLayerId, erase, paint, linksDiff)
            return next ? { doc: next } : { doc }
          }
          const next = doc.cells.slice()
          for (const [i, val] of cells) next[i] = val === null ? 0 : v
          if (links) doc = { ...doc, links: [...links] }
          // element scope: painted cells join the frozen-style element of this stroke
          let cellObj = doc.cellObj
          if (doc.styleScope === 'element' && cells.size > 0 && v > 0) {
            const er = resolveElement(doc, elementFromDoc(s.doc))
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
        }),
      paintCellsValues: (cells, resolved, parametric) =>
        set((s) => {
          if (cells.size === 0) return s
          // scene path: the whole shape (fill + stroke) joins one fresh object
          if (s.doc.layers) {
            let doc = resolved
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
      fillAt: (seeds, color) =>
        set((s) => {
          if (color) get().pushRecent(color)
          const style = s.fillStyle
          const rA = resolveColor(s.doc, color)
          // pattern fills need the second color in the palette too
          const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
          let doc = rB.doc
          // scene path: flood over the ACTIVE LAYER's own ink only — the fill must not
          // leak through pixels that belong to other layers; result joins a fresh object
          if (doc.layers) {
            const layer = activeLayerOf(doc, s.activeLayerId)
            if (
              !layer ||
              !layer.visible ||
              nodeProtected(doc.layers, layer.id) ||
              seeds.length === 0
            )
              return s
            const layerCells = new Uint16Array(doc.cells.length)
            for (const o of visibleObjs(layer)) {
              for (const [i, v] of o.cells) layerCells[i] = v
            }
            const layerDoc = { ...doc, cells: layerCells }
            const paint = new Map<number, number>()
            if (style.mode === 'pattern') {
              const coordOf = patternCoord(doc)
              for (const idx of seeds) {
                const region = floodRegion(layerDoc, idx)
                if (region.length === 0) continue
                for (const [i, pick] of applyFillStyle(style, region, idx, coordOf)) {
                  paint.set(i, pick === 1 ? rB.v : rA.v)
                }
              }
            } else {
              for (const idx of seeds) {
                const filled = floodFillDoc(layerDoc, idx, rA.v)
                for (let i = 0; i < filled.length; i++) {
                  if (filled[i] !== layerCells[i]) paint.set(i, filled[i])
                }
              }
            }
            if (paint.size === 0) return s
            const erase = new Set<number>()
            for (const [i, v] of paint)
              if (v === 0) {
                erase.add(i)
                paint.delete(i)
              }
            const next = commitStroke(doc, s.activeLayerId, erase, paint, [])
            return next ? { doc: next } : s
          }
          let cells = s.doc.cells
          if (style.mode === 'pattern') {
            const coordOf = patternCoord(doc)
            for (const idx of seeds) {
              const region = floodRegion({ ...doc, cells }, idx)
              if (region.length === 0) continue
              const next = cells.slice()
              let changed = false
              for (const [i, pick] of applyFillStyle(style, region, idx, coordOf)) {
                const v = pick === 1 ? rB.v : rA.v
                if (next[i] !== v) {
                  next[i] = v
                  changed = true
                }
              }
              if (changed) cells = next
            }
          } else {
            for (const idx of seeds) cells = floodFillDoc({ ...doc, cells }, idx, rA.v)
          }
          if (cells === s.doc.cells) return s
          const attr = attributeFill(s.doc, doc, s.doc.cells, cells)
          return { doc: { ...attr.doc, cells, cellObj: attr.cellObj } }
        }),
      paintFillRegion: (seeds, color) =>
        set((s) => {
          if (color) get().pushRecent(color)
          if (seeds.length === 0) return s
          const style = s.fillStyle
          const rA = resolveColor(s.doc, color)
          const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
          const doc = rB.doc
          // scene path: the whole seed set joins a fresh object on the active layer
          if (doc.layers) {
            const layer = activeLayerOf(doc, s.activeLayerId)
            if (!layer || !layer.visible || nodeProtected(doc.layers, layer.id)) return s
            const paint = new Map<number, number>()
            if (style.mode === 'pattern') {
              // the whole seed set is one region, so the transition spans it as a whole
              for (const [i, pick] of applyFillStyle(style, seeds, seeds[0], patternCoord(doc))) {
                paint.set(i, pick === 1 ? rB.v : rA.v)
              }
            } else {
              for (const i of seeds) paint.set(i, rA.v)
            }
            const erase = new Set<number>()
            for (const [i, v] of paint)
              if (v === 0) {
                erase.add(i)
                paint.delete(i)
              }
            const next = commitStroke(doc, s.activeLayerId, erase, paint, [])
            return next ? { doc: next } : s
          }
          const cells = s.doc.cells.slice()
          if (style.mode === 'pattern') {
            // the whole seed set is one region, so the transition spans it as a whole
            for (const [i, pick] of applyFillStyle(style, seeds, seeds[0], patternCoord(doc))) {
              cells[i] = pick === 1 ? rB.v : rA.v
            }
          } else {
            for (const i of seeds) cells[i] = rA.v
          }
          const attr = attributeFill(s.doc, doc, s.doc.cells, cells)
          return { doc: { ...attr.doc, cells, cellObj: attr.cellObj } }
        }),
      fillSelection: () =>
        set((s) => {
          if (s.selection.length === 0) return s
          const res = fillSelectionCells(s.doc, s.selection, s.fillStyle, s.color)
          if (!res) return s
          get().pushRecent(s.color)
          // scene path: propagate the value changes to each cell's owning object
          if (s.doc.layers) {
            let layers = s.doc.layers
            for (let i = 0; i < res.cells.length; i++) {
              if (res.cells[i] === s.doc.cells[i]) continue
              const owner = s.doc.cellObj?.[i] ?? 0
              if (owner === 0) continue
              const v = res.cells[i]
              layers =
                updateNode(layers, owner, (n) => {
                  if (n.kind !== 'obj') return n
                  const cells = new Map(n.cells)
                  if (v > 0) cells.set(i, v)
                  else cells.delete(i)
                  return { ...n, cells }
                }) ?? layers
            }
            return { doc: syncDoc({ ...s.doc, layers, palette: res.palette }) }
          }
          return { doc: { ...s.doc, cells: res.cells, palette: res.palette } }
        }),
      addLink: (link, color) => get().addLinks([link], color),
      addLinks: (links, color) =>
        set((s) => {
          if (color) get().pushRecent(color)
          const r = resolveColor(s.doc, color)
          let doc = r.doc
          // scene path: the whole connector set (a click + its symmetry copies) joins
          // one fresh object on the active layer
          if (doc.layers) {
            const layer = activeLayerOf(doc, s.activeLayerId)
            if (!layer || !layer.visible || nodeProtected(doc.layers, layer.id)) return s
            const existing = new Set(allObjs(doc.layers).flatMap((o) => o.links.map(linkKey)))
            const fresh: Link[] = []
            for (const link of links) {
              if (!existing.has(linkKey(link))) {
                existing.add(linkKey(link))
                fresh.push({ ...link, v: r.v })
              }
            }
            if (fresh.length === 0) return s
            const er = newObj(doc, elementFromDoc(s.doc))
            er.obj.links.push(...fresh)
            return {
              doc: syncDoc({ ...er.doc, layers: appendToLayer(er.doc.layers!, layer.id, er.obj) }),
            }
          }
          let obj: number | undefined
          if (doc.styleScope === 'element') {
            const er = resolveElement(doc, elementFromDoc(s.doc))
            doc = er.doc
            obj = er.id
          }
          const next = [...doc.links]
          let changed = false
          for (const link of links) {
            const exists = next.some(
              (l) =>
                (l.ax === link.ax && l.ay === link.ay && l.bx === link.bx && l.by === link.by) ||
                (l.ax === link.bx && l.ay === link.by && l.bx === link.ax && l.by === link.ay),
            )
            if (!exists) {
              next.push(obj ? { ...link, v: r.v, obj } : { ...link, v: r.v })
              changed = true
            }
          }
          return changed ? { doc: { ...doc, links: next } } : { doc }
        }),
      removeLinksNear: (px, py, radius) =>
        set((s) => {
          const r2 = radius * radius
          const keep = (l: Link): boolean => {
            const cx = (l.ax + l.bx + 1) / 2
            const cy = (l.ay + l.by + 1) / 2
            const dx = cx - (px + 0.5)
            const dy = cy - (py + 0.5)
            return dx * dx + dy * dy > r2
          }
          // scene path: prune each object's own connectors
          if (s.doc.layers) {
            let layers = s.doc.layers
            for (const o of allObjs(layers)) {
              if (!o.links.some((l) => !keep(l))) continue
              layers =
                updateNode(layers, o.id, (n) =>
                  n.kind === 'obj' ? { ...n, links: n.links.filter(keep) } : n,
                ) ?? layers
            }
            const pruned = pruneEmptyObjs(layers)
            return { doc: syncDoc({ ...s.doc, layers: pruned.layers }) }
          }
          const links = s.doc.links.filter(keep)
          if (links.length === s.doc.links.length) return s
          return { doc: { ...s.doc, links } }
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
      patchStyle: (patch) =>
        set((s) => ({ doc: { ...s.doc, style: { ...s.doc.style, ...patch } } })),
      setRenderMode: (mode) => set((s) => ({ doc: { ...s.doc, renderMode: mode } })),
      setConnectivity: (connectivity) => set((s) => ({ doc: { ...s.doc, connectivity } })),
      patchMetaball: (patch) =>
        set((s) => ({ doc: { ...s.doc, metaball: { ...s.doc.metaball, ...patch } } })),
      patchTexture: (patch) =>
        set((s) => ({ doc: { ...s.doc, texture: { ...s.doc.texture, ...patch } } })),
      setStyleScope: (scope) =>
        set((s) => {
          const doc = withStyleScope(s.doc, scope)
          return doc === s.doc ? s : { doc, selection: [] }
        }),

      selectElements: (ids) => set({ selection: [...new Set(ids)].filter((id) => id > 0) }),
      toggleSelection: (id) =>
        set((s) => ({
          selection: s.selection.includes(id)
            ? s.selection.filter((x) => x !== id)
            : [...s.selection, id],
        })),
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
                      metaball: patch.metaball
                        ? { ...el.metaball, ...patch.metaball }
                        : el.metaball,
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
          const sub = doc.sub
          const bdx = dx * sub
          const bdy = dy * sub
          const bw = doc.cols * sub
          const bh = doc.rows * sub
          // scene path: translate each object's own cells; targets steal from the objects
          // beneath (tree order decides who wins when movers overlap)
          if (doc.layers) {
            const sel = new Set(s.selection)
            const movers = allObjs(doc.layers).filter((o) => sel.has(o.id))
            if (movers.length === 0) return s
            // procedural graphs regenerate their ink from params: the move is written
            // into the trailing Offset node instead of the stored cells
            const procedural = new Set(
              movers
                .filter((o) =>
                  o.graph?.nodes.some((nd) => !nd.unknown && nodeDef(nd.op)?.kind === 'source'),
                )
                .map((o) => o.id),
            )
            const claims = new Map<number, Set<number>>()
            for (const mover of movers) {
              if (procedural.has(mover.id)) continue
              const layer = objLayer(doc.layers, mover.id)!
              let claim = claims.get(layer.id)
              if (!claim) claims.set(layer.id, (claim = new Set()))
              for (const [i] of translateObjCells(mover, bdx, bdy, bw, bh)) claim.add(i)
            }
            let layers = doc.layers
            for (const [layerId, idxs] of claims) layers = stealCells(layers, layerId, idxs)
            for (const mover of movers) {
              if (procedural.has(mover.id)) {
                console.log('DEBUG store: procedural move for', mover.id)
                // shift the trailing Offset node (create it when the graph has none)
                const nodes = [...mover.graph!.nodes]
                const lastOffset = [...nodes].reverse().find((nd) => nd.op === 'mod.offset')
                if (lastOffset) {
                  const at = nodes.indexOf(lastOffset)
                  nodes[at] = {
                    ...lastOffset,
                    params: {
                      ...lastOffset.params,
                      dx: (Number(lastOffset.params.dx) || 0) + dx,
                      dy: (Number(lastOffset.params.dy) || 0) + dy,
                    },
                  }
                } else {
                  nodes.push({ id: genNodeId(), op: 'mod.offset', params: { dx, dy } })
                }
                layers =
                  updateNode(layers, mover.id, (nd) =>
                    nd.kind === 'obj' && nd.graph ? { ...nd, graph: { ...nd.graph, nodes } } : nd,
                  ) ?? layers
                continue
              }
              const cells = translateObjCells(mover, bdx, bdy, bw, bh)
              const links = mover.links
                .map((l) => ({ ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy }))
                .filter(
                  (l) =>
                    l.ax >= 0 &&
                    l.ay >= 0 &&
                    l.bx >= 0 &&
                    l.by >= 0 &&
                    l.ax < doc.cols &&
                    l.ay < doc.rows &&
                    l.bx < doc.cols &&
                    l.by < doc.rows,
                )
              layers =
                updateNode(layers, mover.id, (n) =>
                  n.kind === 'obj' ? { ...n, cells, links } : n,
                ) ?? layers
            }
            // connectors visually attached to moved pixels follow the move even when
            // their own object stays put (both endpoints must land on moved pixels)
            const movedPixels = new Set<number>()
            for (const mover of movers) {
              for (const [i] of mover.cells) {
                movedPixels.add(Math.floor((i % bw) / sub) + Math.floor(i / bw / sub) * doc.cols)
              }
            }
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
                        onMoved(l)
                          ? { ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy }
                          : l,
                      )
                      .filter(
                        (l) =>
                          l.ax >= 0 &&
                          l.ay >= 0 &&
                          l.bx >= 0 &&
                          l.by >= 0 &&
                          l.ax < doc.cols &&
                          l.ay < doc.rows &&
                          l.bx < doc.cols &&
                          l.by < doc.rows,
                      ),
                  }
                }) ?? layers
            }
            const { layers: pruned } = pruneEmptyObjs(layers, sel)
            return { doc: syncDoc({ ...doc, layers: pruned }) }
          }
          if (!doc.cellObj) return s
          const sel = new Set(s.selection)
          const cells = doc.cells.slice()
          const cellObj = doc.cellObj.slice()
          // snapshot the sources, blank them, then write the copies at the offset so
          // overlapping regions of the same move behave like paint-over
          const moved: Array<[number, number, number]> = []
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
          const cols = doc.cols
          const rows = doc.rows
          const links = doc.links
            .map((l) =>
              l.obj && sel.has(l.obj)
                ? { ...l, ax: l.ax + dx, ay: l.ay + dy, bx: l.bx + dx, by: l.by + dy }
                : l,
            )
            .filter(
              (l) =>
                l.ax >= 0 &&
                l.ay >= 0 &&
                l.bx >= 0 &&
                l.by >= 0 &&
                l.ax < cols &&
                l.ay < rows &&
                l.bx < cols &&
                l.by < rows,
            )
          const c = compactElements({ ...doc, cells, cellObj, links }, s.selection)
          return { doc: c.doc, selection: c.selection }
        }),
      setActiveLayer: (id) => set({ activeLayerId: id }),
      addLayer: () =>
        set((s) => {
          if (!s.doc.layers) return s
          const { layer, doc } = newLayer(s.doc)
          // insert directly above the active layer (tree order: bottom → top)
          const idx = s.doc.layers.findIndex((l) => l.id === s.activeLayerId)
          const layers = [...s.doc.layers]
          layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, layer)
          return { doc: syncDoc({ ...doc, layers }), activeLayerId: layer.id }
        }),
      deleteLayer: (id) =>
        set((s) => {
          if (!s.doc.layers || s.doc.layers.length <= 1) return s
          const idx = s.doc.layers.findIndex((l) => l.id === id)
          if (idx < 0) return s
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
      applyGraphPreset: (presetId) =>
        set((s) => {
          if (!s.doc.layers) return s
          const preset = GRAPH_PRESETS.find((p) => p.id === presetId)
          if (!preset) return s
          // fresh deep copy per apply, rescaled from the preset's 16×16 design grid
          // to the current canvas so recipes always span the working area
          const graph = fitGraphToCanvas(
            JSON.parse(JSON.stringify(preset.graph)) as import('../engine/nodes').Graph,
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
        }),
      setBg: (bg) => set((s) => ({ doc: { ...s.doc, bg } })),
      setConnectorWidth: (w) => set((s) => ({ doc: { ...s.doc, connectorWidth: w } })),
      applyPalette: (preset) =>
        set((s) => ({
          doc: { ...s.doc, palette: [...new Set(preset.colors.map((c) => c.toLowerCase()))] },
        })),
      replacePalette: (colors) => set((s) => ({ doc: { ...s.doc, palette: [...colors] } })),
      loadDoc: (doc) => set({ doc: ensureScene(doc) }),
      newDoc: () => set({ doc: freshDoc() }),
      importPixels: (r) =>
        set((s) => {
          // the import replaces all content, like clear(): connectors, objects and frozen
          // elements belong to the old artwork and must not survive it — only the grid
          // size carries over (r.cols/rows are pre-clamped by the conversion pipeline)
          const base: Doc = { ...s.doc, cols: r.cols, rows: r.rows }
          // scene path: stack the converted result according to the import layering —
          // one layer per final color (or a single layer), optionally one object per
          // connected region, stacked by covered area or strict palette order
          if (s.doc.layers) {
            const L = s.importLayering
            const bw = r.cols * s.doc.sub
            const bh = r.rows * s.doc.sub
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
            let ordered = [...byValue.entries()]
            if (L.layerOrder === 'area')
              ordered.sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
            else ordered.sort((a, b) => a[0] - b[0])
            if (L.splitByColor) {
              for (const [v, idxs] of ordered) {
                const regions = L.splitConnected
                  ? (colorRegions(r.cells, bw, bh).get(v) ?? [])
                      .slice()
                      .sort((a, b) => b.length - a.length)
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
                const regions: Array<{ v: number; idxs: number[] }> = []
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
            return {
              doc: syncDoc({
                ...base,
                palette: [...r.palette],
                links: [],
                layers,
                nextNodeId: doc.nextNodeId,
              }),
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
      applyBrushPreset: (id, brush) => set({ brush: normalizeBrush(brush), brushId: id }),

      setConcentricCount: (n) => {
        const target = Math.max(1, Math.min(8, Math.round(n)))
        set((s) => {
          const cur = s.concentricRadii
          if (cur.length === target) return s
          if (cur.length > target) return { concentricRadii: cur.slice(0, target) }
          // new loops slot evenly between the smallest radius and zero
          const last = cur[cur.length - 1] ?? 1
          const add = Array.from({ length: target - cur.length }, (_, i) =>
            Math.max(0.05, (last * (target - cur.length - i)) / (target - cur.length + 1)),
          )
          return { concentricRadii: [...cur, ...add] }
        })
      },
      setConcentricRadius: (index, r) =>
        set((s) => {
          const v = Math.max(0.05, Math.min(1, r))
          if (index < 0 || index >= s.concentricRadii.length) return s
          const next = s.concentricRadii.slice()
          next[index] = v
          return { concentricRadii: next }
        }),
      setProjectName: (name) => {
        try {
          localStorage.setItem(PROJECT_NAME_KEY, name)
        } catch {
          /* ignore */
        }
        const id = get().projectId
        // Figma-style live rename: an open saved project follows the top-bar name
        if (id) scheduleProjectRename(id, name)
        set({ projectName: name })
      },
      setCurrentProject: (id, name) => {
        try {
          if (id === null) localStorage.removeItem(PROJECT_ID_KEY)
          else localStorage.setItem(PROJECT_ID_KEY, id)
          localStorage.setItem(PROJECT_NAME_KEY, name)
        } catch {
          /* ignore */
        }
        clearTimeout(renameTimer)
        // detaching (new project, JSON import, deleting the open project) leaves the
        // work without a library entry — unsaved by definition
        set((s) => ({
          projectId: id,
          projectName: name,
          projectDirty: id === null ? true : s.projectDirty,
        }))
      },
      saveToLibrary: async () => {
        const s = get()
        const savedName = normalizeName(s.projectName)
        const payload = serialize(s.doc) as ProjectJSON
        let id = s.projectId
        if (id) {
          // Photoshop-style Save: with a project bound, overwrite that entry in place
          const existing = await loadProject(id)
          if (existing) {
            await saveProject({
              ...existing,
              name: savedName,
              thumbnail: renderThumbnailDataURL(s.doc),
              doc: payload,
              updatedAt: Date.now(),
            })
          } else {
            id = null // the stored entry was deleted meanwhile — fall back to a fresh one
          }
        }
        if (!id) {
          id = newProjectId()
          await saveProject({
            id,
            name: savedName,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            thumbnail: renderThumbnailDataURL(s.doc),
            doc: payload,
          })
        }
        try {
          localStorage.setItem(PROJECT_ID_KEY, id)
        } catch {
          /* ignore */
        }
        set({ projectId: id, projectName: savedName, savedDoc: get().doc, projectDirty: false })
      },
      markProjectSaved: () => set((s) => ({ savedDoc: s.doc, projectDirty: false })),
      setTool: (tool) =>
        set((s) => {
          // the fill tool keeps the selection: clicking a selected shape re-fills it whole
          if (tool !== 'select' && tool !== 'fill' && s.selection.length > 0) {
            return { tool, selection: [] }
          }
          return { tool }
        }),
      setColor: (color) => set({ color }),
      patchBrush: (patch) =>
        set((s) => {
          // any hand edit makes the current tip a custom one (no preset selected)
          if (patch.size !== undefined && patch.size !== s.brush.size) {
            return { brushId: null, brush: resizeBrush(s.brush, patch.size) }
          }
          return { brushId: null, brush: normalizeBrush({ ...s.brush, ...patch }) }
        }),
      setBrushSnap: (brushSnap) => set({ brushSnap }),
      patchSymmetry: (patch) => set((s) => ({ symmetry: { ...s.symmetry, ...patch } })),
      setFillScope: (fillScope) => set({ fillScope }),
      patchFillStyle: (patch) => set((s) => ({ fillStyle: { ...s.fillStyle, ...patch } })),
      patchShapePaint: (patch) => set((s) => ({ shapePaint: { ...s.shapePaint, ...patch } })),
      setShowGrid: (showGrid) => set({ showGrid }),
      toggleRail: () =>
        set((s) => {
          const railOpen = !s.railOpen
          try {
            localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0')
          } catch {
            /* ignore */
          }
          // refit so the canvas re-centers into the freed/claimed width
          return { railOpen, fitSignal: s.fitSignal + 1 }
        }),
      patchToolOpts: (patch) => set((s) => ({ toolOpts: { ...s.toolOpts, ...patch } })),
      setPreviewGrid: (grid) => set({ previewGrid: grid }),
      patchImportLayering: (patch) =>
        set((s) => ({ importLayering: { ...s.importLayering, ...patch } })),
      setLang: (lang) => {
        try {
          localStorage.setItem(LANG_KEY, lang)
        } catch {
          /* ignore */
        }
        set({ lang })
      },
      setThemePref: (pref) => {
        try {
          localStorage.setItem(THEME_KEY, pref)
        } catch {
          /* ignore */
        }
        set({ themePref: pref, resolvedTheme: resolvedTheme(pref) })
      },
      setPngWidth: (v) => set({ pngWidth: v === null ? null : clampPngSide(v) }),
      setPngHeight: (v) => set({ pngHeight: v === null ? null : clampPngSide(v) }),
      setExportBg: (exportBg) => set({ exportBg }),
      requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),
      nodeEditorOpen: false,
      nodeEditorMode: 'split',
      nodeEditorSplit: 0.45,
      openNodeEditor: () => set({ nodeEditorOpen: true }),
      closeNodeEditor: () => set({ nodeEditorOpen: false }),
      setNodeEditorMode: (mode) => set({ nodeEditorMode: mode }),
      setNodeEditorSplit: (fraction) =>
        set({ nodeEditorSplit: Math.max(0.25, Math.min(0.8, fraction)) }),
      pushRecent: (hex) =>
        set((s) => {
          const norm = hex.toLowerCase()
          const recent = [norm, ...s.recent.filter((c) => c !== norm)].slice(0, 12)
          try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
          } catch {
            /* ignore */
          }
          return { recent }
        }),
    }),
    temporalOptions,
  ),
)

// Keep the undo-history entry budget in sync with the content size. The flat buffers
// count per cell; scene ink (sparse maps, connectors) adds a per-entry overhead on top.
function syncHistoryLimit(doc: Doc): void {
  let ink = 0
  if (doc.layers) {
    for (const o of allObjs(doc.layers)) ink += o.cells.size + o.links.length * 4
  }
  const bytes = Math.max(1, doc.cells.length * (2 + (doc.cellObj ? 4 : 0)) + ink * 24)
  temporalOptions.limit = Math.max(8, Math.min(100, Math.floor(32_000_000 / bytes)))
}
syncHistoryLimit(useStore.getState().doc)
useStore.subscribe((s, prev) => {
  if (s.doc !== prev.doc) {
    syncHistoryLimit(s.doc)
    // undo/redo/load can resurrect a document where selected elements or the active
    // layer no longer exist
    if (s.selection.length > 0) {
      const used = new Set<number>()
      if (s.doc.layers) {
        for (const o of allObjs(s.doc.layers)) used.add(o.id)
      } else {
        if (s.doc.cellObj) {
          for (let i = 0; i < s.doc.cellObj.length; i++) {
            const o = s.doc.cellObj[i]
            if (o > 0) used.add(o)
          }
        }
        for (const l of s.doc.links) if (l.obj) used.add(l.obj)
      }
      const valid = s.selection.filter((id) => used.has(id))
      if (valid.length !== s.selection.length) useStore.setState({ selection: valid })
    }
    if (
      s.activeLayerId != null &&
      s.doc.layers &&
      !s.doc.layers.some((l) => l.id === s.activeLayerId)
    ) {
      useStore.setState({
        activeLayerId: s.doc.layers[s.doc.layers.length - 1]?.id ?? null,
      })
    }
  }
})

// Theme: mirror the resolved theme onto <html data-theme> and follow the system in auto mode.
function applyTheme(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = useStore.getState().resolvedTheme
}
applyTheme()
useStore.subscribe((s, prev) => {
  if (s.themePref !== prev.themePref || s.resolvedTheme !== prev.resolvedTheme) applyTheme()
})
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = useStore.getState()
    if (s.themePref === 'auto') useStore.setState({ resolvedTheme: resolvedTheme('auto') })
  })
} catch {
  /* matchMedia unavailable */
}

// Autosave (debounced) on every committed document change.
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(serialize(s.doc)))
    } catch {
      /* storage full or unavailable */
    }
  }, 800)
})

// The Save button tracks unsaved changes: any doc that differs from the last library
// snapshot makes the project dirty again. Only ever flips to dirty — getting back to
// clean happens through an explicit save or opening a project, Photoshop-style.
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc || s.doc === s.savedDoc || s.projectDirty) return
  useStore.setState({ projectDirty: true })
})

// A bound project boots clean only when the autosaved doc still matches its library
// entry — the autosave can be ahead when the tab closed right after a change.
void (async () => {
  const s = useStore.getState()
  if (!s.projectId) return
  try {
    const entry = await loadProject(s.projectId)
    if (!entry) return
    if (JSON.stringify(serialize(s.doc)) === JSON.stringify(entry.doc)) {
      useStore.getState().markProjectSaved()
    }
  } catch {
    /* library unavailable — keep the conservative dirty state */
  }
})()

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
