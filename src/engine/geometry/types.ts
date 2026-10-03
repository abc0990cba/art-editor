import type { Link } from '../core/doc.ts'

export interface StyledPath {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface Geometry {
  paths: StyledPath[]
}

export interface Staging {
  /** Buffer index -> value (null = erase) applied on top of doc.cells */
  cells?: ReadonlyMap<number, number | null>
  /**
   * Typed fast path of `cells` for shape drags: a full-buffer overlay of palette values (0 =
   * unstaged; shape drags stage ink only, never erases). When present with an empty `cells`, the
   * ink lives here — frame paths read the dirty rows directly and the Maps are materialized once at
   * commit (or when a legacy preview path needs them).
   */
  cellsBuf?: {
    cells: Uint16Array
    bw: number
    bh: number
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  /** Replaces doc.links entirely when provided (preview) */
  links?: readonly Link[]
  /** Element ids (null = clear) merged over doc.cellObj for the staged cells */
  objs?: ReadonlyMap<number, number | null>
  /**
   * Palette the staged values refer to — shape fills/strokes may resolve colors that only join
   * doc.palette at commit, so the preview needs the future palette to paint them with their real
   * colors.
   */
  palette?: readonly string[]
  /**
   * Scene docs: the layer staged INK belongs to (the active layer). Staged erases on other layers
   * are routed by each cell's composite owner instead, which keeps a multi-layer move preview
   * honest.
   */
  layerId?: number
}
