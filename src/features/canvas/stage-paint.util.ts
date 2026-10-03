import { elementFromDoc } from '../../engine/core/doc-style.ts'
import type { Doc, PixelStyle, StageTheme } from '../../engine/core/doc.ts'
import type { Geometry, Staging } from '../../engine/geometry/index.ts'
import { isPlainSquare } from '../../engine/grids/index.ts'
import type { ResolvedTheme } from '../../state/editor.store.ts'

/**
 * The staged-cell style a preview can composite incrementally: plain square grid, pixel render
 * mode, no baked texture, no connector edits — the same conditions under which `stagingPreview`
 * builds O(staged) fragment paths (so the fast path and the legacy path agree on every cell).
 */
export function strokePreviewCapable(doc: Doc, st: Staging): boolean {
  if (!isPlainSquare(doc)) return false
  if (st.links && st.links.length !== doc.links.length) return false
  const el = elementFromDoc(doc)
  return el.renderMode === 'pixels' && el.texture.effect === 'none'
}

/**
 * A pixel style whose per-cell fragment is exactly the cell square (the same rule that unlocks run
 * merging in shapeGeometry): unrotated squares, full-cell size, no rounding, no tone/jitter
 * scaling. Staged cells of such docs composite as raw 1-cell-per-pixel blits.
 */
export function plainSquarePreviewStyle(s: PixelStyle): boolean {
  const cornerZero = (o: number | null) => o === null || o === 0
  return (
    s.shape === 'square' &&
    s.shapeParams.rotation === 0 &&
    s.angleJitter === 0 &&
    s.sizeX === 1 &&
    s.sizeY === 1 &&
    !s.toneSize &&
    s.sizeJitter === 0 &&
    s.radius === 0 &&
    cornerZero(s.corners.tl) &&
    cornerZero(s.corners.tr) &&
    cornerZero(s.corners.br) &&
    cornerZero(s.corners.bl)
  )
}

/** Cached artwork bitmap + baked background/grid/stroke layers of one CanvasStage. */
export interface StagePaintState {
  art: {
    canvas: HTMLCanvasElement
    w: number
    h: number
    dpr: number
    zoom: number
    x: number
    y: number
    geometry: Geometry | null
  } | null
  bg: HTMLCanvasElement | null
  bgKey: string
  grid: HTMLCanvasElement | null
  gridKey: string
  stroke: HTMLCanvasElement | null
  session: { st: Staging; mode: 'ink' | 'erase'; applied: number[]; key: string } | null
  /** Staging object whose incremental session bailed out (styled/foreign content mid-stroke). */
  dead: Staging | null
  px: {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    img: ImageData
    u32: Uint32Array
    last: number[]
    palette: readonly string[] | undefined
    lut: Uint32Array
  } | null
  colorCache: Map<string, number>
}

export function createStagePaintState(): StagePaintState {
  return {
    art: null,
    bg: null,
    bgKey: '',
    grid: null,
    gridKey: '',
    stroke: null,
    session: null,
    dead: null,
    px: null,
    colorCache: new Map(),
  }
}

export interface StagePaintParams {
  canvas: HTMLCanvasElement | null
  wrap: HTMLElement | null
  state: StagePaintState
  doc: Doc
  geometry: Geometry
  view: { zoom: number; x: number; y: number }
  extent: { w: number; h: number }
  stage: StageTheme
  resolvedTheme: ResolvedTheme
  showGrid: boolean
  gridLinePaths: {
    cell: Path2D
    pixel: Path2D | null
    major: Path2D | null
    half: Path2D | null
  } | null
  gridOverlayPath: Path2D | null
  contourPath: Path2D | null
  showDiffusion: boolean
  tool: string
  /** True while a pencil/eraser drag is in flight (enables the incremental stroke layer). */
  isDrawStroke: boolean
  staging: { current: Staging | null }
  /** Buffer cells stamped since the last composited frame (drained by the stroke layer). */
  delta: { current: number[] | null }
  bw: number
  bh: number
}

/** Buffer cells an ImageData preview may span (16 MB) — bigger docs keep the legacy path. */
export const PX_BUFFER_LIMIT = 4_194_304

/** Identity numbers for layer-cache keys (paths and path bundles are memoized per grid/doc). */
const pathIds = new WeakMap<object, number>()
let nextPathId = 1

export function pathId(o: object | null | undefined): number {
  if (!o) return 0
  let id = pathIds.get(o)
  if (!id) pathIds.set(o, (id = nextPathId++))
  return id
}

export function blit(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement | null,
  size: { w: number; h: number },
): void {
  if (layer) ctx.drawImage(layer, 0, 0, size.w, size.h)
}

/** Any CSS color the palette holds as an ImageData-compatible ABGR word (cached forever). */
export function colorToU32(state: StagePaintState, color: string): number {
  const hit = state.colorCache.get(color)
  if (hit !== undefined) return hit
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return 0
  g.fillStyle = color
  g.fillRect(0, 0, 1, 1)
  const d = g.getImageData(0, 0, 1, 1).data
  const u32 = ((d[3] << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0
  state.colorCache.set(color, u32)
  return u32
}

/** Build one baked screen-space layer (background checkerboard or stroked grid). */
export function buildLayer(
  layer: HTMLCanvasElement,
  size: { dpr: number; w: number; h: number },
  paint: (g: CanvasRenderingContext2D) => void,
): void {
  layer.width = Math.round(size.w * size.dpr)
  layer.height = Math.round(size.h * size.dpr)
  const g = layer.getContext('2d')
  if (!g) return
  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  g.clearRect(0, 0, size.w, size.h)
  paint(g)
}
