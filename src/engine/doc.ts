/** Document model shared by the store, engine and serializers. Pure data, no React. */

import { DEFAULT_SHAPE_PARAMS, type CellShapeId, type ShapeParams } from './cell-shapes.ts'
import { docSize, type GridType } from './grids'
import { CLASSIC_12 } from './palettes'
import type { SceneLayer } from './scene'

export { elementFromDoc, sameElementStyle, withStyleScope } from './doc-style.ts'
export { STAGE_THEMES, type StageTheme } from './stage-themes.ts'

export type SubDetail = 1 | 2 | 3

export type { GridType }

/** Connectors link the centers of two pixel cells (pixel coordinates, not sub-cells). */
export interface Link {
  ax: number
  ay: number
  bx: number
  by: number
  /** Palette value (1-based cell value, 0 = empty is never stored here) */
  v: number
  /** Element id (1-based index into Doc.elements + 1); missing = unattributed (legacy) */
  obj?: number
}

export interface PixelStyle {
  /** Corner radius as a fraction of min(sizeX,sizeY) cell box, 0..0.5 */
  radius: number
  /** Per-corner overrides (fractions 0..0.5); null = follow `radius` */
  corners: { tl: number | null; tr: number | null; bl: number | null; br: number | null }
  /** Pixel size within the cell, 0.05..1 (independent stretch) */
  sizeX: number
  sizeY: number
  /** Outline mode: rounding of the silhouette's outer corners */
  convexRadius: number
  /** Outline mode: rounding of the silhouette's inner corners */
  concaveRadius: number
  /** How corners are drawn: circular arcs or straight 45° cuts */
  cornerStyle: 'arc' | 'chamfer'
  /** Keep corners touching the canvas border square (no rounding toward the edge) */
  squareEdges: boolean
  /** Cell form in `pixels` render mode (square keeps the classic fast path) */
  shape: CellShapeId
  /** Shared shape knobs (thickness/points/rotation); each shape reads what it needs */
  shapeParams: ShapeParams
  /** Scale every cell form by its color's darkness: dark = full figure, light = `toneSizeMin` */
  toneSize: boolean
  /** Smallest figure at the light end of the tone scale, fraction of the cell box, 0.05..1 */
  toneSizeMin: number
}

export interface MetaballSettings {
  /** Merge strength 0..100 → kernel radius grows from cell size to ~1.6 cells */
  strength: number
  /** Render each color as its own blob field so colors never bleed */
  perColor: boolean
  /** Field samples per buffer cell, 2..8 */
  quality: number
  /** Blobs meeting the canvas border join it with straight edges instead of rounded shoulders */
  squareEdges: boolean
}

/** Baked vector texture punched into the inner pixel fill (all render modes). */
type TextureEffect = 'none' | 'grain' | 'grunge' | 'halftone'

/** Spatial distribution of the texture specks. */
type TextureDist =
  | 'scatter'
  | 'clumps'
  | 'streaks'
  | 'perlin'
  | 'voronoi'
  | 'waves'
  | 'sunburst'
  | 'spiral'
  | 'honeycomb'
  | 'scales'
  | 'weave'
  | 'checker'
  | 'fade'
  | 'bayer'

/** Speck silhouette (halftone always uses dots). */
type TextureShape =
  | 'square'
  | 'dot'
  | 'chip'
  | 'triangle'
  | 'diamond'
  | 'cross'
  | 'star'
  | 'hex'
  | 'ring'
  | 'dash'

/** What the clean gap margin keeps distance from. */
type TextureGapMode = 'cell' | 'figure'

export interface TextureSettings {
  effect: TextureEffect
  /** Intensity 0..100: fleck density (grain), edge wear (grunge), dot size (halftone) */
  amount: number
  /** Feature size multiplier 0.1..8 relative to the cell */
  scale: number
  /** Smallest speck, 0.05..0.6 of the grid pitch */
  sizeMin: number
  /** Largest speck, 0.05..0.6 of the grid pitch */
  sizeMax: number
  /** Speck silhouette */
  shape: TextureShape
  /** Grunge only: how strongly wear clusters at pixel edges, 0 (uniform) .. 100 */
  edge: number
  /** How specks are spread across the fill */
  dist: TextureDist
  /** Clean margin on sides facing empty space, 0..0.45 of a cell; connected sides stay textured */
  gap: number
  /** Gap reference: every open pixel side ('cell') or the whole figure's outer silhouette ('figure') */
  gapMode: TextureGapMode
  /** Grain/grunge: keep specks a minimum distance apart for an even, Poisson-like scatter */
  even: boolean
  /** Streaks: band direction; halftone: screen-angle grid rotation, degrees 0..180 */
  angle: number
  /** Random seed; the same seed reproduces the exact same texture */
  seed: number
  /* ---- halftone distress knobs (all 0 = clean regular dot grid) ---- */
  /** Random per-dot position scatter, 0..100 (share of the grid pitch) */
  jitter: number
  /** Random per-dot size variation, 0..100 */
  variation: number
  /** Noise-wobbled dot outline (irregular edges), 0..100 */
  wobble: number
  /** Adjacent dots fuse into single blobs ("ink bleed"), 0..100 */
  merge: number
  /** Randomly missing dots clustered by noise into worn patches, 0..100 */
  dropout: number
  /** Tiny satellite specks scattered between dots, 0..100 */
  spray: number
  /** Directional tone ramp: dot size grows along the angle direction, 0..100 */
  ramp: number
}

/** How painted cells turn into geometry. */
export type RenderMode = 'pixels' | 'outline' | 'metaball'

/**
 * Whether the style settings apply to the whole canvas at once (`global`) or are frozen per drawn
 * element at draw time (`element`).
 */
export type StyleScope = 'global' | 'element'

/**
 * Full snapshot of every style knob, frozen into an element when it is drawn. Element ids are
 * 1-based (`cellObj` value 0 means "no element"); `Doc.elements[id - 1]` is the style.
 */
export interface ElementStyle {
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
}

/**
 * How diagonal (corner-touching) neighborhoods join in outline and metaball rendering: edge-only,
 * through the shared corner point, or through the corner with a bridge overlay.
 */
export type Connectivity = 'edge' | 'corner' | 'corner-bridge'

/** Colors of the canvas stage that follow the editor theme. */
export interface Doc {
  gridType: GridType
  cols: number
  rows: number
  sub: SubDetail
  /** Radial grid only: sectors per ring scale with radius so cells stay ~equal across rings */
  radialEven: boolean
  /**
   * Whole-grid rotation in degrees (0..360); 0/absent = canonical orientation. Render/pick-time
   * geometry only — the cell buffer keeps its base indexing
   */
  gridRotation?: number
  /** Buffer of cols_sub × rows_sub values; 0 = empty, v ≥ 1 → palette[v-1] */
  cells: Uint16Array
  links: Link[]
  palette: string[]
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
  /** Whether styles render canvas-wide (doc fields) or per frozen element */
  styleScope: StyleScope
  /** Frozen style per element; element id n lives at index n - 1 */
  elements: ElementStyle[]
  /** Parallel to cells: owning element id per buffer cell, 0 = none; null = never attributed */
  cellObj: Uint32Array | null
  /**
   * Scene tree of layers/groups/objects, bottom → top; null = legacy flat document whose ink lives
   * directly in the buffers. When set, `cells`/`cellObj`/`links`/`elements` are derived from the
   * tree (see scene.ts `syncDoc`) and object ids live here, not in `elements` alone.
   */
  layers: SceneLayer[] | null
  /** Monotonic id counter for scene nodes (layers, groups, objects) */
  nextNodeId: number
  /**
   * Whether same-style objects on one layer merge into shared metaball fields / silhouettes (true,
   * the classic blob behavior) or always render as separate contours.
   */
  fuseObjects: boolean
  /** Canvas background: hex color or '' for transparent */
  bg: string
  connectorWidth: number
}

type SymmetryMode =
  | 'none'
  | 'mirrorX'
  | 'mirrorY'
  | 'quad'
  | 'diag8'
  | 'radial'
  | 'kaleido'
  // repeat / wallpaper-group modes (square grid only)
  | 'p1'
  | 'p1hex'
  | 'p1diag'
  | 'p2'
  | 'pm'
  | 'pg'
  | 'cm'
  | 'pmm'
  | 'pmg'
  | 'pgg'
  | 'cmm'
  | 'p4'
  | 'p4m'
  | 'p4g'
  | 'p3'
  | 'p3m1'
  | 'p31m'
  | 'p6'
  | 'p6m'
  | 'brick'
  | 'halfdrop'

export interface SymmetryState {
  mode: SymmetryMode
  /** Fold count for radial/kaleido, 2..24 */
  n: number
  /** Lattice repeat cell size in buffer cells for repeat modes, 4..64 */
  cell: number
  showGuides: boolean
  /** Radial/kaleido: painted fraction of each sector, 10..100 */
  fill: number
  /** Radial/kaleido: rotation of the sector pattern in degrees, 0..359 */
  phase: number
  /** Radial/kaleido: extra rotation per unit radius in degrees (spiral), -45..45 */
  twist: number
}

export const MAX_SIZE = 4096
export const MIN_SIZE = 1
/**
 * Hard ceiling for buffer cells (cols·sub × rows·sub): at Uint16 cells + Uint32 element ids this is
 * ~96 MB of live buffers per composite rebuild, the ceiling the render pipeline is dimensioned
 * for.
 */
export const MAX_CELLS = 16_777_216

/** Largest sub detail that fits a cols×rows grid under the MAX_CELLS ceiling (sub steps 3→2→1). */
export function fitSub(cols: number, rows: number, sub: SubDetail): SubDetail {
  const cells = cols * rows
  let s = sub
  while (s > 1 && cells * s * s > MAX_CELLS) s = s === 3 ? 2 : 1
  return s
}

export function bufferWidth(doc: Pick<Doc, 'cols' | 'sub'>): number {
  return doc.cols * doc.sub
}

export function bufferHeight(doc: Pick<Doc, 'rows' | 'sub'>): number {
  return doc.rows * doc.sub
}

/** Canvas extent of the document grid (doc units). */
export function docExtent(doc: Pick<Doc, 'gridType' | 'cols' | 'rows'>): { w: number; h: number } {
  return docSize(doc.gridType, doc.cols, doc.rows)
}

export function makeCells(cols: number, rows: number, sub: SubDetail): Uint16Array {
  return new Uint16Array(cols * sub * rows * sub)
}

/** Snapshot of the document's current drawing style, for freezing into a new element. */
export function defaultDoc(): Doc {
  return {
    gridType: 'square',
    cols: 32,
    rows: 32,
    sub: 1,
    radialEven: false,
    cells: makeCells(32, 32, 1),
    links: [],
    palette: [...CLASSIC_12],
    // defaults are plain 100% squares: every effect (rounding, metaball, texture…) is
    // something the user opts into explicitly
    style: {
      radius: 0,
      corners: { tl: null, tr: null, bl: null, br: null },
      sizeX: 1,
      sizeY: 1,
      convexRadius: 0,
      concaveRadius: 0,
      cornerStyle: 'arc',
      squareEdges: false,
      shape: 'square',
      shapeParams: { ...DEFAULT_SHAPE_PARAMS },
      toneSize: false,
      toneSizeMin: 0.15,
    },
    renderMode: 'pixels',
    connectivity: 'edge',
    metaball: { strength: 45, perColor: true, quality: 4, squareEdges: false },
    texture: {
      effect: 'none',
      amount: 40,
      scale: 1,
      sizeMin: 0.12,
      sizeMax: 0.35,
      shape: 'square',
      edge: 100,
      dist: 'scatter',
      gap: 0,
      gapMode: 'cell',
      even: false,
      angle: 45,
      seed: 1,
      jitter: 0,
      variation: 0,
      wobble: 0,
      merge: 0,
      dropout: 0,
      spray: 0,
      ramp: 0,
    },
    styleScope: 'element',
    elements: [],
    cellObj: null,
    layers: null,
    nextNodeId: 1,
    fuseObjects: true,
    bg: '',
    connectorWidth: 0.34,
  }
}

export function cellColor(doc: Doc, v: number): string | null {
  if (v === 0) return null
  return doc.palette[(v - 1) % doc.palette.length] ?? null
}

/** Resize the grid (1..MAX_SIZE), preserving content anchored at the top-left. */
export function resizeDoc(doc: Doc, cols: number, rows: number): Doc {
  const c = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(cols)))
  const r = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(rows)))
  // a resize can push the buffer past MAX_CELLS at the current detail: step sub down first
  const sub = fitSub(c, r, doc.sub)
  const base =
    c === doc.cols && r === doc.rows && sub === doc.sub ? doc : resizeBuffer(doc, c, r, doc.sub)
  return sub === base.sub ? base : changeSub(base, sub)
}

/** 1:1 buffer copy into a c×r grid at the current sub, content anchored at the top-left. */
function resizeBuffer(doc: Doc, c: number, r: number, sub: SubDetail): Doc {
  const next = makeCells(c, r, sub)
  const nextObj = doc.cellObj ? new Uint32Array(next.length) : null
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  const nbw = c * sub
  const nbh = r * sub
  for (let y = 0; y < Math.min(bh, nbh); y++) {
    for (let x = 0; x < Math.min(bw, nbw); x++) {
      next[y * nbw + x] = doc.cells[y * bw + x]
      if (nextObj && doc.cellObj) nextObj[y * nbw + x] = doc.cellObj[y * bw + x]
    }
  }
  // drop connectors that fall outside the new grid
  const links = doc.links.filter((l) => l.ax < c && l.bx < c && l.ay < r && l.by < r)
  return { ...doc, cols: c, rows: r, sub, cells: next, cellObj: nextObj, links }
}

/** Change sub-cell detail, resampling the buffer nearest-neighbor so content stays in place. */
export function changeSub(doc: Doc, sub: SubDetail): Doc {
  // sub-cells are a square-lattice feature: other grids index cells 1:1 and must not resample
  if (doc.gridType !== 'square') return doc
  const fitted = fitSub(doc.cols, doc.rows, sub)
  if (fitted === doc.sub) return doc
  sub = fitted
  const oldSub = doc.sub
  const oldBw = doc.cols * oldSub
  const oldBh = doc.rows * oldSub
  const next = makeCells(doc.cols, doc.rows, sub)
  const nextObj = doc.cellObj ? new Uint32Array(next.length) : null
  const nbw = doc.cols * sub
  const nbh = doc.rows * sub
  for (let y = 0; y < nbh; y++) {
    const py = Math.floor(y / sub)
    const oy = Math.min(oldBh - 1, py * oldSub + Math.floor(((y % sub) * oldSub) / sub))
    for (let x = 0; x < nbw; x++) {
      const px = Math.floor(x / sub)
      const ox = Math.min(oldBw - 1, px * oldSub + Math.floor(((x % sub) * oldSub) / sub))
      next[y * nbw + x] = doc.cells[oy * oldBw + ox]
      if (nextObj && doc.cellObj) nextObj[y * nbw + x] = doc.cellObj[oy * oldBw + ox]
    }
  }
  return { ...doc, sub, cells: next, cellObj: nextObj }
}

/** Pure version of colorValue: returns { doc, v } with an extended palette when needed. */
export function resolveColor(doc: Doc, hex: string): { doc: Doc; v: number } {
  const i = doc.palette.findIndex((c) => c.toLowerCase() === hex.toLowerCase())
  if (i !== -1) return { doc, v: i + 1 }
  const palette = [...doc.palette, hex.toLowerCase()]
  return { doc: { ...doc, palette }, v: palette.length }
}
