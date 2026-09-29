import type { Pt } from './marching-squares.ts'
import { fmt, roundedPolygonPath } from './poly-path.ts'

/**
 * Cell form registry: how one painted cell is drawn in `pixels` render mode. `square` keeps the
 * classic fast path in geometry-shape; every other form renders through this module, so canvas,
 * PNG/SVG export and thumbnails all share one implementation. A new form = one entry in CELL_SHAPES +
 * a unit polygon (or curve branch in cellShapeFragment) + two i18n keys.
 */

export type CellShapeId =
  | 'square'
  | 'circle'
  | 'ring'
  | 'triangle'
  | 'triangleDown'
  | 'diamond'
  | 'cross'
  | 'xCross'
  | 'star'
  | 'sparkle'
  | 'hexagon'
  | 'heart'

/** Picker/display order. */
export const CELL_SHAPE_IDS = [
  'square',
  'circle',
  'ring',
  'triangle',
  'triangleDown',
  'diamond',
  'cross',
  'xCross',
  'star',
  'sparkle',
  'hexagon',
  'heart',
] as const satisfies readonly CellShapeId[]

/** Shared shape knobs; every shape reads what it needs and ignores the rest. */
export type ShapeParamKey = 'thickness' | 'points' | 'rotation'

export interface ShapeParams {
  /** Ring wall / cross arm width / star arm slimness, fraction of the cell box, 0.05..0.5 */
  thickness: number
  /** Star point count, 3..12 */
  points: number
  /** Rotation in degrees around the cell center, 0..360 (circle/ring: no-op) */
  rotation: number
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = { thickness: 0.25, points: 5, rotation: 0 }

interface CellShapeDef {
  id: CellShapeId
  /** Params the shape exposes in the UI, in display order */
  params: readonly ShapeParamKey[]
  /** Curved forms ignore the corner-radius knob (the UI dims it) */
  curved: boolean
}

export const CELL_SHAPES: readonly CellShapeDef[] = [
  { id: 'square', params: ['rotation'], curved: false },
  { id: 'circle', params: [], curved: true },
  { id: 'ring', params: ['thickness'], curved: true },
  { id: 'triangle', params: ['rotation'], curved: false },
  { id: 'triangleDown', params: ['rotation'], curved: false },
  { id: 'diamond', params: ['rotation'], curved: false },
  { id: 'cross', params: ['thickness', 'rotation'], curved: false },
  { id: 'xCross', params: ['thickness', 'rotation'], curved: false },
  { id: 'star', params: ['points', 'thickness', 'rotation'], curved: false },
  { id: 'sparkle', params: ['thickness', 'rotation'], curved: false },
  { id: 'hexagon', params: ['rotation'], curved: false },
  { id: 'heart', params: ['rotation'], curved: true },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function isCellShapeId(v: unknown): v is CellShapeId {
  return (CELL_SHAPE_IDS as readonly unknown[]).includes(v)
}

export function normalizeShapeParams(raw: unknown): ShapeParams {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<ShapeParams>
  const rot = Number(p.rotation)
  return {
    thickness: clamp(Number(p.thickness ?? DEFAULT_SHAPE_PARAMS.thickness), 0.05, 0.5),
    points: clamp(Math.round(Number(p.points) || DEFAULT_SHAPE_PARAMS.points), 3, 12),
    rotation: Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : DEFAULT_SHAPE_PARAMS.rotation,
  }
}

export function sameShapeParams(a: ShapeParams, b: ShapeParams): boolean {
  return a.thickness === b.thickness && a.points === b.points && a.rotation === b.rotation
}

/** Params the settings UI shows for a shape, in display order. */
export function paramsOf(id: CellShapeId): readonly ShapeParamKey[] {
  return CELL_SHAPES.find((d) => d.id === id)?.params ?? []
}

/** Curved shapes ignore the corner-radius knob. */
export function isCurvedShape(id: CellShapeId): boolean {
  return CELL_SHAPES.find((d) => d.id === id)?.curved ?? false
}

/* ------------------------------ unit form geometry ------------------------------ */

type UnitPt = [number, number]

const TRIANGLE: UnitPt[] = [
  [0.5, 0],
  [1, 1],
  [0, 1],
]
const TRIANGLE_DOWN: UnitPt[] = [
  [0, 0],
  [1, 0],
  [0.5, 1],
]
const DIAMOND: UnitPt[] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
]
const HEXAGON: UnitPt[] = [
  [0.5, 0],
  [0.933, 0.25],
  [0.933, 0.75],
  [0.5, 1],
  [0.067, 0.75],
  [0.067, 0.25],
]
const SQUARE: UnitPt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
/** Cubic heart: anchor + 6 × (control, control, anchor). */
const HEART: UnitPt[] = [
  [0.5, 0.93],
  [0.1, 0.64],
  [0, 0.45],
  [0, 0.3],
  [0, 0.11],
  [0.16, 0],
  [0.31, 0],
  [0.41, 0],
  [0.47, 0.06],
  [0.5, 0.12],
  [0.53, 0.06],
  [0.59, 0],
  [0.69, 0],
  [0.84, 0],
  [1, 0.11],
  [1, 0.3],
  [1, 0.45],
  [0.9, 0.64],
  [0.5, 0.93],
]

/** Star polygon: `points` outer vertices at radius 0.5, inner vertices at `inner`. */
function starPoly(points: number, inner: number): UnitPt[] {
  const n = Math.max(3, Math.round(points))
  const rIn = clamp(inner, 0.05, 0.5)
  const pts: UnitPt[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 0.5 : rIn
    const a = -Math.PI / 2 + (Math.PI * i) / n
    pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)])
  }
  return pts
}

/** Plus (diagonal=false) or × (diagonal=true) with arms `hw` half-width wide. */
function crossPoly(hw: number, diagonal: boolean): UnitPt[] {
  const w = clamp(hw, 0.025, 0.25)
  const pts: UnitPt[] = [
    [0.5 - w, 0],
    [0.5 + w, 0],
    [0.5 + w, 0.5 - w],
    [1, 0.5 - w],
    [1, 0.5 + w],
    [0.5 + w, 0.5 + w],
    [0.5 + w, 1],
    [0.5 - w, 1],
    [0.5 - w, 0.5 + w],
    [0, 0.5 + w],
    [0, 0.5 - w],
    [0.5 - w, 0.5 - w],
  ]
  if (!diagonal) return pts
  const c = Math.SQRT1_2
  return pts.map(([px, py]) => {
    const dx = px - 0.5
    const dy = py - 0.5
    return [0.5 + dx * c - dy * c, 0.5 + dx * c + dy * c]
  })
}

/* ------------------------------ silhouette hit tests ------------------------------ */

/** Even-odd ray-cast point-in-polygon on unit-space points. */
function unitPolyHit(poly: readonly UnitPt[], u: number, v: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Cubic heart flattened to a polygon for hit tests (same control points as the rendered path). */
function heartPoly(samples = 6): UnitPt[] {
  const pts: UnitPt[] = [HEART[0]]
  for (let seg = 1; seg < HEART.length; seg += 3) {
    const [p0x, p0y] = HEART[seg - 1]
    const [c1x, c1y] = HEART[seg]
    const [c2x, c2y] = HEART[seg + 1]
    const [p1x, p1y] = HEART[seg + 2]
    for (let k = 1; k <= samples; k++) {
      const t = k / samples
      const m = 1 - t
      pts.push([
        m * m * m * p0x + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * p1x,
        m * m * m * p0y + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * p1y,
      ])
    }
  }
  return pts
}

const HEART_HITS = heartPoly()

/** Unit silhouette of the polygonal forms (square/circle/ring/heart have analytic hits). */
function unitFormPoly(
  id: 'triangle' | 'triangleDown' | 'diamond' | 'hexagon' | 'cross' | 'xCross' | 'star' | 'sparkle',
  p: ShapeParams,
): UnitPt[] {
  switch (id) {
    case 'triangle': {
      return TRIANGLE
    }
    case 'triangleDown': {
      return TRIANGLE_DOWN
    }
    case 'diamond': {
      return DIAMOND
    }
    case 'hexagon': {
      return HEXAGON
    }
    case 'cross': {
      return crossPoly(p.thickness / 2, false)
    }
    case 'xCross': {
      return crossPoly(p.thickness / 2, true)
    }
    case 'star': {
      return starPoly(p.points, p.thickness)
    }
    case 'sparkle': {
      return starPoly(4, clamp(p.thickness * 0.7, 0.05, 0.5))
    }
  }
}

/**
 * Whether the point (u, v) in the unit cell box lies inside the form. Rotation turns the point
 * against the unrotated silhouette; ring relies on its wall thickness; radius/chamfer (polygon
 * corner rounding) are ignored — hit tests serve tone-scale rasters where corners stay sharp.
 */
export function cellShapeHit(id: CellShapeId, u: number, v: number, p: ShapeParams): boolean {
  const rad = (-p.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = u - 0.5
  const dy = v - 0.5
  const x = 0.5 + dx * cos - dy * sin
  const y = 0.5 + dx * sin + dy * cos
  if (id === 'square') {
    return x >= 0 && x <= 1 && y >= 0 && y <= 1
  }
  if (id === 'circle') {
    return (x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) <= 0.25
  }
  if (id === 'ring') {
    const r = Math.hypot(x - 0.5, y - 0.5)
    return r <= 0.5 && r >= 0.5 - clamp(p.thickness, 0.05, 0.5)
  }
  if (id === 'heart') {
    return unitPolyHit(HEART_HITS, x, y)
  }
  return unitPolyHit(unitFormPoly(id, p), x, y)
}

/* ------------------------------ path fragment builders ------------------------------ */

function ellipseFrag(cx: number, cy: number, rx: number, ry: number): string {
  let d = `M${fmt(cx - rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy - ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx + rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy + ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx - rx)} ${fmt(cy)}Z`
  return d
}

/** Scale unit points into the cell box, then rotate the result about the box center. */
function placePoints(unit: readonly UnitPt[], box: Box, rotDeg: number): Pt[] {
  const rad = (rotDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return unit.map(([ux, uy]) => {
    const dx = box.x + ux * box.w - cx
    const dy = box.y + uy * box.h - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

function polyFrag(unit: readonly UnitPt[], pl: CellShapePlacement): string {
  const pts = placePoints(unit, pl, pl.params.rotation)
  return roundedPolygonPath(pts, pl.radius * Math.min(pl.w, pl.h), pl.chamfer)
}

/** The star arm slimness maps straight onto the inner vertex radius. */
function starUnit(p: ShapeParams): UnitPt[] {
  return starPoly(p.points, p.thickness)
}

/** Where and how one form is drawn: a cell box plus the style knobs that shape it. */
export interface CellShapePlacement {
  id: CellShapeId
  x: number
  y: number
  w: number
  h: number
  params: ShapeParams
  /** PixelStyle.radius (0..0.5): rounds polygonal corners; curved forms ignore it */
  radius: number
  /** Polygon corners render as straight 45° cuts instead of arcs */
  chamfer: boolean
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Path fragment of one non-square cell form filling the placement box. Rings rely on the renderer's
 * evenodd fill rule for the hole.
 */
export function cellShapeFragment(pl: CellShapePlacement): string {
  const { x, y, w, h } = pl
  const cx = x + w / 2
  const cy = y + h / 2
  const p = pl.params
  switch (pl.id) {
    case 'circle':
      return ellipseFrag(cx, cy, w / 2, h / 2)
    case 'ring': {
      const wall = clamp(p.thickness, 0.05, 0.5) * Math.min(w, h)
      return (
        ellipseFrag(cx, cy, w / 2, h / 2) +
        ellipseFrag(cx, cy, Math.max(0.02, w / 2 - wall), Math.max(0.02, h / 2 - wall))
      )
    }
    case 'heart': {
      const pts = placePoints(HEART, pl, p.rotation)
      let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`
      for (let i = 1; i < pts.length; i += 3) {
        d += `C${fmt(pts[i].x)} ${fmt(pts[i].y)} ${fmt(pts[i + 1].x)} ${fmt(pts[i + 1].y)} ${fmt(pts[i + 2].x)} ${fmt(pts[i + 2].y)}`
      }
      return `${d}Z`
    }
    case 'square':
      return polyFrag(SQUARE, pl)
    case 'triangle':
      return polyFrag(TRIANGLE, pl)
    case 'triangleDown':
      return polyFrag(TRIANGLE_DOWN, pl)
    case 'diamond':
      return polyFrag(DIAMOND, pl)
    case 'cross':
      return polyFrag(crossPoly(p.thickness / 2, false), pl)
    case 'xCross':
      return polyFrag(crossPoly(p.thickness / 2, true), pl)
    case 'star':
      return polyFrag(starUnit(p), pl)
    case 'sparkle':
      return polyFrag(starPoly(4, clamp(p.thickness * 0.7, 0.05, 0.5)), pl)
    case 'hexagon':
      return polyFrag(HEXAGON, pl)
  }
}

/** Normalized icon path for UI pickers: the form drawn inside a size × size box. */
export function shapePreviewPath(
  id: CellShapeId,
  size: number,
  p: ShapeParams = DEFAULT_SHAPE_PARAMS,
): string {
  const inset = Math.max(1, size * 0.1)
  const s = size - inset * 2
  return cellShapeFragment({
    id,
    x: inset,
    y: inset,
    w: s,
    h: s,
    params: p,
    radius: 0,
    chamfer: false,
  })
}
