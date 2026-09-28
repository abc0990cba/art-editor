/**
 * AI-safe SVG serialization of fitted gradients: `gradientUnits="userSpaceOnUse"`, plain hex stop
 * colors, no blend modes — the subset Adobe Illustrator imports reliably. `fitToSvg` wraps one fit
 * in a standalone document (full-bleed rect) for previews and browser render-oracle checks.
 */

import { rgbToHex } from './color.ts'
import type { SpotLayer } from './layers.ts'
import type { GradFit, GradStop } from './types.ts'

/** `<linearGradient>`/`<radialGradient>` def markup for a fit (solid has no def). */
export function gradientDef(fit: GradFit, id: string): string {
  if (fit.kind === 'solid') return ''
  const stops = fit.stops.map((s) => stopMarkup(s)).join('')
  if (fit.kind === 'linear') {
    return (
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
      ` x1="${num(fit.p1.x)}" y1="${num(fit.p1.y)}"` +
      ` x2="${num(fit.p2.x)}" y2="${num(fit.p2.y)}">${stops}</linearGradient>`
    )
  }
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` cx="${num(fit.center.x)}" cy="${num(fit.center.y)}" r="${num(fit.radius)}">${stops}</radialGradient>`
  )
}

/** `<radialGradient>` def for a spot layer: constant color, stop-opacity alpha ramp (AI-safe). */
export function spotDef(spot: SpotLayer, id: string): string {
  const hex = rgbToHex(spot.color)
  const stops = spot.alpha
    .map(
      (s) =>
        `<stop offset="${num(s.offset)}" stop-color="${hex}" stop-opacity="${num(s.color.r)}"/>`,
    )
    .join('')
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` cx="${num(spot.center.x)}" cy="${num(spot.center.y)}" r="${num(spot.radius)}">${stops}</radialGradient>`
  )
}

/** Fill attribute for a fit; gradient fits register their `<def>` under `id`. */
export function fitFill(fit: GradFit, defs: string[], id: string): string {
  if (fit.kind === 'solid') return rgbToHex(fit.color)
  defs.push(gradientDef(fit, id))
  return `url(#${id})`
}

/** Standalone SVG document with one full-bleed rect painted by the fit. */
export function fitToSvg(fit: GradFit, width: number, height: number, id = 'g'): string {
  const fill = fit.kind === 'solid' ? rgbToHex(fit.color) : `url(#${id})`
  const defs = fit.kind === 'solid' ? '' : `<defs>${gradientDef(fit, id)}</defs>`
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ]
  if (defs !== '') parts.push(defs)
  parts.push(`<rect width="${width}" height="${height}" fill="${fill}"/>`, '</svg>')
  return parts.join('\n')
}

function stopMarkup(s: GradStop): string {
  return `<stop offset="${num(s.offset)}" stop-color="${rgbToHex(s.color)}"/>`
}

/** Trimmed 3-decimal number formatting (no trailing zeros, no `-0`). */
function num(v: number): string {
  let s = v.toFixed(3)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s === '-0' ? '0' : s
}
