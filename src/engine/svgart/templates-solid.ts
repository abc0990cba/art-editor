/**
 * Solid-form templates (cube, cylinder): per-face N·L shading on plain poly/ellipse layers — the
 * same baked-stop construction as the star, so everything stays AI-safe and editable.
 */

import type { RGB } from '../color/color.ts'
import { mustHex } from './color.ts'
import {
  DEFAULT_LIGHT,
  faceAngle,
  faceBrightness,
  lightAxis,
  shade,
  type LightSetup,
} from './light.ts'
import { rampStops } from './paint.ts'
import { softSpotLayer } from './softlayers.ts'
import type { Paint, Pt, Shape, SvgLayer, SvgScene } from './types.ts'

export interface SolidOptions {
  size: number
  light: LightSetup
  lit: RGB
  base: RGB
  edge: RGB
  bgTop: RGB
  bgBottom: RGB
}

export const CUBE_DEFAULTS: SolidOptions = {
  size: 800,
  light: DEFAULT_LIGHT,
  lit: mustHex('#ffd27a'),
  base: mustHex('#e2882a'),
  edge: mustHex('#7a3f0e'),
  bgTop: mustHex('#f6f1fb'),
  bgBottom: mustHex('#c2b3de'),
}

export const CYLINDER_DEFAULTS: SolidOptions = {
  size: 800,
  light: DEFAULT_LIGHT,
  lit: mustHex('#fff3d6'),
  base: mustHex('#d97a2b'),
  edge: mustHex('#6e3a10'),
  bgTop: mustHex('#20242b'),
  bgBottom: mustHex('#101820'),
}

/** Full-bleed background rect paint (same shape as the star/sphere templates use). */
function backgroundPaint(top: RGB, bottom: RGB): Paint {
  return {
    kind: 'radial',
    units: 'bbox',
    cx: 0.5,
    cy: 0.42,
    r: 0.85,
    fx: null,
    fy: null,
    stops: rampStops(top, bottom, 3, 'oklab'),
    alpha: 1,
  }
}

function rectShape(cx: Pt, w: number, h: number): Shape {
  return { kind: 'rect', cx, w, h, radius: 0, rotation: 0 }
}

/** Zero-black for shadows (kept local to avoid importing 0..1 conventions twice). */
function hexToRgbZero(): RGB {
  return { r: 0, g: 0, b: 0 }
}

/** One shaded poly face: linear ramp along the light axis, dark end first. */
function faceFill(centroid: Pt, center: Pt, o: SolidOptions, span: number): Paint {
  const k = faceBrightness(faceAngle(center, centroid), o.light)
  const axis = lightAxis(centroid, o.light, span)
  const stops = rampStops(
    shade(o.edge, o.lit, Math.max(0, k * 0.75 - 0.08)),
    shade(o.edge, o.lit, Math.min(1, k * 1.2 + 0.08)),
    3,
    'oklab',
  )
  return { kind: 'linear', p1: axis.p1, p2: axis.p2, stops, alpha: 1 }
}

/** Isometric cube: three quad faces shaded by the light, plus floor shadow and background. */
export function cubeScene(o: SolidOptions): SvgScene {
  const c = o.size / 2
  const center: Pt = { x: c, y: c }
  const m = o.size * 0.19
  const k = m / 2
  const top: Pt[] = [
    { x: c, y: c - 2 * k },
    { x: c + m, y: c - k },
    { x: c, y: c },
    { x: c - m, y: c - k },
  ]
  const left: Pt[] = [
    { x: c - m, y: c - k },
    { x: c, y: c },
    { x: c, y: c + m },
    { x: c - m, y: c + m - k },
  ]
  const right: Pt[] = [
    { x: c, y: c },
    { x: c + m, y: c - k },
    { x: c + m, y: c + m - k },
    { x: c, y: c + m },
  ]
  const layers: SvgLayer[] = [
    {
      id: 'bg',
      name: 'Background',
      visible: true,
      opacity: 1,
      shape: rectShape(center, o.size, o.size),
      fills: [backgroundPaint(o.bgTop, o.bgBottom)],
    },
    softSpotLayer('contact-shadow', 'Contact shadow', {
      cx: c,
      cy: c + m * 1.05,
      rx: m * 1.5,
      ry: m * 0.22,
      color: o.edge,
      alpha: 0.35,
    }),
    {
      id: 'face-top',
      name: 'Top',
      visible: true,
      opacity: 1,
      shape: { kind: 'poly', points: top },
      fills: [faceFill({ x: c, y: c - k }, center, o, m * 2)],
    },
    {
      id: 'face-left',
      name: 'Left',
      visible: true,
      opacity: 1,
      shape: { kind: 'poly', points: left },
      fills: [faceFill({ x: c - m / 2, y: c + (m - k) / 2 }, center, o, m * 2)],
    },
    {
      id: 'face-right',
      name: 'Right',
      visible: true,
      opacity: 1,
      shape: { kind: 'poly', points: right },
      fills: [faceFill({ x: c + m / 2, y: c + (m - k) / 2 }, center, o, m * 2)],
    },
  ]
  return { width: o.size, height: o.size, background: null, layers }
}

/** Vertical cylinder: shaded body ramp, lit top disc, darker bottom rim, contact shadow. */
export function cylinderScene(o: SolidOptions): SvgScene {
  const c = o.size / 2
  const center: Pt = { x: c, y: c }
  const R = o.size * 0.22
  const bodyH = o.size * 0.42
  const phi = (o.light.dirDeg * Math.PI) / 180
  const t = Math.min(0.85, Math.max(0.15, 0.5 + 0.32 * Math.cos(phi)))
  const body: Paint = {
    kind: 'linear',
    p1: { x: c - R, y: 0 },
    p2: { x: c + R, y: 0 },
    stops: [
      { offset: 0, color: shade(o.edge, o.lit, 0.3), alpha: 1 },
      { offset: Math.max(0.02, t - 0.22), color: shade(o.edge, o.lit, 0.85), alpha: 1 },
      { offset: t, color: shade(o.edge, o.lit, 1), alpha: 1 },
      { offset: Math.min(0.98, t + 0.3), color: shade(o.edge, o.lit, 0.45), alpha: 1 },
      { offset: 1, color: shade(o.edge, o.lit, 0.22), alpha: 1 },
    ],
    alpha: 1,
  }
  const topPaint: Paint = {
    kind: 'linear',
    p1: { x: 0, y: c - bodyH / 2 - R * 0.35 },
    p2: { x: 0, y: c - bodyH / 2 + R * 0.35 },
    stops: rampStops(o.lit, o.base, 3, 'oklab'),
    alpha: 1,
  }
  const layers: SvgLayer[] = [
    {
      id: 'bg',
      name: 'Background',
      visible: true,
      opacity: 1,
      shape: rectShape(center, o.size, o.size),
      fills: [backgroundPaint(o.bgTop, o.bgBottom)],
    },
    softSpotLayer('contact-shadow', 'Contact shadow', {
      cx: c,
      cy: c + bodyH / 2 + R * 0.18,
      rx: R * 1.15,
      ry: R * 0.2,
      color: hexToRgbZero(),
      alpha: 0.45,
    }),
    {
      id: 'body',
      name: 'Body',
      visible: true,
      opacity: 1,
      shape: rectShape({ x: c, y: c }, R * 2, bodyH),
      fills: [body],
    },
    {
      id: 'bottom',
      name: 'Bottom rim',
      visible: true,
      opacity: 1,
      shape: { kind: 'ellipse', cx: { x: c, y: c + bodyH / 2 }, rx: R, ry: R * 0.35, rotation: 0 },
      fills: [{ kind: 'solid', color: shade(o.edge, o.base, 0.55), alpha: 1 }],
    },
    {
      id: 'top',
      name: 'Top',
      visible: true,
      opacity: 1,
      shape: { kind: 'ellipse', cx: { x: c, y: c - bodyH / 2 }, rx: R, ry: R * 0.35, rotation: 0 },
      fills: [topPaint],
    },
  ]
  return { width: o.size, height: o.size, background: null, layers }
}
