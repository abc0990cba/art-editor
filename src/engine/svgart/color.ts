/**
 * Color conversion for the studio: sRGB channels in 0..1 (the gradient engine's convention —
 * convenient for alpha and light math), serialized as plain `#rrggbb` hex for the AI-safe subset.
 * The shared `color/` domain works in 0..255 for palette code, so parsing stays domain-local.
 */

import { hexToRgb } from '../color/color.ts'
import type { RGB } from '../color/color.ts'

/** Parse `#rgb`/`#rrggbb` into 0..1 channels; null when unparsable. */
export function hexColor(hex: string): RGB | null {
  const parsed = hexToRgb(hex)
  return parsed === null ? null : { r: parsed.r / 255, g: parsed.g / 255, b: parsed.b / 255 }
}

/** Non-null `hexColor` for defaults and tests (throws on a bad literal — they are all ours). */
export function mustHex(hex: string): RGB {
  const c = hexColor(hex)
  if (c === null) throw new Error(`bad color literal: ${hex}`)
  return c
}

/** Format 0..1 channels as `#rrggbb` (clamped). */
export function rgbToHex(c: RGB): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`
}
