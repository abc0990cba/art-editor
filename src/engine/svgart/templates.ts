/**
 * Light-driven starter scenes for the studio. Every generator returns ordinary editable layers — no
 * procedural magic survives into the scene — built from the construction star_v3.svg proven in
 * Illustrator: background ramp, floor shadows as soft spots, halo, per-face gradient fills baked
 * from a light setup.
 */

import type { RGB } from '../color/color.ts'
import { mustHex } from './color.ts'
import { mulberry32, starPoints } from './figures.ts'
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
import type { GradStop, Paint, Pt, Shape, SvgLayer, SvgScene } from './types.ts'

export type TemplateId = 'blank' | 'star' | 'sphere' | 'aurora'

export interface StarOptions {
  size: number
  points: number
  innerRatio: number
  rotationDeg: number
  light: LightSetup
  lit: RGB
  edge: RGB
  sheen: RGB
  bgTop: RGB
  bgBottom: RGB
  floor: boolean
}

export const STAR_DEFAULTS: StarOptions = {
  size: 800,
  points: 5,
  innerRatio: 0.42,
  rotationDeg: 0,
  light: DEFAULT_LIGHT,
  lit: mustHex('#f2a33c'),
  edge: mustHex('#8a4a12'),
  sheen: mustHex('#ffe3a6'),
  bgTop: mustHex('#f6f1fb'),
  bgBottom: mustHex('#c2b3de'),
  floor: true,
}

export interface SphereOptions {
  size: number
  light: LightSetup
  lit: RGB
  base: RGB
  edge: RGB
  bgTop: RGB
  bgBottom: RGB
}

export const SPHERE_DEFAULTS: SphereOptions = {
  size: 800,
  light: DEFAULT_LIGHT,
  lit: mustHex('#fff3d6'),
  base: mustHex('#e2882a'),
  edge: mustHex('#6e3a10'),
  bgTop: mustHex('#20242b'),
  bgBottom: mustHex('#101820'),
}

export interface AuroraOptions {
  size: number
  seed: number
  nightTop: RGB
  night: RGB
  hues: RGB[]
}

export const AURORA_DEFAULTS: AuroraOptions = {
  size: 800,
  seed: 7,
  nightTop: mustHex('#0b1026'),
  night: mustHex('#1a1033'),
  hues: [mustHex('#38e8b0'), mustHex('#7a5cff'), mustHex('#ff6ec7'), mustHex('#4fc3ff')],
}

/** Registry entry for the creation dialog (labels live in i18n). */
export const TEMPLATE_IDS: TemplateId[] = ['blank', 'star', 'sphere', 'aurora']

export function templateScene(id: TemplateId, size = 800): SvgScene {
  switch (id) {
    case 'star':
      return starScene({ ...STAR_DEFAULTS, size })
    case 'sphere':
      return sphereScene({ ...SPHERE_DEFAULTS, size })
    case 'aurora':
      return auroraScene({ ...AURORA_DEFAULTS, size })
    case 'blank':
      return blankScene(size)
  }
}

export function blankScene(size = 800): SvgScene {
  return {
    width: size,
    height: size,
    background: { kind: 'solid', color: mustHex('#20242b'), alpha: 1 },
    layers: [],
  }
}

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

export function starScene(o: StarOptions = STAR_DEFAULTS): SvgScene {
  const c = o.size / 2
  const center: Pt = { x: c, y: c }
  const R = o.size * 0.36
  const r = R * o.innerRatio
  const outline = starPoints(center, R, r, o.points, o.rotationDeg)
  const layers: SvgLayer[] = []
  layers.push({
    id: 'bg',
    name: 'Background',
    visible: true,
    opacity: 1,
    shape: rectShape(center, o.size, o.size),
    fills: [backgroundPaint(o.bgTop, o.bgBottom)],
  })
  if (o.floor) {
    layers.push(
      softSpotLayer('floor-shadow', 'Floor shadow', {
        cx: c,
        cy: c + R * 0.92,
        rx: R * 0.95,
        ry: R * 0.18,
        color: o.edge,
        alpha: 0.4,
      }),
      softSpotLayer('floor-glow', 'Floor glow', {
        cx: c,
        cy: c + R * 0.78,
        rx: R * 0.6,
        ry: R * 0.12,
        color: o.sheen,
        alpha: 0.3,
      }),
    )
  }
  layers.push(
    softSpotLayer('halo', 'Halo', {
      cx: c,
      cy: c,
      rx: R * 1.12,
      ry: R * 1.12,
      color: o.sheen,
      alpha: 0.3,
      core: 0.08,
    }),
  )
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const centroid: Pt = { x: (a.x + b.x + c) / 3, y: (a.y + b.y + c) / 3 }
    const k = faceBrightness(faceAngle(center, centroid), o.light)
    const axis = lightAxis(centroid, o.light, R * 0.95)
    const darkK = Math.max(0, k * 0.6 - 0.1)
    const litK = Math.min(1, k * 1.25 + 0.05)
    const stops = rampStops(shade(o.edge, o.lit, darkK), shade(o.edge, o.lit, litK), 3, 'oklab')
    const shape: Shape = { kind: 'poly', points: [a, b, center] }
    const fills: Paint[] = [{ kind: 'linear', p1: axis.p1, p2: axis.p2, stops, alpha: 1 }]
    if (k > 0.55) {
      const sheenAlpha = 0.38 * ((k - 0.55) / 0.45)
      const sheenStops: GradStop[] = [
        { offset: 0, color: o.sheen, alpha: 0 },
        { offset: 0.5, color: o.sheen, alpha: sheenAlpha },
        { offset: 1, color: o.sheen, alpha: 0 },
      ]
      fills.push({ kind: 'linear', p1: axis.p1, p2: axis.p2, stops: sheenStops, alpha: 1 })
    }
    layers.push({ id: `face-${i}`, name: `Face ${i + 1}`, visible: true, opacity: 1, shape, fills })
  }
  return { width: o.size, height: o.size, background: null, layers }
}

export function sphereScene(o: SphereOptions = SPHERE_DEFAULTS): SvgScene {
  const c = o.size / 2
  const center: Pt = { x: c, y: c }
  const R = o.size * 0.33
  const phi = (o.light.dirDeg * Math.PI) / 180
  // Highlight sits toward the light; the falloff reads as a soft terminator without any blend.
  const hx = 0.5 + 0.24 * Math.cos(phi)
  const hy = 0.5 + 0.24 * Math.sin(phi)
  const spherePaint: Paint = {
    kind: 'radial',
    units: 'bbox',
    cx: 0.5 + 0.1 * Math.cos(phi),
    cy: 0.5 + 0.1 * Math.sin(phi),
    r: 0.68,
    fx: hx,
    fy: hy,
    stops: [
      { offset: 0, color: o.lit, alpha: 1 },
      { offset: 0.45, color: o.base, alpha: 1 },
      { offset: 1, color: o.edge, alpha: 1 },
    ],
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
      cy: c + R * 1.02,
      rx: R * 0.8,
      ry: R * 0.16,
      color: mustHex('#000000'),
      alpha: 0.45,
    }),
    {
      id: 'sphere',
      name: 'Sphere',
      visible: true,
      opacity: 1,
      shape: { kind: 'ellipse', cx: center, rx: R, ry: R, rotation: 0 },
      fills: [spherePaint],
    },
  ]
  return { width: o.size, height: o.size, background: null, layers }
}

export function auroraScene(o: AuroraOptions = AURORA_DEFAULTS): SvgScene {
  const rand = mulberry32(o.seed)
  const layers: SvgLayer[] = [
    {
      id: 'bg',
      name: 'Background',
      visible: true,
      opacity: 1,
      shape: rectShape({ x: o.size / 2, y: o.size / 2 }, o.size, o.size),
      fills: [
        {
          kind: 'linear',
          p1: { x: 0, y: 0 },
          p2: { x: 0, y: o.size },
          stops: rampStops(o.nightTop, o.night, 3, 'oklab'),
          alpha: 1,
        },
      ],
    },
  ]
  const count = 5 + Math.floor(rand() * 3)
  for (let i = 0; i < count; i++) {
    const hue = o.hues[i % o.hues.length]
    layers.push(
      softSpotLayer(`wave-${i}`, `Wave ${i + 1}`, {
        cx: o.size * (0.18 + 0.64 * rand()),
        cy: o.size * (0.2 + 0.42 * rand()),
        rx: o.size * (0.24 + 0.18 * rand()),
        ry: o.size * (0.1 + 0.12 * rand()),
        rotation: (rand() - 0.5) * 40,
        color: hue,
        alpha: 0.4 + 0.25 * rand(),
        core: 0.03,
      }),
    )
  }
  layers.push(
    softSpotLayer('horizon', 'Horizon glow', {
      cx: o.size * 0.5,
      cy: o.size * 0.78,
      rx: o.size * 0.55,
      ry: o.size * 0.16,
      color: o.hues[0],
      alpha: 0.22,
    }),
  )
  return { width: o.size, height: o.size, background: null, layers }
}
