import type { Doc, Link } from './doc.ts'
import { buildGrid } from './grids-builders.ts'
import type { Pt } from './marching-squares.ts'

export type GridType = 'square' | 'hex' | 'triangle' | 'radial'

export const GRID_TYPES: GridType[] = ['square', 'hex', 'triangle', 'radial']

/**
 * Cell lattice for a grid type. Square keeps the historical cols×rows lattice used by the square
 * pipelines; the other grids expose per-cell centers, polygons, hit-testing and generic
 * edge-neighbor maps so tools and rendering work on any cell shape.
 */
export interface Grid {
  type: GridType
  cols: number
  rows: number
  w: number
  h: number
  count: number
  center(i: number): Pt
  polygon(i: number): Pt[]
  cellAt(x: number, y: number): number
  edgeNeighbors(i: number): number[]
  /** Polar coordinates of the cell center relative to the canvas center (for symmetry) */
  radiusOf(i: number): number
  angleOf(i: number): number
  /** Cell on the same radius ring closest to the target angle (-1 when none) */
  cellByAngle(i: number, targetAngle: number): number
}

const cache = new Map<string, Grid>()

export function makeGrid(type: GridType, cols: number, rows: number, even = false): Grid {
  const key = `${type}:${cols}:${rows}:${even ? 'e' : 'u'}`
  let g = cache.get(key)
  if (!g) {
    g = buildGrid(type, cols, rows, even)
    cache.set(key, g)
  }
  return g
}

/** Canvas extent of a document grid. */
export function docSize(type: GridType, cols: number, rows: number): { w: number; h: number } {
  const g = makeGrid(type, cols, rows)
  return { w: g.w, h: g.h }
}

function normalized(p: Pt, fromW: number, fromH: number, toW: number, toH: number): Pt {
  return { x: (p.x / fromW) * toW, y: (p.y / fromH) * toH }
}

function endpointPoint(l: Link, which: 'a' | 'b', grid: Grid, square: boolean): Pt {
  if (square) {
    return which === 'a' ? { x: l.ax + 0.5, y: l.ay + 0.5 } : { x: l.bx + 0.5, y: l.by + 0.5 }
  }
  return grid.center(which === 'a' ? l.ax : l.bx)
}

/**
 * Everything a grid conversion needs: the new→old cell index map plus both grids, shared by the
 * flat convertGridDoc and the scene-tree remap (engine/scene.ts).
 */
export interface GridConvertMap {
  /** New cell index → old cell index, -1 when the new cell has no source */
  map: Int32Array
  oldGrid: Grid
  newGrid: Grid
  oldSquare: boolean
  toSquare: boolean
  toCols: number
  toRows: number
  toEven: boolean
}

/** Build the sampling map for converting a document to another grid type/size. */
export function gridConvertMap(
  doc: Pick<Doc, 'gridType' | 'cols' | 'rows' | 'sub' | 'radialEven'>,
  gridType: GridType,
  cols?: number,
  rows?: number,
  even?: boolean,
): GridConvertMap {
  const toCols = cols ?? doc.cols
  const toRows = rows ?? doc.rows
  const toEven = gridType === 'radial' ? (even ?? doc.radialEven) : false
  const oldSquare = doc.gridType === 'square'
  const oldCols = oldSquare ? doc.cols * doc.sub : doc.cols
  const oldRows = oldSquare ? doc.rows * doc.sub : doc.rows
  const oldGrid = makeGrid(
    doc.gridType,
    oldCols,
    oldRows,
    doc.gridType === 'radial' && doc.radialEven,
  )
  const newGrid = makeGrid(gridType, toCols, toRows, toEven)
  const map = new Int32Array(newGrid.count).fill(-1)
  for (let i = 0; i < newGrid.count; i++) {
    const c = normalized(newGrid.center(i), newGrid.w, newGrid.h, oldGrid.w, oldGrid.h)
    map[i] = oldGrid.cellAt(c.x, c.y)
  }
  return {
    map,
    oldGrid,
    newGrid,
    oldSquare,
    toSquare: gridType === 'square',
    toCols,
    toRows,
    toEven,
  }
}

/** Map one connector onto the target grid; null = collapsed or out of the grid. */
export function convertLink(l: Link, m: GridConvertMap): Link | null {
  const pa = normalized(
    endpointPoint(l, 'a', m.oldGrid, m.oldSquare),
    m.oldGrid.w,
    m.oldGrid.h,
    m.newGrid.w,
    m.newGrid.h,
  )
  const pb = normalized(
    endpointPoint(l, 'b', m.oldGrid, m.oldSquare),
    m.oldGrid.w,
    m.oldGrid.h,
    m.newGrid.w,
    m.newGrid.h,
  )
  const ia = m.newGrid.cellAt(pa.x, pa.y)
  const ib = m.newGrid.cellAt(pb.x, pb.y)
  if (ia < 0 || ib < 0 || ia === ib) return null
  if (m.toSquare) {
    const acol = ia % m.toCols
    const arow = Math.floor(ia / m.toCols)
    const bcol = ib % m.toCols
    const brow = Math.floor(ib / m.toCols)
    return { ax: acol, ay: arow, bx: bcol, by: brow, v: l.v, obj: l.obj }
  }
  return { ax: ia, ay: 0, bx: ib, by: 0, v: l.v, obj: l.obj }
}

/** Rebuild cells/links for a different grid type or size, sampling the old artwork. */
export function convertGridDoc(
  doc: Doc,
  gridType: GridType,
  cols?: number,
  rows?: number,
  even?: boolean,
): Doc {
  const m = gridConvertMap(doc, gridType, cols, rows, even)
  const cells = new Uint16Array(m.newGrid.count)
  const cellObj = doc.cellObj ? new Uint32Array(m.newGrid.count) : null
  for (let i = 0; i < m.newGrid.count; i++) {
    const j = m.map[i]
    if (j >= 0) {
      cells[i] = doc.cells[j]
      if (cellObj && doc.cellObj) cellObj[i] = doc.cellObj[j]
    }
  }

  const links: Link[] = []
  for (const l of doc.links) {
    const mapped = convertLink(l, m)
    if (mapped) links.push(mapped)
  }

  return {
    ...doc,
    gridType,
    cols: m.toCols,
    rows: m.toRows,
    sub: m.toSquare ? doc.sub : 1,
    radialEven: m.toEven,
    cells,
    cellObj,
    links,
  }
}
