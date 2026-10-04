/**
 * Factory helpers for the studio UI: new layers and soft layers sized relative to the open scene.
 * Pure functions over the engine model — no store access.
 */

import {
  blobShape,
  mustHex,
  ringShape,
  softSpotLayer,
  type Pt,
  type Shape,
  type SvgLayer,
  type SvgScene,
} from '../../engine/svgart/index.ts'

export type ShapeKind = 'rect' | 'ellipse' | 'star' | 'ngon' | 'blob' | 'ring'
export type SoftKind = 'shadow' | 'glow' | 'highlight'

/** A fresh layer centered in the scene, sized as a fraction of its smaller side. */
export function newShapeLayer(kind: ShapeKind, scene: SvgScene, index: number): SvgLayer {
  const c: Pt = { x: scene.width / 2, y: scene.height / 2 }
  const unit = Math.min(scene.width, scene.height)
  let shape: Shape
  let name = kind
  switch (kind) {
    case 'rect':
      shape = {
        kind: 'rect',
        cx: c,
        w: unit * 0.36,
        h: unit * 0.24,
        radius: unit * 0.02,
        rotation: 0,
      }
      break
    case 'ellipse':
      shape = { kind: 'ellipse', cx: c, rx: unit * 0.18, ry: unit * 0.18, rotation: 0 }
      break
    case 'star':
      shape = { kind: 'star', cx: c, R: unit * 0.22, r: unit * 0.09, points: 5, rotation: 0 }
      break
    case 'ngon':
      // A regular polygon is a star whose inner radius equals the outer one.
      shape = { kind: 'star', cx: c, R: unit * 0.2, r: unit * 0.2, points: 6, rotation: 0 }
      name = 'ngon'
      break
    case 'blob':
      shape = blobShape(c, unit * 0.2, 11 + index * 7, 0.35)
      break
    case 'ring':
      shape = ringShape(c, unit * 0.2, unit * 0.08)
      name = 'ring'
      break
  }
  return {
    id: `layer-${index}-${kind}`,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    visible: true,
    opacity: 1,
    shape,
    fills: [{ kind: 'solid', color: mustHex('#d8d2e8'), alpha: 1 }],
  }
}

/** A soft falloff layer (the AI-safe glow/shadow/highlight construction). */
export function newSoftLayer(kind: SoftKind, scene: SvgScene, index: number): SvgLayer {
  const c: Pt = { x: scene.width / 2, y: scene.height / 2 }
  const unit = Math.min(scene.width, scene.height)
  if (kind === 'shadow') {
    return softSpotLayer(`soft-${index}`, 'Soft shadow', {
      cx: c.x,
      cy: c.y + unit * 0.3,
      rx: unit * 0.3,
      ry: unit * 0.07,
      color: mustHex('#000000'),
      alpha: 0.45,
    })
  }
  if (kind === 'glow') {
    return softSpotLayer(`soft-${index}`, 'Soft glow', {
      cx: c.x,
      cy: c.y,
      rx: unit * 0.32,
      ry: unit * 0.32,
      color: mustHex('#ffd54d'),
      alpha: 0.45,
      core: 0.05,
    })
  }
  return softSpotLayer(`soft-${index}`, 'Soft highlight', {
    cx: c.x - unit * 0.12,
    cy: c.y - unit * 0.14,
    rx: unit * 0.2,
    ry: unit * 0.14,
    rotation: -20,
    color: mustHex('#ffffff'),
    alpha: 0.55,
    core: 0.1,
  })
}
