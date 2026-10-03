/**
 * 2.5D light bake for the studio templates: a screen-space light direction drives face brightness
 * (pseudo-normal from the face's outward angle) and the orientation of every gradient axis.
 * Everything bakes into plain stops — no blend modes — exactly how the gen3.py / star_v3.svg
 * pipeline shades faces.
 */

import type { RGB } from '../color/color.ts'
import type { Pt } from './types.ts'

export interface LightSetup {
  /** Direction TO the light source, degrees in screen space (y down; −60 ≈ upper right). */
  dirDeg: number
  /** 0..1 floor brightness for faces turned away from the light. */
  ambient: number
  /** Overall contrast of the bake, 0..1 (0 = flat ambient everywhere). */
  strength: number
}

export const DEFAULT_LIGHT: LightSetup = { dirDeg: -60, ambient: 0.35, strength: 0.9 }

/** Outward angle (deg) of a face centroid seen from the figure center — the pseudo-normal. */
export function faceAngle(center: Pt, centroid: Pt): number {
  return (Math.atan2(centroid.y - center.y, centroid.x - center.x) * 180) / Math.PI
}

/** K = ambient + strength·(1−ambient)·max(0, cos(face − light)), clamped to 0..1. */
export function faceBrightness(faceAngleDeg: number, light: LightSetup): number {
  const delta = ((faceAngleDeg - light.dirDeg) * Math.PI) / 180
  const lit = Math.max(0, Math.cos(delta))
  const k = light.ambient + light.strength * (1 - light.ambient) * lit
  return Math.min(1, Math.max(0, k))
}

/** Mix the shaded edge color into the lit base color by brightness k. */
export function shade(edge: RGB, lit: RGB, k: number): RGB {
  const t = Math.min(1, Math.max(0, k))
  return {
    r: edge.r + (lit.r - edge.r) * t,
    g: edge.g + (lit.g - edge.g) * t,
    b: edge.b + (lit.b - edge.b) * t,
  }
}

/** Gradient axis through `center` along the light direction (dark end first). */
export function lightAxis(center: Pt, light: LightSetup, length: number): { p1: Pt; p2: Pt } {
  const phi = (light.dirDeg * Math.PI) / 180
  const dx = Math.cos(phi)
  const dy = Math.sin(phi)
  const half = length / 2
  return {
    p1: { x: center.x - dx * half, y: center.y - dy * half },
    p2: { x: center.x + dx * half, y: center.y + dy * half },
  }
}
