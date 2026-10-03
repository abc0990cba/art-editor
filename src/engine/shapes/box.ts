/**
 * Box-filling shape outlines in the unit square: the dispatcher plus the faceted outlines (star,
 * polygon, diamond, cross, lightning, heart, spiral, moon, flower, gear).
 */

import { decoratePolylines } from './decorate.ts'
import { radialPolylines } from './radial.ts'
import type { BoxShapeId, RadialShapeId, ShapeOpts } from './tools.ts'
import type { Polyline } from './util.ts'
import { clamp, clampInt, rotated } from './util.ts'

type FacetShapeId = Exclude<BoxShapeId, RadialShapeId>

/** Closed/open outline pieces of a box-filling shape in the unit square. */
export function boxShapePolylines(tool: BoxShapeId, opts: ShapeOpts, steps: number): Polyline[] {
  switch (tool) {
    case 'sun':
    case 'bento':
    case 'ring':
    case 'arc':
    case 'drop':
    case 'chevron':
    case 'concentric':
    case 'concentricRect':
    case 'skull':
      return radialPolylines(tool, opts, steps)
    default:
      return facetPolylines(tool, opts, steps)
  }
}

function facetPolylines(tool: FacetShapeId, opts: ShapeOpts, steps: number): Polyline[] {
  switch (tool) {
    case 'star':
      return starPolylines(opts)
    case 'polygon':
      return polygonPolylines(opts)
    case 'diamond':
      return diamondPolylines(opts)
    case 'cross':
      return crossPolylines(opts)
    case 'lightning':
      return lightningPolylines(opts)
    case 'heart':
      return heartPolylines(opts, steps)
    case 'spiral':
      return spiralPolylines(opts, steps)
    case 'moon':
      return moonPolylines(opts, steps)
    case 'flower':
      return flowerPolylines(opts, steps)
    case 'gear':
      return gearPolylines(opts)
  }
}

function starPolylines(opts: ShapeOpts): Polyline[] {
  const rays = clampInt(opts.starRays ?? 5, 3, 12)
  const inner = clamp(opts.starInner ?? 0.42, 0.15, 0.49)
  const pts: Polyline = []
  for (let i = 0; i < rays * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / rays
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner
    pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)])
  }
  pts.push(pts[0])
  return rotated(decoratePolylines([pts], opts), opts.starRotation ?? 0)
}

function polygonPolylines(opts: ShapeOpts): Polyline[] {
  const sides = clampInt(opts.polygonSides ?? 6, 3, 12)
  const pts: Polyline = []
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
    pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
  }
  pts.push(pts[0])
  return rotated(decoratePolylines([pts], opts), opts.polygonRotation ?? 0)
}

function diamondPolylines(opts: ShapeOpts): Polyline[] {
  return rotated(
    decoratePolylines(
      [
        [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
          [0.5, 0],
        ],
      ],
      opts,
    ),
    opts.diamondRotation ?? 0,
  )
}

function crossPolylines(opts: ShapeOpts): Polyline[] {
  const a = clamp(opts.crossThickness ?? 1 / 3, 0.15, 0.45)
  return rotated(
    [
      [
        [a, 0],
        [1 - a, 0],
        [1 - a, a],
        [1, a],
        [1, 1 - a],
        [1 - a, 1 - a],
        [1 - a, 1],
        [a, 1],
        [a, 1 - a],
        [0, 1 - a],
        [0, a],
        [a, a],
        [a, 0],
      ],
    ],
    opts.crossRotation ?? 0,
  )
}

function lightningPolylines(opts: ShapeOpts): Polyline[] {
  return rotated(
    [
      [
        [0.62, 0],
        [0.18, 0.58],
        [0.44, 0.58],
        [0.3, 1],
        [0.82, 0.42],
        [0.54, 0.42],
        [0.74, 0],
        [0.62, 0],
      ],
    ],
    opts.lightningRotation ?? 0,
  )
}

function heartPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // classic parametric heart, auto-fitted and centered into the unit box
  const pad = 0.07
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const raw: Polyline = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    raw.push([x, y])
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const scale = (1 - pad * 2) / Math.max(maxX - minX, maxY - minY)
  const cx = pad + (1 - pad * 2 - (maxX - minX) * scale) / 2
  const cy = pad + (1 - pad * 2 - (maxY - minY) * scale) / 2
  return rotated(
    [raw.map(([x, y]) => [cx + (x - minX) * scale, cy + (y - minY) * scale] as [number, number])],
    opts.heartRotation ?? 0,
  )
}

function spiralPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  const turns = clamp(opts.spiralTurns ?? 2.75, 0.5, 6)
  const dir = (opts.spiralDir ?? 1) >= 0 ? 1 : -1
  const phase = ((opts.spiralRotation ?? 0) * Math.PI) / 180 - Math.PI / 2
  const tmax = turns * 2 * Math.PI
  const pts: Polyline = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * tmax
    const r = (t / tmax) * 0.5
    pts.push([0.5 + r * Math.cos(dir * t + phase), 0.5 + r * Math.sin(dir * t + phase)])
  }
  return [pts]
}

function moonPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // outer right semicircle + inner arc bulging less, sharing both tips;
  // thickness t is the empty gap between the arcs at the widest point
  const t = clamp(opts.moonThickness ?? 0.293, 0.05, 0.45)
  const c = ((1 - t) * (1 - t) - 0.5) / (1 - 2 * t)
  const r2 = 1 - t - c
  const seg = Math.max(8, Math.ceil(steps / 2))
  const ang = Math.atan2(0.5, 0.5 - c)
  const pts: Polyline = []
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI
    pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
  }
  for (let i = 0; i <= seg; i++) {
    const a = ang - (i / seg) * 2 * ang
    pts.push([c + r2 * Math.cos(a), 0.5 + r2 * Math.sin(a)])
  }
  return rotated([pts], opts.moonRotation ?? 0)
}

function flowerPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // rose curve; odd petal counts use signed cos(kθ), even ones use |cos(kθ)|
  const petals = clampInt(opts.flowerPetals ?? 5, 3, 12)
  const k = petals % 2 === 0 ? petals / 2 : petals
  const phase = ((opts.flowerRotation ?? 0) * Math.PI) / 180
  const pts: Polyline = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const raw = 0.5 * Math.cos(k * t)
    const r = petals % 2 === 0 ? Math.abs(raw) : raw
    pts.push([0.5 + r * Math.cos(t + phase), 0.5 + r * Math.sin(t + phase)])
  }
  return [pts]
}

function gearPolylines(opts: ShapeOpts): Polyline[] {
  const teeth = clampInt(opts.gearTeeth ?? 8, 4, 16)
  const depth = clamp(opts.gearDepth ?? 0.14, 0.05, 0.3)
  const root = 0.5 - depth
  const sect = (2 * Math.PI) / teeth
  const pts: Polyline = []
  for (let i = 0; i < teeth; i++) {
    const s = i * sect
    const angs = [s + 0.04 * sect, s + 0.14 * sect, s + 0.36 * sect, s + 0.46 * sect]
    const rads = [root, 0.5, 0.5, root]
    for (let j = 0; j < 4; j++) {
      pts.push([0.5 + rads[j] * Math.cos(angs[j]), 0.5 + rads[j] * Math.sin(angs[j])])
    }
  }
  pts.push(pts[0])
  return rotated([pts], opts.gearRotation ?? 0)
}
