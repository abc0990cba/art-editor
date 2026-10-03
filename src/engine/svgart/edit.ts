/**
 * Pure edit operations behind the studio's canvas interactions: translate/rotate a layer, drag a
 * gradient handle. The feature converts pointer events to scene coordinates and calls these — all
 * geometry decisions stay in the engine, components stay thin.
 */

import { shapeBBox } from './figures.ts'
import { shapeCenter } from './hit.ts'
import type { HandleId } from './hit.ts'
import type { Paint, Pt, Shape, SvgLayer } from './types.ts'

/** Translate any shape by (dx, dy) in scene units. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
    case 'star':
      return { ...shape, cx: { x: shape.cx.x + dx, y: shape.cx.y + dy } }
    case 'poly':
      return { kind: 'poly', points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
    case 'path':
      return {
        kind: 'path',
        d: translatePathData(shape.d, dx, dy),
        anchors: shape.anchors.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      }
  }
}

export function translateLayer(layer: SvgLayer, dx: number, dy: number): SvgLayer {
  return { ...layer, shape: translateShape(layer.shape, dx, dy) }
}

/**
 * Offset every coordinate pair in path data. Covers the generator subset (absolute M/L/C/Z);
 * horizontal/vertical/relative commands never occur in studio-generated contours.
 */
export function translatePathData(d: string, dx: number, dy: number): string {
  return d.replaceAll(/([MLCZ])([^MLCZ]*)/g, (_, cmd: string, args: string) => {
    if (cmd === 'Z') return cmd
    const nums = args
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number)
    const out: string[] = []
    for (let i = 0; i < nums.length; i += 2) {
      const x = nums[i]
      const y = nums[i + 1]
      if (y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
        // Odd trailing number (should not happen in our subset) — pass through untouched.
        out.push(String(x))
        break
      }
      out.push(`${fmt(x + dx)} ${fmt(y + dy)}`)
    }
    return `${cmd}${out.join(' ')}`
  })
}

/** Rotate a layer by `deltaDeg` around its own center (or an explicit pivot). */
export function rotateLayer(layer: SvgLayer, deltaDeg: number, pivot?: Pt): SvgLayer {
  const center = pivot ?? shapeCenter(layer.shape)
  switch (layer.shape.kind) {
    case 'rect':
    case 'ellipse':
    case 'star': {
      const shape = { ...layer.shape, rotation: layer.shape.rotation + deltaDeg }
      if (pivot === undefined) return { ...layer, shape }
      // Keep the external pivot fixed: shift so the center lands where rotation put the old one.
      const before = rotatePt(shapeCenter(layer.shape), center, deltaDeg)
      const after = shapeCenter(shape)
      return { ...layer, shape: translateShape(shape, before.x - after.x, before.y - after.y) }
    }
    case 'poly':
      return {
        ...layer,
        shape: {
          kind: 'poly',
          points: layer.shape.points.map((p) => rotatePt(p, center, deltaDeg)),
        },
      }
    case 'path':
      return {
        ...layer,
        shape: {
          kind: 'path',
          d: rotatePathData(layer.shape.d, center, deltaDeg),
          anchors: layer.shape.anchors.map((p) => rotatePt(p, center, deltaDeg)),
        },
      }
  }
}

function rotatePt(p: Pt, center: Pt, deltaDeg: number): Pt {
  const phi = (deltaDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

/** Rotate every coordinate pair of (our generator subset of) path data around a pivot. */
export function rotatePathData(d: string, center: Pt, deltaDeg: number): string {
  return d.replaceAll(/([MLCZ])([^MLCZ]*)/g, (_, cmd: string, args: string) => {
    if (cmd === 'Z') return cmd
    const nums = args
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number)
    const out: string[] = []
    for (let i = 0; i < nums.length; i += 2) {
      const x = nums[i]
      const y = nums[i + 1]
      if (y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
        out.push(String(x))
        break
      }
      const r = rotatePt({ x, y }, center, deltaDeg)
      out.push(`${fmt(r.x)} ${fmt(r.y)}`)
    }
    return `${cmd}${out.join(' ')}`
  })
}

function fmt(v: number): string {
  const rounded = Math.round(v * 1000) / 1000
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * Apply a dragged gradient handle at scene point `at`. Bbox-fraction radials convert the scene
 * point through the layer shape's bounding box. Returns the layer unchanged for foreign handles.
 */
export function dragHandle(layer: SvgLayer, fillIndex: number, handle: HandleId, at: Pt): SvgLayer {
  const paint = layer.fills[fillIndex]
  if (paint === undefined) return layer
  const fills = layer.fills.slice()
  fills[fillIndex] = applyHandle(paint, handle, at, layer.shape)
  return { ...layer, fills }
}

function applyHandle(paint: Paint, handle: HandleId, at: Pt, shape: Shape): Paint {
  if (paint.kind === 'linear') {
    if (handle === 'linear-p1') return { ...paint, p1: at }
    if (handle === 'linear-p2') return { ...paint, p2: at }
    return paint
  }
  if (paint.kind !== 'radial') return paint
  if (paint.units === 'bbox') {
    const bb = shapeBBox(shape)
    const frac = { x: (at.x - bb.x) / (bb.w || 1), y: (at.y - bb.y) / (bb.h || 1) }
    return applyRadialHandle(paint, handle, frac, true)
  }
  return applyRadialHandle(paint, handle, at, false)
}

function applyRadialHandle(
  paint: Extract<Paint, { kind: 'radial' }>,
  handle: HandleId,
  at: Pt,
  fractions: boolean,
): Paint {
  const clampFrac = (v: number): number => Math.min(1.5, Math.max(-0.5, v))
  const x = fractions ? clampFrac(at.x) : at.x
  const y = fractions ? clampFrac(at.y) : at.y
  switch (handle) {
    case 'radial-center':
      return { ...paint, cx: x, cy: y }
    case 'radial-rim': {
      const r = Math.hypot(at.x - paint.cx, at.y - paint.cy)
      return { ...paint, r: fractions ? clampFrac(r) : Math.max(1, r) }
    }
    case 'radial-focus':
      return { ...paint, fx: x, fy: y }
    default:
      return paint
  }
}
