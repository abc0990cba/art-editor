/**
 * Scene model for the SVG studio: an authored stack of shapes, each carrying a stack of paints. The
 * model stores parameters only — serialize.ts bakes everything into the AI-safe SVG subset:
 * absolute coordinates (never `gradientTransform`), softness via `stop-opacity` falloffs, no
 * filters, no blend modes, no masks.
 */

import type { RGB } from '../color/color.ts'

export interface Pt {
  x: number
  y: number
}

/** Axis-aligned bounding box in scene units. */
export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Parametric shapes; rotation is in degrees around `cx`. `poly` holds absolute points (star faces,
 * polygons); `path` is a free contour with its on-curve anchors kept for hit-testing and
 * transforms.
 */
export type Shape =
  | { kind: 'rect'; cx: Pt; w: number; h: number; radius: number; rotation: number }
  | { kind: 'ellipse'; cx: Pt; rx: number; ry: number; rotation: number }
  | { kind: 'star'; cx: Pt; R: number; r: number; points: number; rotation: number }
  | { kind: 'poly'; points: Pt[] }
  | { kind: 'path'; d: string; anchors: Pt[] }

export interface GradStop {
  /** 0..1 position along the gradient axis. */
  offset: number
  color: RGB
  /** 0..1 opacity emitted as `stop-opacity`. */
  alpha: number
}

/**
 * `user`: cx/cy/r (and fx/fy) are scene units — the gradient can be shared across shapes. `bbox`:
 * the values are 0..1 fractions of the shape's bounding box, which yields elliptical falloffs on
 * non-square shapes with zero transforms (the star_v3.svg technique).
 */
export type RadialUnits = 'user' | 'bbox'

export type Paint =
  | { kind: 'solid'; color: RGB; alpha: number }
  | { kind: 'linear'; p1: Pt; p2: Pt; stops: GradStop[]; alpha: number }
  | {
      kind: 'radial'
      units: RadialUnits
      cx: number
      cy: number
      r: number
      /** Focal point (`fx`/`fy`), same coordinate space as cx/cy; null = no focus. */
      fx: number | null
      fy: number | null
      stops: GradStop[]
      alpha: number
    }

/** One scene layer: a shape painted by its fill stack, each fill clipped to the shape. */
export interface SvgLayer {
  id: string
  name: string
  visible: boolean
  /** 0..1, emitted as group opacity. */
  opacity: number
  shape: Shape
  /** Painted bottom-to-top. */
  fills: Paint[]
}

export interface SvgScene {
  width: number
  height: number
  background: Paint | null
  /** Index 0 paints first (bottom of the stack). */
  layers: SvgLayer[]
}
