/**
 * OKLab ↔ sRGB (Björn Ottosson's formulation). The studio computes authored stop ramps in OKLab so
 * gradients shade without the darkening/graying artifacts of sRGB interpolation; values are still
 * baked into sRGB hex stops — the only color format in the AI-safe subset.
 */

import type { RGB } from '../color/color.ts'

export interface OkLab {
  L: number
  a: number
  b: number
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

export function rgbToOklab(rgb: RGB): OkLab {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToRgb(c: OkLab): RGB {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3
  const s = (c.L - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return {
    r: clamp01(linearToSrgb(r)),
    g: clamp01(linearToSrgb(g)),
    b: clamp01(linearToSrgb(b)),
  }
}

/** Perceptual lightness (OKLab L) of an sRGB color — handy for shading checks in tests. */
export function oklabLightness(rgb: RGB): number {
  return rgbToOklab(rgb).L
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
