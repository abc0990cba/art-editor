/**
 * Defensive scene reader for IndexedDB round-trips and template params: validates every kind
 * discriminator, clamps numbers into range, drops malformed entries, and fills generated ids.
 * Anything that cannot be repaired is skipped — a stored scene always normalizes to a valid one.
 */

import type { RGB } from '../color/color.ts'
import { hexColor, rgbToHex } from './color.ts'
import { blankScene } from './templates.ts'
import type { GradStop, Paint, Pt, RadialUnits, Shape, SvgLayer, SvgScene } from './types.ts'

export function normalizeScene(raw: unknown, fallbackSize = 800): SvgScene {
  if (typeof raw !== 'object' || raw === null) return blankScene(fallbackSize)
  const o = raw as Record<string, unknown>
  const width = positive(o['width']) ?? fallbackSize
  const height = positive(o['height']) ?? fallbackSize
  const background =
    o['background'] === null
      ? null
      : (normalizePaint(o['background']) ?? blankScene(width).background)
  const layers = Array.isArray(o['layers']) ? o['layers'] : []
  return {
    width,
    height,
    background,
    layers: layers.map((l, i) => normalizeLayer(l, i)).filter((l): l is SvgLayer => l !== null),
  }
}

export function normalizeLayer(raw: unknown, index: number): SvgLayer | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const shape = normalizeShape(o['shape'])
  if (shape === null) return null
  const fills = Array.isArray(o['fills'])
    ? o['fills'].map(normalizePaint).filter((p): p is Paint => p !== null)
    : []
  return {
    id: typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `layer-${index}`,
    name: typeof o['name'] === 'string' && o['name'] !== '' ? o['name'] : `Layer ${index + 1}`,
    visible: o['visible'] !== false,
    opacity: clamp(o['opacity'], 0, 1, 1),
    shape,
    fills,
  }
}

export function normalizeShape(raw: unknown): Shape | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  switch (o['kind']) {
    case 'rect':
      return rectShape(o)
    case 'ellipse':
      return ellipseShape(o)
    case 'star':
      return starShape(o)
    case 'poly':
      return polyShape(o)
    case 'path':
      return pathShape(o)
    default:
      return null
  }
}

function rectShape(o: Record<string, unknown>): Shape {
  return {
    kind: 'rect',
    cx: pt(o['cx']) ?? { x: 0, y: 0 },
    w: positive(o['w']) ?? 10,
    h: positive(o['h']) ?? 10,
    radius: clamp(o['radius'], 0, 1e6, 0),
    rotation: finite(o['rotation'], 0),
  }
}

function ellipseShape(o: Record<string, unknown>): Shape {
  return {
    kind: 'ellipse',
    cx: pt(o['cx']) ?? { x: 0, y: 0 },
    rx: positive(o['rx']) ?? 10,
    ry: positive(o['ry']) ?? 10,
    rotation: finite(o['rotation'], 0),
  }
}

function starShape(o: Record<string, unknown>): Shape {
  return {
    kind: 'star',
    cx: pt(o['cx']) ?? { x: 0, y: 0 },
    R: positive(o['R']) ?? 10,
    r: positive(o['r']) ?? 5,
    points: clamp(o['points'], 2, 40, 5),
    rotation: finite(o['rotation'], 0),
  }
}

function polyShape(o: Record<string, unknown>): Shape | null {
  const points = Array.isArray(o['points'])
    ? o['points'].map(pt).filter((p): p is Pt => p !== null)
    : []
  return points.length >= 3 ? { kind: 'poly', points } : null
}

function pathShape(o: Record<string, unknown>): Shape | null {
  const anchors = Array.isArray(o['anchors'])
    ? o['anchors'].map(pt).filter((p): p is Pt => p !== null)
    : []
  if (typeof o['d'] !== 'string' || anchors.length < 3) return null
  return { kind: 'path', d: o['d'], anchors }
}

export function normalizePaint(raw: unknown): Paint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const alpha = clamp(o['alpha'], 0, 1, 1)
  switch (o['kind']) {
    case 'solid': {
      const color = rgb(o['color'])
      return color === null ? null : { kind: 'solid', color, alpha }
    }
    case 'linear': {
      const p1 = pt(o['p1'])
      const p2 = pt(o['p2'])
      if (p1 === null || p2 === null) return null
      return { kind: 'linear', p1, p2, stops: stops(o['stops']), alpha }
    }
    case 'radial': {
      const units: RadialUnits = o['units'] === 'user' ? 'user' : 'bbox'
      const fx = finite(o['fx'], NaN)
      const fy = finite(o['fy'], NaN)
      return {
        kind: 'radial',
        units,
        cx: finite(o['cx'], 0.5),
        cy: finite(o['cy'], 0.5),
        r: positive(o['r']) ?? 0.5,
        fx: Number.isNaN(fx) || Number.isNaN(fy) ? null : fx,
        fy: Number.isNaN(fy) ? null : fy,
        stops: stops(o['stops']),
        alpha,
      }
    }
    default:
      return null
  }
}

function stops(raw: unknown): GradStop[] {
  if (!Array.isArray(raw)) return [{ offset: 0, color: { r: 0, g: 0, b: 0 }, alpha: 1 }]
  const out = raw
    .map((s) => {
      if (typeof s !== 'object' || s === null) return null
      const o = s as Record<string, unknown>
      return {
        offset: clamp(o['offset'], 0, 1, 0),
        color: rgb(o['color']) ?? { r: 0, g: 0, b: 0 },
        alpha: clamp(o['alpha'], 0, 1, 1),
      }
    })
    .filter((s): s is GradStop => s !== null)
  out.sort((a, b) => a.offset - b.offset)
  return out.length > 0 ? out : [{ offset: 0, color: { r: 0, g: 0, b: 0 }, alpha: 1 }]
}

function pt(raw: unknown): Pt | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  return { x: finite(o['x'], 0), y: finite(o['y'], 0) }
}

function rgb(raw: unknown): RGB | null {
  if (typeof raw === 'string') return hexColor(raw.trim())
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  return { r: clamp(o['r'], 0, 1, 0), g: clamp(o['g'], 0, 1, 0), b: clamp(o['b'], 0, 1, 0) }
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = finite(v, fallback)
  return Math.min(max, Math.max(min, n))
}

/** Hex string of any paint's first stop color — used for thumbnails and layer chips. */
export function paintPreviewHex(paint: Paint): string {
  if (paint.kind === 'solid') return rgbToHex(paint.color)
  const first = paint.stops[0]
  return rgbToHex(first === undefined ? { r: 0, g: 0, b: 0 } : first.color)
}
