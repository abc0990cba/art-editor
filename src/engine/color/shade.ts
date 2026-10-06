/** Derived colors: hex mixed toward black (shade) or white (tint). */

import { hexToRgb, rgbToHex } from './color.ts'

const mix = (hex: string, depth: number, target: number): string => {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const d = Math.max(0, Math.min(1, depth))
  const lerp = (c: number) => Math.round(c + (target - c) * d)
  return rgbToHex({ r: lerp(rgb.r), g: lerp(rgb.g), b: lerp(rgb.b) })
}

/** Mix a hex color toward black; depth 0 = unchanged, 1 = black. Unparsable input passes through. */
export function shadeHex(hex: string, depth: number): string {
  return mix(hex, depth, 0)
}

/** Mix a hex color toward white; depth 0 = unchanged, 1 = white. Unparsable input passes through. */
export function tintHex(hex: string, depth: number): string {
  return mix(hex, depth, 255)
}
