/**
 * SVG path fragments of the cell forms: cellShapeFragment places one form into a cell box
 * (position, size, shape params, corner rounding) and shapePreviewPath renders picker icons.
 * Canvas, PNG and SVG export paint these fragments as evenodd fill subpaths — a ring's second
 * subpath becomes its hole.
 */

import type { Pt } from '../geometry/marching-squares.ts'
import { fmt, roundedPolygonPath } from '../geometry/poly-path.ts'
import { clamp, DEFAULT_SHAPE_PARAMS, type CellShapeId, type ShapeParams } from './defs.ts'
import {
  arrowPoly,
  leafPoly,
  trapezoidPoly,
  UNIT_EGG,
  UNIT_OCTAGON,
  UNIT_PENTAGON,
  UNIT_SHIELD,
} from './ext.ts'
import {
  asteriskPoly,
  chevronPoly,
  crossPoly,
  flowerPoly,
  gearPoly,
  lightningPoly,
  moonBite,
  starPoly,
  UNIT_DIAMOND,
  UNIT_HEART,
  UNIT_HEXAGON,
  UNIT_SQUARE,
  UNIT_TEARDROP,
  UNIT_TRIANGLE,
  UNIT_TRIANGLE_DOWN,
  type UnitPt,
} from './geom.ts'

/** Where and how one form is drawn: a cell box plus the style knobs that shape it. */
export interface CellShapePlacement {
  id: CellShapeId
  x: number
  y: number
  w: number
  h: number
  params: ShapeParams
  /** PixelStyle.radius (0..0.5): rounds polygonal corners; curved forms ignore it */
  radius: number
  /** Polygon corners render as straight 45° cuts instead of arcs */
  chamfer: boolean
}

function ellipseFrag(cx: number, cy: number, rx: number, ry: number): string {
  let d = `M${fmt(cx - rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy - ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx + rx)} ${fmt(cy)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx)} ${fmt(cy + ry)}`
  d += `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(cx - rx)} ${fmt(cy)}Z`
  return d
}

/** Scale unit points into the cell box, then rotate the result about the box center. */
function placePoints(unit: readonly UnitPt[], pl: CellShapePlacement, rotDeg: number): Pt[] {
  const rad = (rotDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  return unit.map(([ux, uy]) => {
    const dx = pl.x + ux * pl.w - cx
    const dy = pl.y + uy * pl.h - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

function polyFrag(unit: readonly UnitPt[], pl: CellShapePlacement): string {
  const pts = placePoints(unit, pl, pl.params.rotation)
  return roundedPolygonPath(pts, pl.radius * Math.min(pl.w, pl.h), pl.chamfer)
}

/** Cubic silhouette (anchor + control/control/anchor triples) placed like the heart. */
function cubicFrag(curve: readonly UnitPt[], pl: CellShapePlacement): string {
  const pts = placePoints(curve, pl, pl.params.rotation)
  let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`
  for (let i = 1; i < pts.length; i += 3) {
    d += `C${fmt(pts[i].x)} ${fmt(pts[i].y)} ${fmt(pts[i + 1].x)} ${fmt(pts[i + 1].y)} ${fmt(pts[i + 2].x)} ${fmt(pts[i + 2].y)}`
  }
  return `${d}Z`
}

/**
 * Common frame of the arc-based forms (moon/semicircle): a uniform scale centered in the box —
 * rotation rules out stretching the box non-uniformly, that would turn the arcs into rotated
 * ellipses — plus a mapper from unit-box point to placed coordinates.
 */
function arcFrame(pl: CellShapePlacement) {
  const s = Math.min(pl.w, pl.h)
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  const rad = (pl.params.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const pt = (ux: number, uy: number) => {
    const dx = (ux - 0.5) * s
    const dy = (uy - 0.5) * s
    return `${fmt(cx + dx * cos - dy * sin)} ${fmt(cy + dx * sin + dy * cos)}`
  }
  return { s, pt }
}

/** Moon: outer disc arc between the top and right poles (the long way), then the bite arc back. */
function moonFrag(pl: CellShapePlacement): string {
  const b = moonBite(pl.params.thickness)
  const { s, pt } = arcFrame(pl)
  const rOut = fmt(0.5 * s)
  const rBite = fmt(b.r * s)
  return (
    `M${pt(0.5, 0)}` +
    `A${rOut} ${rOut} 0 1 0 ${pt(1, 0.5)}` +
    `A${rBite} ${rBite} 0 0 1 ${pt(0.5, 0)}Z`
  )
}

/** Semicircle: dome — the unit circle above the chord at y = 0.6, closed by the straight chord. */
function semicircleFrag(pl: CellShapePlacement): string {
  const { s, pt } = arcFrame(pl)
  const r = fmt(0.5 * s)
  const hx = Math.sqrt(0.24)
  return `M${pt(0.5 - hx, 0.6)}A${r} ${r} 0 1 1 ${pt(0.5 + hx, 0.6)}Z`
}

const FRAG_OF: Record<CellShapeId, (pl: CellShapePlacement) => string> = {
  square: (pl) => polyFrag(UNIT_SQUARE, pl),
  circle: (pl) => ellipseFrag(pl.x + pl.w / 2, pl.y + pl.h / 2, pl.w / 2, pl.h / 2),
  ring: (pl) => {
    const wall = clamp(pl.params.thickness, 0.05, 0.5) * Math.min(pl.w, pl.h)
    const cx = pl.x + pl.w / 2
    const cy = pl.y + pl.h / 2
    return (
      ellipseFrag(cx, cy, pl.w / 2, pl.h / 2) +
      ellipseFrag(cx, cy, Math.max(0.02, pl.w / 2 - wall), Math.max(0.02, pl.h / 2 - wall))
    )
  },
  triangle: (pl) => polyFrag(UNIT_TRIANGLE, pl),
  triangleDown: (pl) => polyFrag(UNIT_TRIANGLE_DOWN, pl),
  diamond: (pl) => polyFrag(UNIT_DIAMOND, pl),
  cross: (pl) => polyFrag(crossPoly(pl.params.thickness / 2, false), pl),
  xCross: (pl) => polyFrag(crossPoly(pl.params.thickness / 2, true), pl),
  star: (pl) => polyFrag(starPoly(pl.params.points, pl.params.thickness), pl),
  sparkle: (pl) => polyFrag(starPoly(4, clamp(pl.params.thickness * 0.7, 0.05, 0.5)), pl),
  hexagon: (pl) => polyFrag(UNIT_HEXAGON, pl),
  heart: (pl) => cubicFrag(UNIT_HEART, pl),
  moon: moonFrag,
  teardrop: (pl) => cubicFrag(UNIT_TEARDROP, pl),
  flower: (pl) => polyFrag(flowerPoly(pl.params.points, pl.params.thickness), pl),
  semicircle: semicircleFrag,
  gear: (pl) => polyFrag(gearPoly(pl.params.points, pl.params.thickness), pl),
  asterisk: (pl) => polyFrag(asteriskPoly(pl.params.points, pl.params.thickness), pl),
  lightning: (pl) => polyFrag(lightningPoly(pl.params.thickness), pl),
  chevron: (pl) => polyFrag(chevronPoly(pl.params.thickness), pl),
  pentagon: (pl) => polyFrag(UNIT_PENTAGON, pl),
  octagon: (pl) => polyFrag(UNIT_OCTAGON, pl),
  // the cap radius IS the shape knob: user corner rounding/chamfer stay out of it
  capsule: (pl) => {
    const r = clamp(pl.params.thickness, 0.05, 0.5) * Math.min(pl.w, pl.h)
    return roundedPolygonPath(placePoints(UNIT_SQUARE, pl, pl.params.rotation), r, false)
  },
  trapezoid: (pl) => polyFrag(trapezoidPoly(pl.params.thickness), pl),
  shield: (pl) => polyFrag(UNIT_SHIELD, pl),
  leaf: (pl) => polyFrag(leafPoly(pl.params.thickness), pl),
  egg: (pl) => cubicFrag(UNIT_EGG, pl),
  arrow: (pl) => polyFrag(arrowPoly(pl.params.thickness), pl),
}

/**
 * Path fragment of one non-square cell form filling the placement box. Rings rely on the renderer's
 * evenodd fill rule for the hole.
 */
export function cellShapeFragment(pl: CellShapePlacement): string {
  return FRAG_OF[pl.id](pl)
}

/** Normalized icon path for UI pickers: the form drawn inside a size × size box. */
export function shapePreviewPath(
  id: CellShapeId,
  size: number,
  p: ShapeParams = DEFAULT_SHAPE_PARAMS,
): string {
  const inset = Math.max(1, size * 0.1)
  const s = size - inset * 2
  return cellShapeFragment({
    id,
    x: inset,
    y: inset,
    w: s,
    h: s,
    params: p,
    radius: 0,
    chamfer: false,
  })
}
