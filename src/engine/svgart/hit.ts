/**
 * Pure hit-testing for the studio stage: point-in-shape and the named canvas handles of a paint.
 * Screen↔scene coordinate conversion lives in the feature; everything here is scene-space math.
 */

import { shapeBBox, starPoints } from './figures.ts'
import type { Paint, Pt, Shape, SvgLayer, SvgScene } from './types.ts'

export type HandleId = 'linear-p1' | 'linear-p2' | 'radial-center' | 'radial-rim' | 'radial-focus'

export interface Handle {
  id: HandleId
  at: Pt
}

/** Even-odd ray casting (matches `fill-rule="evenodd"` for our simple contours). */
function pointInPolygon(pts: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function localPoint(cx: Pt, rotation: number, p: Pt): Pt {
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(-phi)
  const sin = Math.sin(-phi)
  const dx = p.x - cx.x
  const dy = p.y - cx.y
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

export function pointInShape(shape: Shape, p: Pt): boolean {
  switch (shape.kind) {
    case 'rect': {
      const l = localPoint(shape.cx, shape.rotation, p)
      return Math.abs(l.x) <= Math.abs(shape.w) / 2 && Math.abs(l.y) <= Math.abs(shape.h) / 2
    }
    case 'ellipse': {
      const l = localPoint(shape.cx, shape.rotation, p)
      const rx = Math.max(shape.rx, 1e-6)
      const ry = Math.max(shape.ry, 1e-6)
      return (l.x / rx) ** 2 + (l.y / ry) ** 2 <= 1
    }
    case 'star':
      return pointInPolygon(starPoints(shape.cx, shape.R, shape.r, shape.points, shape.rotation), p)
    case 'poly':
      return pointInPolygon(shape.points, p)
    case 'path':
      return pointInPolygon(shape.anchors, p)
  }
}

/** Topmost visible layer whose shape contains `p` (layers paint bottom-to-top). */
export function topLayerAt(scene: SvgScene, p: Pt): SvgLayer | null {
  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i]
    if (layer.visible && pointInShape(layer.shape, p)) return layer
  }
  return null
}

/** Handles of one paint in scene coordinates; `shape` maps bbox-fraction radials to the canvas. */
export function fillHandles(shape: Shape, paint: Paint): Handle[] {
  if (paint.kind !== 'radial') {
    if (paint.kind !== 'linear') return []
    return [
      { id: 'linear-p1', at: paint.p1 },
      { id: 'linear-p2', at: paint.p2 },
    ]
  }
  if (paint.units === 'user') {
    const handles: Handle[] = [
      { id: 'radial-center', at: { x: paint.cx, y: paint.cy } },
      { id: 'radial-rim', at: { x: paint.cx + paint.r, y: paint.cy } },
    ]
    if (paint.fx !== null && paint.fy !== null)
      handles.push({ id: 'radial-focus', at: { x: paint.fx, y: paint.fy } })
    return handles
  }
  const bb = shapeBBox(shape)
  const at = (fx: number, fy: number): Pt => ({ x: bb.x + fx * bb.w, y: bb.y + fy * bb.h })
  const handles: Handle[] = [
    { id: 'radial-center', at: at(paint.cx, paint.cy) },
    { id: 'radial-rim', at: at(paint.cx + paint.r, paint.cy) },
  ]
  if (paint.fx !== null && paint.fy !== null)
    handles.push({ id: 'radial-focus', at: at(paint.fx, paint.fy) })
  return handles
}

/** Nearest handle within `tol` scene units, or null. */
export function nearestHandle(handles: Handle[], p: Pt, tol: number): Handle | null {
  let best: Handle | null = null
  let bestDist = tol
  for (const h of handles) {
    const d = Math.hypot(h.at.x - p.x, h.at.y - p.y)
    if (d <= bestDist) {
      best = h
      bestDist = d
    }
  }
  return best
}

/** Geometric center used as the rotation/move pivot. */
export function shapeCenter(shape: Shape): Pt {
  const bb = shapeBBox(shape)
  return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }
}
