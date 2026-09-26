/**
 * Box-filling shape outlines in the unit square: the radial/composite builders (sun, bento, ring,
 * arc, drop, chevron, concentric, skull).
 */

import { bentoSlots } from './shape-bento.ts'
import { roundedRectPolyline } from './shape-decorate.ts'
import { skullPolylines } from './shape-skull.ts'
import type { RadialShapeId, ShapeOpts } from './shape-tools.ts'
import type { Polyline } from './shape-util.ts'
import { clamp, clampInt, rotated } from './shape-util.ts'

export function radialPolylines(tool: RadialShapeId, opts: ShapeOpts, steps: number): Polyline[] {
  switch (tool) {
    case 'sun':
      return sunPolylines(opts, steps)
    case 'bento':
      return bentoPolylines(opts)
    case 'ring':
      return ringPolylines(opts, steps)
    case 'arc':
      return arcPolylines(opts, steps)
    case 'drop':
      return dropPolylines(opts, steps)
    case 'chevron':
      return chevronPolylines(opts)
    case 'concentric':
      return concentricPolylines(opts, steps)
    case 'concentricRect':
      return concentricRectPolylines(opts)
    case 'skull':
      return skullPolylines(opts, steps)
  }
}

/** Normalized radii of the concentric tools, sorted descending and clamped. */
function concentricRadii(opts: ShapeOpts): number[] {
  const list = opts.circles?.length ? opts.circles : [1, 0.66, 0.33]
  return list.map((r) => clamp(r, 0.05, 1)).sort((a, b) => b - a)
}

function sunPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // gear generalization: a core disc plus rays that can be rectangular or
  // triangular, straight, wavy or twisted — one closed polyline per part
  const rays = clampInt(opts.sunRays ?? 12, 3, 32)
  const core = clamp(opts.sunCore ?? 0.18, 0.02, 0.45)
  const rBase = clamp(opts.sunRayBase ?? 0.22, 0.02, 0.49)
  const rayLen = clamp(opts.sunRayLength ?? 1, 0.3, 1)
  const alt = clamp(opts.sunAlternate ?? 1, 0.05, 1)
  const taper = clamp(opts.sunTaper ?? 0, 0, 1)
  const width = clamp(opts.sunWidth ?? 0.55, 0.1, 1)
  const wave = clamp(opts.sunWave ?? 0, 0, 1)
  const periods = clampInt(opts.sunWavePeriods ?? 2, 1, 8)
  const twist = clamp(opts.sunTwist ?? 0, -1, 1)
  const polys: Polyline[] = []
  const cseg = Math.max(16, steps)
  const corePts: Polyline = []
  for (let i = 0; i <= cseg; i++) {
    const a = -Math.PI / 2 + (i / cseg) * 2 * Math.PI
    corePts.push([0.5 + core * Math.cos(a), 0.5 + core * Math.sin(a)])
  }
  corePts[cseg] = corePts[0] // close exactly, without float drift
  polys.push(corePts)
  const sect = (2 * Math.PI) / rays
  // lateral sine amplitude relative to the ray's own span
  const amp = wave * 0.5 * Math.abs(rayLen * 0.5 - rBase)
  const seg = Math.min(64, Math.max(8, periods * 6 + 4))
  const twistSpan = twist * Math.PI * 0.5
  const put = (poly: Polyline, r: number, ang: number) => {
    // clamp into the inscribed circle so wavy rays never leave the box
    let x = 0.5 + r * Math.cos(ang)
    let y = 0.5 + r * Math.sin(ang)
    const dx = x - 0.5
    const dy = y - 0.5
    const d = Math.hypot(dx, dy)
    if (d > 0.5) {
      x = 0.5 + (dx / d) * 0.5
      y = 0.5 + (dy / d) * 0.5
    }
    poly.push([x, y])
  }
  const edge = (poly: Polyline, t: number, a0: number, rTip: number, side: 1 | -1) => {
    const r = rBase + (rTip - rBase) * t
    const th = twistSpan * t + (r > 1e-6 ? (amp * Math.sin(t * periods * 2 * Math.PI)) / r : 0)
    const hw = ((sect * width) / 2) * (1 + (taper - 1) * t)
    put(poly, r, a0 + th + side * hw)
  }
  for (let i = 0; i < rays; i++) {
    const a0 = -Math.PI / 2 + i * sect
    const rTip = 0.5 * rayLen * (i % 2 === 1 ? alt : 1)
    const poly: Polyline = []
    for (let j = 0; j <= seg; j++) edge(poly, j / seg, a0, rTip, -1)
    for (let j = seg; j >= 0; j--) edge(poly, j / seg, a0, rTip, 1)
    poly.push(poly[0])
    polys.push(poly)
  }
  return rotated(polys, opts.sunRotation ?? 0)
}

function bentoPolylines(opts: ShapeOpts): Polyline[] {
  // rounded cells separated by gap stripes; chaos offsets the dividers and
  // merge glues neighboring slots into spans (both seeded, so the drag
  // preview is stable between frames)
  const cells = bentoSlots(opts)
  const r = clamp(opts.bentoRadius ?? 0.15, 0, 0.5)
  return cells.map((c) => roundedRectPolyline(c.x0, c.y0, c.x1, c.y1, r))
}

function ringPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // outer circle + inner hole loop; both stamped, the union reads as a ring band
  const t = clamp(opts.ringThickness ?? 0.25, 0.1, 0.45)
  const outer: Polyline = []
  const inner: Polyline = []
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI
    outer.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
    inner.push([0.5 + (0.5 - t) * Math.cos(a), 0.5 + (0.5 - t) * Math.sin(a)])
  }
  return [outer, inner]
}

function arcPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // open semicircle resting on the bottom edge of the box
  const seg = Math.max(16, steps)
  const pts: Polyline = []
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI - (i / seg) * Math.PI
    pts.push([0.5 + 0.5 * Math.cos(a), 1 - 0.5 * Math.sin(a)])
  }
  return rotated([pts], opts.starRotation ?? 0)
}

function dropPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // pin/teardrop: bottom circle + two tangents meeting at the top apex
  const R = 0.34
  const cyc = 0.64
  const ay = 0.08
  const alpha = Math.acos(R / (cyc - ay))
  const seg = Math.max(16, Math.ceil(steps * 0.7))
  const a0 = -Math.PI / 2 + alpha
  const sweep = 2 * Math.PI - 2 * alpha
  const pts: Polyline = []
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * sweep
    pts.push([0.5 + R * Math.cos(a), cyc + R * Math.sin(a)])
  }
  pts.push([0.5, ay])
  pts.push(pts[0])
  return rotated([pts], opts.polygonRotation ?? 0)
}

function chevronPolylines(opts: ShapeOpts): Polyline[] {
  // "^" band: outer V with an inner V cut back into it
  const t = clamp(opts.crossThickness ?? 0.3, 0.15, 0.45)
  const tipY = 0.12
  const baseY = 0.88
  const inset = 0.22
  return rotated(
    [
      [
        [inset, baseY],
        [0.5, tipY],
        [1 - inset, baseY],
        [1 - inset - t, baseY],
        [0.5, tipY + t * 1.6],
        [inset + t, baseY],
        [inset, baseY],
      ],
    ],
    opts.crossRotation ?? 0,
  )
}

function concentricPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  // one full circle per normalized radius; radii are user-editable
  const radii = concentricRadii(opts)
  return radii.map((r) => {
    const pts: Polyline = []
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI
      pts.push([0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)])
    }
    return pts
  })
}

function concentricRectPolylines(opts: ShapeOpts): Polyline[] {
  // concentric rectangles sharing the box center
  const radii = concentricRadii(opts)
  return radii.map((r) => {
    const hw = 0.5 * r
    return [
      [0.5 - hw, 0.5 - hw],
      [0.5 + hw, 0.5 - hw],
      [0.5 + hw, 0.5 + hw],
      [0.5 - hw, 0.5 + hw],
      [0.5 - hw, 0.5 - hw],
    ]
  })
}
