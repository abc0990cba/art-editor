/**
 * AI-safe SVG serialization of fitted gradients: `gradientUnits="userSpaceOnUse"`, plain hex stop
 * colors, no blend modes — the subset Adobe Illustrator imports reliably. `fitToSvg` wraps one fit
 * in a standalone document (full-bleed rect) for previews and browser render-oracle checks.
 */

import { rgbToHex } from './color.ts'
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
