/**
 * Soft layers — the AI-safe equivalent of blur: an ellipse with a radial `stop-opacity` falloff
 * (the exact technique of star_v3.svg's shadow/glow spots). Falloffs use objectBoundingBox units so
 * a squashed ellipse fades elliptically with zero transforms.
 */

import type { RGB } from '../color/color.ts'
import type { GradStop, Paint, Shape, SvgLayer } from './types.ts'

export interface SoftSpot {
  cx: number
  cy: number
  rx: number
  ry: number
  rotation?: number
  color: RGB
  /** Peak alpha at the spot core. */
  alpha: number
  /** 0..1 fraction of the radius that stays at full alpha before the falloff starts (default 0). */
  core?: number
}

/** A glow / shadow / highlight layer built from one soft spot. */
export function softSpotLayer(id: string, name: string, spot: SoftSpot): SvgLayer {
  const core = Math.min(Math.max(spot.core ?? 0, 0), 0.95)
  const stops: GradStop[] = [
    { offset: 0, color: spot.color, alpha: spot.alpha },
    { offset: core, color: spot.color, alpha: spot.alpha },
    { offset: 1, color: spot.color, alpha: 0 },
  ]
  const paint: Paint = {
    kind: 'radial',
    units: 'bbox',
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    fx: null,
    fy: null,
    stops: core <= 0 ? [stops[0], stops[2]] : stops,
    alpha: 1,
  }
  const shape: Shape = {
    kind: 'ellipse',
    cx: { x: spot.cx, y: spot.cy },
    rx: spot.rx,
    ry: spot.ry,
    rotation: spot.rotation ?? 0,
  }
  return { id, name, visible: true, opacity: 1, shape, fills: [paint] }
}
