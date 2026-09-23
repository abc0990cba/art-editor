/**
 * Palette file formats for import/export, parsed and serialized as plain strings
 * and arrays — no DOM. Supported: .hex (one #rrggbb per line, the Lospec format),
 * GIMP .gpl (RGB triplets with optional names), and loose text with hex codes.
 */

import { hexToRgb, rgbToHex } from './color'
import { normalizePalette } from './importImage'

const HEX_RE = /#?\b([0-9a-fA-F]{6})\b/g

/**
 * Parse any supported palette text: GIMP palette headers route to the GPL parser,
 * anything else is scanned for 6-digit hex codes. Returns null when nothing parses.
 */
export function parsePaletteText(text: string): string[] | null {
  const trimmed = text.trim()
  if (/^GIMP/i.test(trimmed)) {
    const gpl = parseGpl(text)
    if (gpl.length > 0) return gpl
  }
  const out: string[] = []
  for (const m of trimmed.matchAll(HEX_RE)) {
    out.push(`#${m[1].toLowerCase()}`)
  }
  if (out.length === 0) return null
  return normalizePalette(out)
}

/** Parse a GIMP .gpl palette: lines of "R G B Name" after the header block. */
export function parseGpl(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/)
    if (!m) continue
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (r > 255 || g > 255 || b > 255) continue
    const hex = rgbToHex({ r, g, b })
    if (!out.includes(hex)) out.push(hex)
  }
  return out
}

/** Serialize to the .hex format (Lospec): one lowercase #rrggbb per line. */
export function serializeHex(palette: readonly string[]): string {
  return normalizePalette(palette)
    .map((c) => c.toLowerCase())
    .join('\n')
}

/** Serialize to a GIMP .gpl palette with the given display name. */
export function serializeGpl(name: string, palette: readonly string[]): string {
  const colors = normalizePalette(palette)
  const lines = [
    'GIMP Palette',
    `Name: ${name}`,
    '#',
    ...colors.map((hex) => {
      const { r, g, b } = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }
      const hexName = hex.replace('#', '').toUpperCase()
      return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${hexName}`
    }),
  ]
  return lines.join('\n')
}
