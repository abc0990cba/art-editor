import type { Pt } from './marching-squares.ts'

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

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

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

/* ------------------------------ path fragment builders ------------------------------ */

function ellipseFrag(cx: number, cy: number, rx: number, ry: number): string {
  let d = `M${fmt(cx - rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy - ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx + rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy + ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx - rx)} ${fmt(cy)}Z`
  return d
}

/**
 * Rounded polygon: fillet every true corner (turns below 10° read as arc samples). Shared with the
 * non-square grid renderer.
 */
export function roundedPolygonPath(poly: Pt[], r: number, chamfer: boolean): string {
  const n = poly.length
  const corners: number[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const d1x = b.x - a.x
    const d1y = b.y - a.y
    const d2x = c.x - b.x
    const d2y = c.y - b.y
    const l1 = Math.hypot(d1x, d1y)
    const l2 = Math.hypot(d2x, d2y)
    if (l1 === 0 || l2 === 0) continue
    const cos = (d1x * d2x + d1y * d2y) / (l1 * l2)
    if (cos < 0.985) corners.push(i) // turn angle above ~10°
  }
  if (corners.length < 3) {
    // degenerate: plain polygon
    return `M${poly.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`
  }
  const isCorner = new Set(corners)
  let d = ''
  let first = true
  for (let i = 0; i < n; i++) {
    if (!isCorner.has(i)) {
      // arc sample between corners: keep it, or the whole curved edge collapses
      // into the straight chord joining the two fillets
      d += `${first ? 'M' : 'L'}${fmt(poly[i].x)} ${fmt(poly[i].y)}`
      first = false
      continue
    }
    const p = poly[i]
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const t = Math.min(r, inLen / 2, outLen / 2)
    const d1x = (p.x - prev.x) / inLen
    const d1y = (p.y - prev.y) / inLen
    const d2x = (next.x - p.x) / outLen
    const d2y = (next.y - p.y) / outLen
    const ax = p.x - d1x * t
    const ay = p.y - d1y * t
    const bx = p.x + d2x * t
    const by = p.y + d2y * t
    d += `${first ? 'M' : 'L'}${fmt(ax)} ${fmt(ay)}`
    first = false
    if (t > 0) {
      const cross = d1x * d2y - d1y * d2x
      d += chamfer
        ? `L${fmt(bx)} ${fmt(by)}`
        : `A${fmt(t)} ${fmt(t)} 0 0 ${cross > 0 ? 1 : 0} ${fmt(bx)} ${fmt(by)}`
    }
  }
  return `${d}Z`
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
