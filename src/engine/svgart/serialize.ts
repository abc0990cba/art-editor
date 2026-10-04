/**
 * AI-safe serialization of authored scenes — the studio's only output format. Contract (see
 * docs/research/ai-import.md and openspec/changes/add-svgart-workspace): paths + gradients with
 * absolute coordinates (`gradientUnits="userSpaceOnUse"` or the objectBoundingBox default —
 * `gradientTransform` is never emitted), `stop-opacity` falloffs, group opacity. No filters, no
 * masks, no blend modes, no `fr`, no `reflect`/`repeat`. The live stage renders this exact string,
 * so what you see is what Illustrator receives.
 */

import { rgbToHex } from './color.ts'
import { num, shapePath } from './figures.ts'
import type { GradStop, Paint, SvgScene } from './types.ts'

/** Anything this regex matches must never appear in studio output (guarded by tests). */
export const FORBIDDEN_RE =
  /gradientTransform|mix-blend-mode|<filter|<mask|<pattern|feGaussian|feDropShadow|feTurbulence|feDisplacement|spreadMethod="(?:reflect|repeat)"|\sfr=/

/** Serialize the whole scene to a standalone SVG document. */
export function sceneToSvg(scene: SvgScene): string {
  const defs: string[] = []
  const body: string[] = []
  if (scene.background) {
    body.push(paintOn(scene.background, rectPathData(scene.width, scene.height), defs, 'gbg'))
  }
  scene.layers.forEach((layer, li) => {
    if (!layer.visible || layer.fills.length === 0) return
    const d = shapePath(layer.shape)
    const rule =
      layer.shape.kind === 'path' && layer.shape.evenodd === true ? ' fill-rule="evenodd"' : ''
    const marks = layer.fills.map((paint, fi) => paintOn(paint, d, defs, `g${li}f${fi}`, rule))
    if (layer.opacity < 1) body.push(`<g opacity="${num(layer.opacity)}">`, ...marks, '</g>')
    else body.push(...marks)
  })
  const size = `viewBox="0 0 ${num(scene.width)} ${num(scene.height)}" width="${num(scene.width)}" height="${num(scene.height)}"`
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" ${size}>`]
  if (defs.length > 0) parts.push(`<defs>${defs.join('')}</defs>`)
  parts.push(...body, '</svg>')
  return parts.join('\n')
}

function rectPathData(w: number, h: number): string {
  return `M0 0H${num(w)}V${num(h)}H0Z`
}

function paintOn(paint: Paint, d: string, defs: string[], id: string, rule = ''): string {
  const fill = fillRef(paint, defs, id)
  const alpha = paint.alpha < 1 ? ` fill-opacity="${num(paint.alpha)}"` : ''
  return `<path d="${d}" fill="${fill}"${rule}${alpha}/>`
}

function fillRef(paint: Paint, defs: string[], id: string): string {
  if (paint.kind === 'solid') return rgbToHex(paint.color)
  if (paint.kind === 'linear') {
    defs.push(linearDef(paint, id))
    return `url(#${id})`
  }
  defs.push(radialDef(paint, id))
  return `url(#${id})`
}

function linearDef(paint: Extract<Paint, { kind: 'linear' }>, id: string): string {
  const stops = stopMarkup(paint.stops)
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` x1="${num(paint.p1.x)}" y1="${num(paint.p1.y)}"` +
    ` x2="${num(paint.p2.x)}" y2="${num(paint.p2.y)}">${stops}</linearGradient>`
  )
}

function radialDef(paint: Extract<Paint, { kind: 'radial' }>, id: string): string {
  const stops = stopMarkup(paint.stops)
  const focus =
    paint.fx !== null && paint.fy !== null ? ` fx="${num(paint.fx)}" fy="${num(paint.fy)}"` : ''
  if (paint.units === 'user') {
    return (
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
      ` cx="${num(paint.cx)}" cy="${num(paint.cy)}" r="${num(paint.r)}"${focus}>${stops}</radialGradient>`
    )
  }
  // objectBoundingBox is the SVG default and stretches with the shape: elliptical falloffs with
  // zero transforms (verified against Illustrator by the studio spike sheet).
  return (
    `<radialGradient id="${id}"` +
    ` cx="${num(paint.cx)}" cy="${num(paint.cy)}" r="${num(paint.r)}"${focus}>${stops}</radialGradient>`
  )
}

function stopMarkup(stops: GradStop[]): string {
  return stops
    .map((s) => {
      const alpha = s.alpha < 1 ? ` stop-opacity="${num(s.alpha)}"` : ''
      return `<stop offset="${num(s.offset)}" stop-color="${rgbToHex(s.color)}"${alpha}/>`
    })
    .join('')
}
