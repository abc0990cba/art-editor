/**
 * Color math for the gradient engine: sRGB ↔ Lab (D65) and CIEDE2000. The SVG device space is sRGB
 * and browsers interpolate stops there, so fitting happens in sRGB while approximation quality is
 * judged perceptually in Lab.
 */

import type { RGB } from './types.ts'

export interface Lab {
  L: number
  a: number
  b: number
}

const EPS = 216 / 24389
const KAPPA = 24389 / 27
// D65 reference white
const XN = 0.95047
const ZN = 1.08883

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

function labF(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116
}

function labFinv(t: number): number {
  const t3 = t ** 3
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function srgbToLab(rgb: RGB): Lab {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToSrgb(lab: Lab): RGB {
  const fy = (lab.L + 16) / 116
  const fx = fy + lab.a / 500
  const fz = fy - lab.b / 200
  const x = XN * labFinv(fx)
  const y = labFinv(fy)
  const z = ZN * labFinv(fz)
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return {
    r: clamp01(linearToSrgb(Math.max(0, r))),
    g: clamp01(linearToSrgb(Math.max(0, g))),
    b: clamp01(linearToSrgb(Math.max(0, b))),
  }
}

/** CIEDE2000 between two Lab colors (Sharma 2005 formulation). */
export function deltaE2000(l1: Lab, l2: Lab): number {
  const c1 = Math.hypot(l1.a, l1.b)
  const c2 = Math.hypot(l2.a, l2.b)
  const cBar = (c1 + c2) / 2
  const c7 = cBar ** 7
  const g = 0.5 * (1 - Math.sqrt(c7 / (c7 + 25 ** 7)))
  const a1p = (1 + g) * l1.a
  const a2p = (1 + g) * l2.a
  const c1p = Math.hypot(a1p, l1.b)
  const c2p = Math.hypot(a2p, l2.b)
  const h1p = hue(a1p, l1.b)
  const h2p = hue(a2p, l2.b)
  const dLp = l2.L - l1.L
  const dCp = c2p - c1p
  const dh = hueDelta(c1p, c2p, h1p, h2p)
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(((dh / 2) * Math.PI) / 180)
  const lBar = (l1.L + l2.L) / 2
  const cBarP = (c1p + c2p) / 2
  const hBar = hueMean(c1p, c2p, h1p, h2p)
  const t =
    1 -
    0.17 * Math.cos(((hBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hBar - 63) * Math.PI) / 180)
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2))
  const cBarP7 = cBarP ** 7
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7))
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2)
  const sc = 1 + 0.045 * cBarP
  const sh = 1 + 0.015 * cBarP * t
  const rt = -rc * Math.sin((2 * dTheta * Math.PI) / 180)
  const tl = dLp / sl
  const tc = dCp / sc
  const th = dHp / sh
  return Math.sqrt(tl * tl + tc * tc + th * th + rt * tc * th)
}

/** CIEDE2000 between two sRGB colors. */
export function deltaE2000Rgb(c1: RGB, c2: RGB): number {
  return deltaE2000(srgbToLab(c1), srgbToLab(c2))
}

function hue(a: number, b: number): number {
  if (a === 0 && b === 0) return 0
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return h >= 0 ? h : h + 360
}

function hueDelta(c1: number, c2: number, h1: number, h2: number): number {
  if (c1 * c2 === 0) return 0
  const d = h2 - h1
  if (Math.abs(d) <= 180) return d
  return d > 180 ? d - 360 : d + 360
}

function hueMean(c1: number, c2: number, h1: number, h2: number): number {
  if (c1 * c2 === 0) return h1 + h2
  const sum = h1 + h2
  if (Math.abs(h1 - h2) <= 180) return sum / 2
  return sum < 360 ? (sum + 360) / 2 : (sum - 360) / 2
}

/** Format an sRGB color as `#rrggbb`. */
export function rgbToHex(rgb: RGB): string {
  const to = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`
}
