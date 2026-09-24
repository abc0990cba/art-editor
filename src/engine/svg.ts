import type { Doc } from './doc'
import { docExtent } from './doc'
import { buildGeometry } from './geometry'

export interface SvgOptions {
  includeBg: boolean
  /** Rendered width/height in px per grid cell */
  scale?: number
}

function n(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

/** Serialize the document to a vector SVG string using the shared geometry engine. */
export function buildSvg(doc: Doc, opts: SvgOptions): string {
  const scale = opts.scale ?? 10
  const geometry = buildGeometry(doc)
  const { w, h } = docExtent(doc)
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}">`,
  )
  if (opts.includeBg && doc.bg) {
    parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${doc.bg}"/>`)
  }
  for (const p of geometry.paths) {
    const fill = p.fill ?? 'none'
    const attrs = [`fill="${fill}"`, 'fill-rule="evenodd"']
    if (p.stroke) {
      attrs.push(
        `stroke="${p.stroke}"`,
        `stroke-width="${n(p.strokeWidth ?? 0.3)}"`,
        'stroke-linecap="round"',
      )
    }
    parts.push(`<path d="${p.d}" ${attrs.join(' ')}/>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}
