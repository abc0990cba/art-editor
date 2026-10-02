/**
 * Shared plumbing for the image-import pipeline: clamping, luminance, the parallel-channel palette
 * layout and nearest-color lookup used by every dithering strategy. Pure — no DOM, no React.
 */

import { hexToRgb } from './color'

export const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

export const luminanceOf = (hex: string): number => {
  const c = hexToRgb(hex)
  if (!c) return 0
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

/** Palette flattened into parallel RGB channels for the hot per-pixel lookups. */
export interface PaletteRgb {
  r: number[]
  g: number[]
  b: number[]
}

/** Per-pipeline parameters shared by the special diffusion strategies. */
export interface SpecialCtx {
  pal: PaletteRgb
  strength: number
}

/** One special-diffusion strategy: fills `out` with palette indices for the sample. */
export type SpecialMapper = (
  sample: Float64Array,
  tw: number,
  th: number,
  ctx: SpecialCtx,
  out: Int32Array,
) => void

export function paletteChannels(palette: string[]): PaletteRgb {
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  for (const hex of palette) {
    const c = hexToRgb(hex)
    r.push(c ? c.r : 0)
    g.push(c ? c.g : 0)
    b.push(c ? c.b : 0)
  }
  return { r, g, b }
}

/**
 * Nearest palette color by a perceptually weighted squared RGB distance; -1 when all colors are
 * excluded.
 */
export function nearestIndex(
  pal: PaletteRgb,
  r: number,
  g: number,
  b: number,
  exclude = -1,
): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < pal.r.length; i++) {
    if (i === exclude) continue
    const dr = r - pal.r[i]
    const dg = g - pal.g[i]
    const db = b - pal.b[i]
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Plain nearest-color mapping — the 'none' dither and the fallback for unknown strategies. */
export function mapNearest(
  sample: Float64Array,
  count: number,
  pal: PaletteRgb,
  out: Int32Array,
): void {
  for (let p = 0; p < count; p++) {
    const o = p * 4
    out[p] = sample[o + 3] < 128 ? -1 : nearestIndex(pal, sample[o], sample[o + 1], sample[o + 2])
  }
}
