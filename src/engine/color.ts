/** Pure color conversion utilities for the rich color picker. */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSV {
  h: number
  s: number
  v: number
}

export interface CMYK {
  c: number
  m: number
  y: number
  k: number
}

/** H in degrees (0..360), s and v in 0..1 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const xx = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, xx, 0]
  else if (hp < 2) [r, g, b] = [xx, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, xx]
  else if (hp < 4) [r, g, b] = [0, xx, c]
  else if (hp < 5) [r, g, b] = [xx, 0, c]
  else [r, g, b] = [c, 0, xx]
  const m = v - c
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

const byte = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0')

const unit = (v: number) => Math.max(0, Math.min(1, v))

/** R/g/b in 0..255 → c/m/y/k in 0..1 (k = 1 − max channel; black is pure key). */
export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const k = 1 - Math.max(rr, gg, bb)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 }
  const d = 1 - k
  return { c: (d - rr) / d, m: (d - gg) / d, y: (d - bb) / d, k }
}

export function cmykToRgb({ c, m, y, k }: CMYK): RGB {
  const kk = unit(k)
  const d = 1 - kk
  return {
    r: Math.round(255 * d * (1 - unit(c))),
    g: Math.round(255 * d * (1 - unit(m))),
    b: Math.round(255 * d * (1 - unit(y))),
  }
}

export function hexToCmyk(hex: string): CMYK | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToCmyk(rgb.r, rgb.g, rgb.b)
}

export function cmykToHex(cmyk: CMYK): string {
  return rgbToHex(cmykToRgb(cmyk))
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(hsvToRgb(h, s, v))
}

/** Parse `#rgb` / `#rrggbb` (with or without `#`); returns null on invalid input. */
export function hexToRgb(hex: string): RGB | null {
  let s = hex.trim().toLowerCase()
  if (s.startsWith('#')) s = s.slice(1)
  if (/^[0-9a-f]{3}$/.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  if (!/^[0-9a-f]{6}$/.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

export function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

export function normalizeHex(hex: string): string | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHex(rgb) : null
}
