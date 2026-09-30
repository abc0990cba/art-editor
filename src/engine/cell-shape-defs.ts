/**
 * Cell form registry data: how one painted cell is drawn in `pixels` render mode. `square` keeps
 * the classic fast path in geometry-shape; every other form renders through this family, so canvas,
 * PNG/SVG export and thumbnails all share one implementation. A new form = one entry in CELL_SHAPES +
 * a unit silhouette in cell-shape-geom + a fragment builder in cell-shape-frag + two i18n keys.
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
  | 'moon'
  | 'teardrop'
  | 'flower'
  | 'semicircle'
  | 'gear'
  | 'asterisk'
  | 'lightning'
  | 'chevron'

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
  'moon',
  'teardrop',
  'flower',
  'semicircle',
  'gear',
  'asterisk',
  'lightning',
  'chevron',
] as const satisfies readonly CellShapeId[]

/** Shared shape knobs; every shape reads what it needs and ignores the rest. */
export type ShapeParamKey = 'thickness' | 'points' | 'rotation'

export interface ShapeParams {
  /**
   * Ring wall / cross arm width / star arm slimness / crescent bite, fraction of the cell box,
   * 0.05..0.5
   */
  thickness: number
  /** Star point / flower petal / gear tooth / asterisk arm count, 3..12 */
  points: number
  /** Rotation in degrees around the cell center, 0..360 (circle/ring: no-op) */
  rotation: number
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = { thickness: 0.25, points: 5, rotation: 0 }

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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
  { id: 'moon', params: ['thickness', 'rotation'], curved: true },
  { id: 'teardrop', params: ['rotation'], curved: true },
  { id: 'flower', params: ['points', 'thickness', 'rotation'], curved: true },
  { id: 'semicircle', params: ['rotation'], curved: true },
  { id: 'gear', params: ['points', 'thickness', 'rotation'], curved: false },
  { id: 'asterisk', params: ['points', 'thickness', 'rotation'], curved: false },
  { id: 'lightning', params: ['thickness', 'rotation'], curved: false },
  { id: 'chevron', params: ['thickness', 'rotation'], curved: false },
]

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
