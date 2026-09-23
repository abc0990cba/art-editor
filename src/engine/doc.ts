/** Document model shared by the store, engine and serializers. Pure data, no React. */

import { CLASSIC_12 } from './palettes'
import { docSize, type GridType } from './grids'
import type { SceneLayer } from './scene'

export type SubDetail = 1 | 2 | 3

export type { GridType }

/** Connectors link the centers of two pixel cells (pixel coordinates, not sub-cells). */
export interface Link {
  ax: number
  ay: number
  bx: number
  by: number
  /** palette value (1-based cell value, 0 = empty is never stored here) */
  v: number
  /** element id (1-based index into Doc.elements + 1); missing = unattributed (legacy) */
  obj?: number
}

export interface PixelStyle {
  /** corner radius as a fraction of min(sizeX,sizeY) cell box, 0..0.5 */
  radius: number
  /** per-corner overrides (fractions 0..0.5); null = follow `radius` */
  corners: { tl: number | null; tr: number | null; bl: number | null; br: number | null }
  /** pixel size within the cell, 0.05..1 (independent stretch) */
  sizeX: number
  sizeY: number
  /** outline mode: rounding of the silhouette's outer corners */
  convexRadius: number
  /** outline mode: rounding of the silhouette's inner corners */
  concaveRadius: number
  /** how corners are drawn: circular arcs or straight 45° cuts */
  cornerStyle: 'arc' | 'chamfer'
  /** keep corners touching the canvas border square (no rounding toward the edge) */
  squareEdges: boolean
}

export interface MetaballSettings {
  /** merge strength 0..100 → kernel radius grows from cell size to ~1.6 cells */
  strength: number
  /** render each color as its own blob field so colors never bleed */
  perColor: boolean
  /** field samples per buffer cell, 2..8 */
  quality: number
  /** blobs meeting the canvas border join it with straight edges instead of rounded shoulders */
  squareEdges: boolean
}

/** Baked vector texture punched into the inner pixel fill (all render modes). */
export type TextureEffect = 'none' | 'grain' | 'grunge' | 'halftone'

/** Spatial distribution of the texture specks. */
export type TextureDist = 'scatter' | 'clumps' | 'streaks' | 'perlin' | 'voronoi'

/** Speck silhouette (halftone always uses dots). */
export type TextureShape = 'square' | 'dot' | 'chip'

export interface TextureSettings {
  effect: TextureEffect
  /** intensity 0..100: fleck density (grain), edge wear (grunge), dot size (halftone) */
  amount: number
  /** feature size multiplier 0.1..8 relative to the cell */
  scale: number
  /** smallest speck, 0.05..0.6 of the grid pitch */
  sizeMin: number
  /** largest speck, 0.05..0.6 of the grid pitch */
  sizeMax: number
  /** speck silhouette */
  shape: TextureShape
  /** grunge only: how strongly wear clusters at pixel edges, 0 (uniform) .. 100 */
  edge: number
  /** how specks are spread across the fill */
  dist: TextureDist
  /** clean margin on sides facing empty space, 0..0.45 of a cell; connected sides stay textured */
  gap: number
  /** streaks: band direction; halftone: screen-angle grid rotation, degrees 0..180 */
  angle: number
  /** random seed; the same seed reproduces the exact same texture */
  seed: number
  /* ---- halftone distress knobs (all 0 = clean regular dot grid) ---- */
  /** random per-dot position scatter, 0..100 (share of the grid pitch) */
  jitter: number
  /** random per-dot size variation, 0..100 */
  variation: number
  /** noise-wobbled dot outline (irregular edges), 0..100 */
  wobble: number
  /** adjacent dots fuse into single blobs ("ink bleed"), 0..100 */
  merge: number
  /** randomly missing dots clustered by noise into worn patches, 0..100 */
  dropout: number
  /** tiny satellite specks scattered between dots, 0..100 */
  spray: number
  /** directional tone ramp: dot size grows along the angle direction, 0..100 */
  ramp: number
}

/** How painted cells turn into geometry. */
export type RenderMode = 'pixels' | 'outline' | 'metaball'

/**
 * Whether the style settings apply to the whole canvas at once (`global`) or are frozen
 * per drawn element at draw time (`element`).
 */
export type StyleScope = 'global' | 'element'

/**
 * Full snapshot of every style knob, frozen into an element when it is drawn. Element ids
 * are 1-based (`cellObj` value 0 means "no element"); `Doc.elements[id - 1]` is the style.
 */
export interface ElementStyle {
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
}

/**
 * How diagonal (corner-touching) neighborhoods join in outline and metaball rendering:
 * edge-only, through the shared corner point, or through the corner with a bridge overlay.
 */
export type Connectivity = 'edge' | 'corner' | 'corner-bridge'

/** Colors of the canvas stage that follow the editor theme. */
export interface StageTheme {
  checkerA: string
  checkerB: string
  gridLine: string
  pixelLine: string
  guide: string
  hover: string
  /** dark outline drawn under the hover stroke so it reads on any cell color */
  hoverHalo: string
  frame: string
}

export const STAGE_THEMES: Record<'dark' | 'light', StageTheme> = {
  dark: {
    checkerA: '#26262b',
    checkerB: '#1e1e23',
    gridLine: 'rgba(255,255,255,0.07)',
    pixelLine: 'rgba(255,255,255,0.14)',
    guide: 'rgba(129,140,248,0.55)',
    hover: 'rgba(255,255,255,0.95)',
    hoverHalo: 'rgba(0,0,0,0.65)',
    frame: 'rgba(255,255,255,0.15)',
  },
  light: {
    checkerA: '#dfe2e8',
    checkerB: '#cdd1da',
    gridLine: 'rgba(20,20,35,0.10)',
    pixelLine: 'rgba(20,20,35,0.20)',
    guide: 'rgba(79,70,229,0.60)',
    hover: 'rgba(255,255,255,0.95)',
    hoverHalo: 'rgba(20,20,35,0.70)',
    frame: 'rgba(20,20,35,0.20)',
  },
}

export interface Doc {
  gridType: GridType
  cols: number
  rows: number
  sub: SubDetail
  /** radial grid only: sectors per ring scale with radius so cells stay ~equal across rings */
  radialEven: boolean
  /** buffer of cols*sub × rows*sub values; 0 = empty, v ≥ 1 → palette[v-1] */
  cells: Uint16Array
  links: Link[]
  palette: string[]
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
  /** whether styles render canvas-wide (doc fields) or per frozen element */
  styleScope: StyleScope
  /** frozen style per element; element id n lives at index n - 1 */
  elements: ElementStyle[]
  /** parallel to cells: owning element id per buffer cell, 0 = none; null = never attributed */
  cellObj: Uint32Array | null
  /**
   * Scene tree of layers/groups/objects, bottom → top; null = legacy flat document whose
   * ink lives directly in the buffers. When set, `cells`/`cellObj`/`links`/`elements` are
   * derived from the tree (see scene.ts `syncDoc`) and object ids live here, not in
   * `elements` alone.
   */
  layers: SceneLayer[] | null
  /** monotonic id counter for scene nodes (layers, groups, objects) */
  nextNodeId: number
  /**
   * Whether same-style objects on one layer merge into shared metaball fields / silhouettes
   * (true, the classic blob behavior) or always render as separate contours.
   */
  fuseObjects: boolean
  /** canvas background: hex color or '' for transparent */
  bg: string
  connectorWidth: number
}

export type SymmetryMode =
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
  /** fold count for radial/kaleido, 2..24 */
  n: number
  /** lattice repeat cell size in buffer cells for repeat modes, 4..64 */
  cell: number
  showGuides: boolean
  /** radial/kaleido: painted fraction of each sector, 10..100 */
  fill: number
  /** radial/kaleido: rotation of the sector pattern in degrees, 0..359 */
  phase: number
  /** radial/kaleido: extra rotation per unit radius in degrees (spiral), -45..45 */
  twist: number
}

export const MAX_SIZE = 512
export const MIN_SIZE = 1

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
export function elementFromDoc(doc: Doc): ElementStyle {
  return {
    style: { ...doc.style, corners: { ...doc.style.corners } },
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: { ...doc.metaball },
    texture: { ...doc.texture },
  }
}

/** Deep equality of two frozen element styles (render grouping merges equal elements). */
export function sameElementStyle(a: ElementStyle, b: ElementStyle): boolean {
  return (
    a.renderMode === b.renderMode &&
    a.connectivity === b.connectivity &&
    samePixelStyle(a.style, b.style) &&
    a.metaball.strength === b.metaball.strength &&
    a.metaball.perColor === b.metaball.perColor &&
    a.metaball.quality === b.metaball.quality &&
    a.metaball.squareEdges === b.metaball.squareEdges &&
    a.texture.effect === b.texture.effect &&
    a.texture.amount === b.texture.amount &&
    a.texture.scale === b.texture.scale &&
    a.texture.sizeMin === b.texture.sizeMin &&
    a.texture.sizeMax === b.texture.sizeMax &&
    a.texture.shape === b.texture.shape &&
    a.texture.edge === b.texture.edge &&
    a.texture.dist === b.texture.dist &&
    a.texture.gap === b.texture.gap &&
    a.texture.angle === b.texture.angle &&
    a.texture.seed === b.texture.seed &&
    a.texture.jitter === b.texture.jitter &&
    a.texture.variation === b.texture.variation &&
    a.texture.wobble === b.texture.wobble &&
    a.texture.merge === b.texture.merge &&
    a.texture.dropout === b.texture.dropout &&
    a.texture.spray === b.texture.spray &&
    a.texture.ramp === b.texture.ramp
  )
}

function samePixelStyle(a: PixelStyle, b: PixelStyle): boolean {
  return (
    a.radius === b.radius &&
    a.sizeX === b.sizeX &&
    a.sizeY === b.sizeY &&
    a.convexRadius === b.convexRadius &&
    a.concaveRadius === b.concaveRadius &&
    a.cornerStyle === b.cornerStyle &&
    a.squareEdges === b.squareEdges &&
    a.corners.tl === b.corners.tl &&
    a.corners.tr === b.corners.tr &&
    a.corners.br === b.corners.br &&
    a.corners.bl === b.corners.bl
  )
}

/**
 * Flip the style scope. Entering element mode attributes all painted cells and unattributed
 * connectors to a single frozen element carrying a snapshot of the current global style, so
 * the rendered picture does not change. Leaving element mode keeps the element data intact.
 */
export function withStyleScope(doc: Doc, scope: StyleScope): Doc {
  if (doc.styleScope === scope) return doc
  // scene docs own every cell through their objects, so a scope flip needs no
  // materialization pass — hidden legacy globals just render through the tree
  if (doc.layers) return { ...doc, styleScope: scope }
  if (scope === 'global') return { ...doc, styleScope: scope }
  const snapshot = elementFromDoc(doc)
  const elements = [...doc.elements]
  let id = elements.findIndex((el) => sameElementStyle(el, snapshot)) + 1
  if (id === 0) {
    elements.push(snapshot)
    id = elements.length
  }
  let cellObj = doc.cellObj
  if (doc.cells.some((v) => v !== 0)) {
    cellObj = (cellObj ?? new Uint32Array(doc.cells.length)).slice()
    for (let i = 0; i < cellObj.length; i++) {
      if (doc.cells[i] !== 0 && cellObj[i] === 0) cellObj[i] = id
    }
  }
  const links = doc.links.some((l) => !l.obj)
    ? doc.links.map((l) => (l.obj ? l : { ...l, obj: id }))
    : doc.links
  return { ...doc, styleScope: scope, elements, cellObj, links }
}

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
  if (c === doc.cols && r === doc.rows) return doc
  const next = makeCells(c, r, doc.sub)
  const nextObj = doc.cellObj ? new Uint32Array(next.length) : null
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  const nbw = c * doc.sub
  const nbh = r * doc.sub
  for (let y = 0; y < Math.min(bh, nbh); y++) {
    for (let x = 0; x < Math.min(bw, nbw); x++) {
      next[y * nbw + x] = doc.cells[y * bw + x]
      if (nextObj && doc.cellObj) nextObj[y * nbw + x] = doc.cellObj[y * bw + x]
    }
  }
  // drop connectors that fall outside the new grid
  const links = doc.links.filter((l) => l.ax < c && l.bx < c && l.ay < r && l.by < r)
  return { ...doc, cols: c, rows: r, cells: next, cellObj: nextObj, links }
}

/** Change sub-cell detail, resampling the buffer nearest-neighbor so content stays in place. */
export function changeSub(doc: Doc, sub: SubDetail): Doc {
  if (sub === doc.sub) return doc
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
  if (i >= 0) return { doc, v: i + 1 }
  const palette = [...doc.palette, hex.toLowerCase()]
  return { doc: { ...doc, palette }, v: palette.length }
}
