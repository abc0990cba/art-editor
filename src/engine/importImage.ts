/**
 * Image import: convert an external photo into document cells (palette indices). Pure pipeline —
 * fit sampling, pre-processing, palette quantization and dithering, then post-processing — with no
 * DOM APIs, so it stays unit-testable. The dialog decodes a File into an ImportBitmap (offscreen
 * canvas) and this module turns it into cells + palette.
 */

import { hexToRgb, rgbToHex } from './color'
import {
  BAYER2,
  BAYER4,
  BAYER8,
  BAYER16,
  CLUSTER4,
  HALFTONE4,
  BLUE_NOISE8,
  VOID_CLUSTER8,
  PATTERN8,
  thresholdAt,
  crosshatchAt,
} from './ditherMatrices'
import { MAX_SIZE, MIN_SIZE, type SubDetail } from './doc'
import {
  gaussianBlurRGBA,
  sharpenRGBA,
  hueRotateRGBA,
  medianDenoiseRGBA,
  glowScreenRGBA,
  chromaticAberrationRGBA,
} from './imageOps'

/** Decoded raster ready for conversion; straight (non-premultiplied) RGBA. */
export interface ImportBitmap {
  width: number
  height: number
  /** RGBA, row-major */
  data: Uint8ClampedArray
}

/** How the photo lands on the canvas. */
export type ImportFit =
  | 'cover' // fill the canvas, cropping the excess
  | 'contain' // fit inside, transparent margins
  | 'stretch' // distort to the exact canvas size
  | 'resize' // resize the canvas to the photo proportions, then stretch

export type ImportDither =
  | 'none'
  // ordered (threshold matrices)
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'cluster-dot'
  | 'halftone'
  | 'blue-noise'
  | 'void-cluster'
  | 'pattern'
  | 'crosshatch'
  // error diffusion (coefficient kernels)
  | 'floyd'
  | 'atkinson'
  | 'sierra'
  | 'sierra-lite'
  | 'stucki'
  | 'burkes'
  | 'jjn'
  | 'stevenson-arce'
  | 'nakano'
  // special diffusion
  | 'ostromoukhov'
  | 'variable-error'
  | 'dot-diffusion'
  | 'riemersma'

/** Ordered dithers: tone compared against a threshold matrix; the threshold bias applies. */
export const ORDERED_DITHERS: ReadonlySet<ImportDither> = new Set([
  'bayer2',
  'bayer4',
  'bayer8',
  'bayer16',
  'cluster-dot',
  'halftone',
  'blue-noise',
  'void-cluster',
  'pattern',
  'crosshatch',
])

/** Color reduction target: the document palette, a fixed set of colors, or auto (median cut). */
export type ImportPaletteChoice =
  | { kind: 'current' }
  | { kind: 'preset'; colors: string[] }
  | { kind: 'auto'; colors: number }

export interface ImportOptions {
  fit: ImportFit
  dither: ImportDither
  palette: ImportPaletteChoice
  /** -100..100 */
  brightness: number
  /** -100..100 */
  contrast: number
  /** -100..100 */
  saturation: number
  /** Each imported pixel covers pixelScale² cells (1..4) */
  pixelScale: number
  /** Dither strength 0..100 — 0 leaves plain nearest colors, 100 applies the kernel fully */
  ditherStrength: number
  /** Ordered threshold bias 0..255 (128 = neutral); low = more dark cells */
  threshold: number
  /** Pre-blur radius 0..10 */
  blur: number
  /** Unsharp-mask amount 0..100 */
  sharpen: number
  /** Hue rotation -180..180 degrees */
  hue: number
  /** Median denoise 0..5 before dithering */
  preDenoise: number
  /** Smoothing 0..5 before dithering */
  preSmooth: number
  /** Median denoise 0..5 after glow */
  postDenoise: number
  /** Smoothing 0..5 after glow */
  postSmooth: number
  /** Glow (screen-blend bloom) radius 0..24 */
  glowRadius: number
  /** Glow intensity 0..100 */
  glowIntensity: number
  /** Horizontal chromatic aberration 0..12 px */
  aberration: number
  /** Synthetic midpoints between adjacent palette colors 0..100 (0 = off) */
  blend: number
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  fit: 'cover',
  dither: 'floyd',
  palette: { kind: 'auto', colors: 16 },
  brightness: 0,
  contrast: 0,
  saturation: 0,
  pixelScale: 1,
  ditherStrength: 100,
  threshold: 128,
  blur: 0,
  sharpen: 0,
  hue: 0,
  preDenoise: 0,
  preSmooth: 0,
  postDenoise: 0,
  postSmooth: 0,
  glowRadius: 0,
  glowIntensity: 0,
  aberration: 0,
  blend: 0,
}

export interface ImportGrid {
  cols: number
  rows: number
  sub: SubDetail
}

export interface ImportResult {
  cols: number
  rows: number
  palette: string[]
  /** Cols_sub × rows_sub palette values; 0 = empty (transparent) */
  cells: Uint16Array
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Connected same-value regions of a converted buffer (4-neighborhood), grouped by palette value.
 * Feeds the "object per connected region" import split: every region becomes its own object, so
 * each island of color can be moved independently.
 */
export function colorRegions(cells: Uint16Array, bw: number, bh: number): Map<number, number[][]> {
  const seen = new Uint8Array(cells.length)
  const out = new Map<number, number[][]>()
  const stack: number[] = []
  for (let start = 0; start < cells.length; start++) {
    const v = cells[start]
    if (v === 0 || seen[start]) continue
    const region: number[] = []
    stack.push(start)
    seen[start] = 1
    while (stack.length > 0) {
      const i = stack.pop()!
      region.push(i)
      const x = i % bw
      const y = (i - x) / bw
      if (x > 0 && !seen[i - 1] && cells[i - 1] === v) {
        seen[i - 1] = 1
        stack.push(i - 1)
      }
      if (x + 1 < bw && !seen[i + 1] && cells[i + 1] === v) {
        seen[i + 1] = 1
        stack.push(i + 1)
      }
      if (y > 0 && !seen[i - bw] && cells[i - bw] === v) {
        seen[i - bw] = 1
        stack.push(i - bw)
      }
      if (y + 1 < bh && !seen[i + bw] && cells[i + bw] === v) {
        seen[i + bw] = 1
        stack.push(i + bw)
      }
    }
    let regions = out.get(v)
    if (!regions) out.set(v, (regions = []))
    regions.push(region)
  }
  return out
}

/** Canvas grid size matching the photo proportions, keeping the longer current side. */
export function resizeTargetSize(
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  const maxSide = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.max(cols, rows)))
  if (imgW >= imgH) {
    return { cols: maxSide, rows: clampSide((maxSide * imgH) / imgW) }
  }
  return { cols: clampSide((maxSide * imgW) / imgH), rows: maxSide }
}

const clampSide = (v: number): number => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)))

/**
 * Fit the source into a tw×th sample grid by area-averaged (box) downsampling. Colors are averaged
 * weighted by alpha; the output is straight RGBA floats and fully transparent samples stay at 0.
 * 'resize' samples like 'stretch'.
 */
function fitToGrid(src: ImportBitmap, tw: number, th: number, fit: ImportFit): Float64Array {
  const { width: W, height: H, data } = src
  const out = new Float64Array(tw * th * 4)
  // 'cover' crops the source to the target aspect, centered
  let cx0 = 0
  let cy0 = 0
  let cw = W
  let ch = H
  if (fit === 'cover') {
    const aT = tw / th
    const aS = W / H
    if (aS > aT) {
      cw = H * aT
      cx0 = (W - cw) / 2
    } else {
      ch = W / aT
      cy0 = (H - ch) / 2
    }
  }
  // 'contain' letterboxes a scaled-to-fit copy inside the grid
  const contain =
    fit === 'contain'
      ? (() => {
          const scale = Math.min(tw / W, th / H)
          const dw = W * scale
          const dh = H * scale
          return { ox: (tw - dw) / 2, oy: (th - dh) / 2, dw, dh }
        })()
      : null
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sx0: number
      let sy0: number
      let sx1: number
      let sy1: number
      if (contain) {
        const { ox, oy, dw, dh } = contain
        if (x + 1 <= ox || x >= ox + dw || y + 1 <= oy || y >= oy + dh) continue
        sx0 = ((x - ox) / dw) * W
        sx1 = ((x + 1 - ox) / dw) * W
        sy0 = ((y - oy) / dh) * H
        sy1 = ((y + 1 - oy) / dh) * H
      } else {
        sx0 = cx0 + (cw * x) / tw
        sx1 = cx0 + (cw * (x + 1)) / tw
        sy0 = cy0 + (ch * y) / th
        sy1 = cy0 + (ch * (y + 1)) / th
      }
      // box average with source-pixel overlap weights (alpha-weighted color)
      const ix0 = Math.max(0, Math.floor(sx0))
      const ix1 = Math.min(W, Math.ceil(sx1))
      const iy0 = Math.max(0, Math.floor(sy0))
      const iy1 = Math.min(H, Math.ceil(sy1))
      let ar = 0
      let ag = 0
      let ab = 0
      let aa = 0
      let wsum = 0
      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy)
        if (wy <= 0) continue
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx)
          if (wx <= 0) continue
          const w = wx * wy
          const o = (sy * W + sx) * 4
          const a = data[o + 3]
          ar += data[o] * a * w
          ag += data[o + 1] * a * w
          ab += data[o + 2] * a * w
          aa += a * w
          wsum += w
        }
      }
      if (wsum > 0 && aa > 0) {
        const o2 = (y * tw + x) * 4
        out[o2] = ar / aa
        out[o2 + 1] = ag / aa
        out[o2 + 2] = ab / aa
        out[o2 + 3] = aa / wsum
      }
    }
  }
  return out
}

/**
 * Brightness / contrast / saturation in place on straight RGBA floats; transparent samples keep
 * alpha 0.
 */
function adjustImage(
  sample: Float64Array,
  brightness: number,
  contrast: number,
  saturation: number,
): void {
  const C = contrast * 2.55
  const f = (259 * (C + 255)) / (255 * (259 - C))
  const sat = 1 + saturation / 100
  const bright = brightness * 1.28
  if (f === 1 && bright === 0 && sat === 1) return
  for (let i = 0; i < sample.length; i += 4) {
    if (sample[i + 3] === 0) continue
    let r = f * (sample[i] - 128) + 128 + bright
    let g = f * (sample[i + 1] - 128) + 128 + bright
    let b = f * (sample[i + 2] - 128) + 128 + bright
    if (sat !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      r = lum + (r - lum) * sat
      g = lum + (g - lum) * sat
      b = lum + (b - lum) * sat
    }
    sample[i] = clamp255(r)
    sample[i + 1] = clamp255(g)
    sample[i + 2] = clamp255(b)
  }
}

const luminanceOf = (hex: string): number => {
  const c = hexToRgb(hex)
  if (!c) return 0
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

/** Normalize a color list: parseable lowercase #rrggbb, deduplicated, never empty. */
export function normalizePalette(hexes: readonly string[]): string[] {
  const out: string[] = []
  for (const hex of hexes) {
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    const norm = rgbToHex(rgb)
    if (!out.includes(norm)) out.push(norm)
  }
  return out.length > 0 ? out : ['#000000']
}

/**
 * Insert synthetic midpoint colors between every adjacent pair of the luminance-sorted palette, so
 * dithered gradients gain intermediate steps (amount 0 = unchanged; higher values add up to three
 * midpoints per pair). The dithering pipeline uses the expanded list; the document palette grows
 * accordingly, capped at 64 entries.
 */
export function expandPaletteWithBlend(palette: readonly string[], amount: number): string[] {
  const sorted = [...palette].sort((a, b) => luminanceOf(a) - luminanceOf(b))
  if (amount <= 0 || sorted.length < 2) return sorted
  let steps = amount <= 33 ? 1 : amount <= 66 ? 2 : 3
  while (steps > 0 && sorted.length * (steps + 1) > 64) steps--
  if (steps === 0) return sorted
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i])
    if (i + 1 >= sorted.length) break
    const a = hexToRgb(sorted[i])
    const b = hexToRgb(sorted[i + 1])
    if (!a || !b) continue
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1)
      out.push(
        rgbToHex({
          r: Math.round(a.r + (b.r - a.r) * t),
          g: Math.round(a.g + (b.g - a.g) * t),
          b: Math.round(a.b + (b.b - a.b) * t),
        }),
      )
    }
  }
  return normalizePalette(out)
}

const MEDIAN_CUT_CAP = 32768

/**
 * Median-cut quantization of the opaque samples into up to maxColors colors. Samples a
 * deterministic stride of the grid so huge photos stay cheap; the result is sorted by luminance so
 * the document palette reads like a ramp.
 */
export function medianCut(sample: Float64Array, maxColors: number): string[] {
  const total = sample.length / 4
  if (total === 0) return ['#000000']
  const stride = Math.max(1, Math.floor(total / MEDIAN_CUT_CAP))
  let pxs: number[] = []
  for (let p = 0; p < total; p += stride) {
    const o = p * 4
    if (sample[o + 3] >= 128) pxs.push(o)
  }
  if (pxs.length === 0) return ['#000000']
  const n = Math.max(2, Math.min(64, Math.round(maxColors)))
  let boxes: number[][] = [pxs]
  while (boxes.length < n) {
    // split the box with the widest channel range at its median
    let bi = -1
    let bestRange = 0
    let bestCh = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.length < 2) continue
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255
        let hi = 0
        for (const o of box) {
          const v = sample[o + ch]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo
          bi = i
          bestCh = ch
        }
      }
    }
    if (bi < 0) break
    const sorted = boxes[bi].slice().sort((a, b) => sample[a + bestCh] - sample[b + bestCh])
    const mid = sorted.length >> 1
    boxes[bi] = sorted.slice(0, mid)
    boxes.push(sorted.slice(mid))
  }
  const colors = boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    for (const o of box) {
      r += sample[o]
      g += sample[o + 1]
      b += sample[o + 2]
    }
    return rgbToHex({
      r: Math.round(r / box.length),
      g: Math.round(g / box.length),
      b: Math.round(b / box.length),
    })
  })
  // luminance order reads like a ramp in the palette UI
  colors.sort((a, b) => luminanceOf(a) - luminanceOf(b))
  return normalizePalette(colors)
}

interface PaletteRgb {
  r: number[]
  g: number[]
  b: number[]
}

function paletteChannels(palette: string[]): PaletteRgb {
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
function nearestIndex(pal: PaletteRgb, r: number, g: number, b: number, exclude = -1): number {
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

/**
 * Ordered dithering generalized to a palette: for each pixel the two nearest palette colors form an
 * axis; the pixel's tone along it is compared against a threshold field. Strength scales the
 * matrix's influence (0 = a clean 50% split at the threshold bias) and the threshold bias shifts
 * the cutoff.
 */
function mapOrdered(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  fieldAt: (x: number, y: number) => number,
  strength: number,
  threshold: number,
  out: Int32Array,
): void {
  const T = threshold / 255
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = sample[o]
      const g = sample[o + 1]
      const b = sample[o + 2]
      const c1 = nearestIndex(pal, r, g, b)
      const c2 = nearestIndex(pal, r, g, b, c1)
      if (c2 < 0) {
        out[p] = c1
        continue
      }
      const vx = pal.r[c2] - pal.r[c1]
      const vy = pal.g[c2] - pal.g[c1]
      const vz = pal.b[c2] - pal.b[c1]
      const len2 = vx * vx + vy * vy + vz * vz
      let t = 0.5
      if (len2 > 0) {
        t = ((r - pal.r[c1]) * vx + (g - pal.g[c1]) * vy + (b - pal.b[c1]) * vz) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
      }
      out[p] = t > T - (0.5 - fieldAt(x, y)) * strength ? c2 : c1
    }
  }
}

/** One error-diffusion kernel: (dx, dy, weight numerator) steps in scan direction, over `div`. */
interface DiffusionKernel {
  div: number
  steps: ReadonlyArray<readonly [number, number, number]>
}

/**
 * Classic error-diffusion kernels in scan orientation (dx > 0 = the next column); serpentine rows
 * mirror the dx sign. Values follow the canonical published tables.
 */
const DIFFUSION_KERNELS: Partial<Record<ImportDither, DiffusionKernel>> = {
  floyd: {
    div: 16,
    steps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  atkinson: {
    div: 8,
    steps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  sierra: {
    div: 32,
    steps: [
      [1, 0, 5],
      [2, 0, 3],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 5],
      [1, 1, 4],
      [2, 1, 2],
      [-1, 2, 2],
      [0, 2, 3],
      [1, 2, 2],
    ],
  },
  'sierra-lite': {
    div: 4,
    steps: [
      [1, 0, 2],
      [-1, 1, 1],
      [0, 1, 1],
    ],
  },
  stucki: {
    div: 42,
    steps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
  },
  burkes: {
    div: 32,
    steps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
    ],
  },
  jjn: {
    div: 48,
    steps: [
      [1, 0, 7],
      [2, 0, 5],
      [-2, 1, 3],
      [-1, 1, 5],
      [0, 1, 7],
      [1, 1, 5],
      [2, 1, 3],
      [-2, 2, 1],
      [-1, 2, 3],
      [0, 2, 5],
      [1, 2, 3],
      [2, 2, 1],
    ],
  },
  'stevenson-arce': {
    div: 200,
    steps: [
      [2, 0, 32],
      [-3, 1, 12],
      [-1, 1, 26],
      [1, 1, 30],
      [3, 1, 16],
      [-2, 2, 12],
      [0, 2, 26],
      [2, 2, 12],
      [-3, 3, 5],
      [-1, 3, 12],
      [1, 3, 12],
      [3, 3, 5],
    ],
  },
  nakano: {
    div: 24,
    steps: [
      [1, 0, 8],
      [-1, 1, 4],
      [0, 1, 4],
      [1, 1, 4],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 1],
    ],
  },
}

/** Spread one pixel's (scaled) quantization error along a kernel, mirrored on RTL rows. */
function spreadKernel(
  work: Float64Array,
  tw: number,
  th: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number,
  ltr: boolean,
  kernel: DiffusionKernel,
): void {
  const dir = ltr ? 1 : -1
  for (const [dx, dy, w] of kernel.steps) {
    const nx = x + dx * dir
    const ny = y + dy
    if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
    const o = (ny * tw + nx) * 4
    work[o] += (er * w) / kernel.div
    work[o + 1] += (eg * w) / kernel.div
    work[o + 2] += (eb * w) / kernel.div
  }
}

/** Error diffusion (serpentine scan): self-correcting tone, the classic photo-dither look. */
function mapErrorDiffusion(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  kernel: DiffusionKernel,
  strength: number,
  out: Int32Array,
): void {
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      spreadKernel(
        work,
        tw,
        th,
        x,
        y,
        (r - pal.r[ci]) * strength,
        (g - pal.g[ci]) * strength,
        (b - pal.b[ci]) * strength,
        ltr,
        kernel,
      )
    }
  }
}

/**
 * Ostromoukhov: simple, error-diffusion weights that vary with the pixel's tone (32 luminance
 * bands), giving even textures without directional worms.
 */
const OSTROMOUKHOV_TABLE: ReadonlyArray<readonly [number, number, number, number]> = [
  [13, 0, 5, 18],
  [13, 0, 5, 18],
  [21, 0, 10, 31],
  [7, 0, 4, 11],
  [8, 0, 5, 13],
  [47, 3, 28, 78],
  [23, 3, 13, 39],
  [15, 3, 8, 26],
  [22, 5, 10, 37],
  [56, 14, 21, 91],
  [28, 8, 9, 45],
  [19, 6, 5, 30],
  [14, 5, 3, 22],
  [7, 3, 1, 11],
  [65, 32, 7, 104],
  [23, 12, 2, 37],
  [23, 12, 2, 37],
  [65, 32, 7, 104],
  [7, 3, 1, 11],
  [14, 5, 3, 22],
  [19, 6, 5, 30],
  [28, 8, 9, 45],
  [56, 14, 21, 91],
  [22, 5, 10, 37],
  [15, 3, 8, 26],
  [23, 3, 13, 39],
  [47, 3, 28, 78],
  [8, 0, 5, 13],
  [7, 0, 4, 11],
  [21, 0, 10, 31],
  [13, 0, 5, 18],
  [13, 0, 5, 18],
]

function mapOstromoukhov(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  strength: number,
  out: Int32Array,
): void {
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const band = Math.min(31, Math.max(0, Math.floor(lum / 8)))
      const [c0, c1, c2, dn] = OSTROMOUKHOV_TABLE[band]
      if (dn === 0) continue
      const er = ((r - pal.r[ci]) * strength) / dn
      const eg = ((g - pal.g[ci]) * strength) / dn
      const eb = ((b - pal.b[ci]) * strength) / dn
      // c0 → next in scan direction, c1 → behind on the next row, c2 → below
      const targets: Array<[number, number, number]> = [
        [c0, 0, 1],
        [c1, 1, -1],
        [c2, 1, 0],
      ]
      for (const [w, dy, dxDir] of targets) {
        if (w === 0) continue
        const nx = x + dxDir * dir
        const ny = y + dy
        if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
        const to = (ny * tw + nx) * 4
        work[to] += er * w
        work[to + 1] += eg * w
        work[to + 2] += eb * w
      }
    }
  }
}

/**
 * Variable-Error: Floyd–Steinberg geometry whose weights slide with the tone — bright pixels push
 * most error forward, dark pixels downward, for softer ramps.
 */
function mapVariableError(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  strength: number,
  out: Int32Array,
): void {
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const f = lum < 0 ? 0 : lum > 1 ? 1 : lum
      const er = (r - pal.r[ci]) * strength
      const eg = (g - pal.g[ci]) * strength
      const eb = (b - pal.b[ci]) * strength
      const steps: Array<[number, number, number]> = [
        [7 * f, 0, 1],
        [3 * (1 - f), 1, -1],
        [5, 1, 0],
        [1, 1, 1],
      ]
      for (const [w, dy, dxDir] of steps) {
        if (w === 0) continue
        const nx = x + dxDir * dir
        const ny = y + dy
        if (nx < 0 || nx >= tw || ny < 0 || ny >= th) continue
        const to = (ny * tw + nx) * 4
        work[to] += (er * w) / 16
        work[to + 1] += (eg * w) / 16
        work[to + 2] += (eb * w) / 16
      }
    }
  }
}

/** Dot-Diffusion class matrix: which cells take error first (0 = darkest class). */
const DOT_CLASS = [
  [0, 2, 4, 6],
  [1, 3, 5, 7],
  [0, 2, 4, 6],
  [1, 3, 5, 7],
]

/**
 * Dot-Diffusion: error flows from dark classes to bright ones along the scan direction, scaled by
 * the current cell's class — a grainy, evenly textured look.
 */
function mapDotDiffusion(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  strength: number,
  out: Int32Array,
): void {
  const work = sample.slice()
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    const dir = ltr ? 1 : -1
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(work[o])
      const g = clamp255(work[o + 1])
      const b = clamp255(work[o + 2])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      if (strength <= 0) continue
      const cls = DOT_CLASS[y % 4][x % 4]
      const nx = x + dir
      if (nx < 0 || nx >= tw) continue
      const scale = strength / (cls + 1)
      const to = (y * tw + nx) * 4
      work[to] += (r - pal.r[ci]) * scale
      work[to + 1] += (g - pal.g[ci]) * scale
      work[to + 2] += (b - pal.b[ci]) * scale
    }
  }
}

/**
 * Riemersma: a decaying error memory along the (serpentine) scan path — no spatial neighbor spread,
 * so the texture stays quiet and slightly blurred.
 */
function mapRiemersma(
  sample: Float64Array,
  tw: number,
  th: number,
  pal: PaletteRgb,
  strength: number,
  out: Int32Array,
): void {
  const decay = strength * (1 / 16)
  const br = new Float64Array(16)
  const bg = new Float64Array(16)
  const bb = new Float64Array(16)
  let head = 0
  for (let y = 0; y < th; y++) {
    const ltr = y % 2 === 0
    for (let k = 0; k < tw; k++) {
      const x = ltr ? k : tw - 1 - k
      const p = y * tw + x
      const o = p * 4
      if (sample[o + 3] < 128) {
        out[p] = -1
        continue
      }
      const r = clamp255(sample[o] + br[head])
      const g = clamp255(sample[o + 1] + bg[head])
      const b = clamp255(sample[o + 2] + bb[head])
      const ci = nearestIndex(pal, r, g, b)
      out[p] = ci
      br[head] = (r - pal.r[ci]) * decay
      bg[head] = (g - pal.g[ci]) * decay
      bb[head] = (b - pal.b[ci]) * decay
      head = (head + 1) % 16
    }
  }
}

function mapNearest(sample: Float64Array, count: number, pal: PaletteRgb, out: Int32Array): void {
  for (let p = 0; p < count; p++) {
    const o = p * 4
    out[p] = sample[o + 3] < 128 ? -1 : nearestIndex(pal, sample[o], sample[o + 1], sample[o + 2])
  }
}

/** Threshold-field accessors for the ordered dithers. */
function matrixField(
  m: readonly (readonly number[])[],
  n: number,
  levels: number,
): (x: number, y: number) => number {
  return (x, y) => thresholdAt(m, n, levels, x, y)
}

const ORDERED_FIELDS: Partial<Record<ImportDither, (x: number, y: number) => number>> = {
  bayer2: matrixField(BAYER2, 2, 4),
  bayer4: matrixField(BAYER4, 4, 16),
  bayer8: matrixField(BAYER8, 8, 64),
  bayer16: matrixField(BAYER16, 16, 256),
  'cluster-dot': matrixField(CLUSTER4, 4, 16),
  halftone: matrixField(HALFTONE4, 4, 16),
  'blue-noise': matrixField(BLUE_NOISE8, 8, 16),
  'void-cluster': matrixField(VOID_CLUSTER8, 8, 256),
  pattern: matrixField(PATTERN8, 8, 32),
  crosshatch: crosshatchAt,
}

/**
 * Full conversion: fit the bitmap to the grid, pre-process, reduce to a palette, dither,
 * post-process (glow / denoise / smooth with a palette re-snap), and expand (with pixelScale) into
 * document cells. Pure — the store commits the returned snapshot as one undoable step.
 */
export function convertImage(
  src: ImportBitmap,
  opts: ImportOptions,
  grid: ImportGrid,
  currentPalette: readonly string[],
): ImportResult {
  let { cols, rows } = grid
  if (opts.fit === 'resize')
    ({ cols, rows } = resizeTargetSize(src.width, src.height, grid.cols, grid.rows))
  const bw = cols * grid.sub
  const bh = rows * grid.sub
  const scale = Math.max(1, Math.min(4, Math.round(opts.pixelScale)))
  const tw = Math.max(1, Math.ceil(bw / scale))
  const th = Math.max(1, Math.ceil(bh / scale))
  const sample = fitToGrid(src, tw, th, opts.fit === 'resize' ? 'stretch' : opts.fit)
  adjustImage(sample, opts.brightness, opts.contrast, opts.saturation)
  if (opts.blur > 0) gaussianBlurRGBA(sample, tw, th, opts.blur)
  if (opts.sharpen > 0) sharpenRGBA(sample, tw, th, opts.sharpen / 50)
  if (opts.hue !== 0) hueRotateRGBA(sample, opts.hue)
  if (opts.preDenoise > 0) medianDenoiseRGBA(sample, tw, th, opts.preDenoise)
  if (opts.preSmooth > 0) gaussianBlurRGBA(sample, tw, th, opts.preSmooth * 0.5)
  if (opts.aberration > 0) chromaticAberrationRGBA(sample, tw, th, opts.aberration)

  const palette = normalizePalette(
    opts.palette.kind === 'current'
      ? currentPalette
      : opts.palette.kind === 'preset'
        ? opts.palette.colors
        : medianCut(sample, opts.palette.colors),
  )
  // blended midpoints exist only for dither matching and the resulting artwork;
  // they never feed back into auto-quantization
  const ditherPalette = opts.blend > 0 ? expandPaletteWithBlend(palette, opts.blend) : palette
  const pal = paletteChannels(ditherPalette)
  const strength = Math.max(0, Math.min(100, opts.ditherStrength)) / 100
  const idx = new Int32Array(tw * th)
  const field = ORDERED_FIELDS[opts.dither]
  const kernel = DIFFUSION_KERNELS[opts.dither]
  if (opts.dither === 'none') {
    mapNearest(sample, tw * th, pal, idx)
  } else if (field) {
    mapOrdered(sample, tw, th, pal, field, strength, opts.threshold, idx)
  } else if (kernel) {
    mapErrorDiffusion(sample, tw, th, pal, kernel, strength, idx)
  } else if (opts.dither === 'ostromoukhov') {
    mapOstromoukhov(sample, tw, th, pal, strength, idx)
  } else if (opts.dither === 'variable-error') {
    mapVariableError(sample, tw, th, pal, strength, idx)
  } else if (opts.dither === 'dot-diffusion') {
    mapDotDiffusion(sample, tw, th, pal, strength, idx)
  } else if (opts.dither === 'riemersma') {
    mapRiemersma(sample, tw, th, pal, strength, idx)
  } else {
    mapNearest(sample, tw * th, pal, idx)
  }

  // post effects run on the snapped colors and land back on the palette
  const post =
    (opts.glowRadius > 0 && opts.glowIntensity > 0) || opts.postDenoise > 0 || opts.postSmooth > 0
  if (post) {
    const rgb = new Float64Array(tw * th * 4)
    for (let p = 0; p < tw * th; p++) {
      const ci = idx[p]
      if (ci < 0) continue
      const o = p * 4
      rgb[o] = pal.r[ci]
      rgb[o + 1] = pal.g[ci]
      rgb[o + 2] = pal.b[ci]
      rgb[o + 3] = 255
    }
    if (opts.glowRadius > 0 && opts.glowIntensity > 0)
      glowScreenRGBA(rgb, tw, th, opts.glowRadius, opts.glowIntensity)
    if (opts.postDenoise > 0) medianDenoiseRGBA(rgb, tw, th, opts.postDenoise)
    if (opts.postSmooth > 0) gaussianBlurRGBA(rgb, tw, th, opts.postSmooth * 0.5)
    for (let p = 0; p < tw * th; p++) {
      const o = p * 4
      if (rgb[o + 3] < 128) {
        idx[p] = -1
        continue
      }
      idx[p] = nearestIndex(pal, clamp255(rgb[o]), clamp255(rgb[o + 1]), clamp255(rgb[o + 2]))
    }
  }

  const cells = new Uint16Array(bw * bh)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const v = idx[y * tw + x]
      if (v < 0) continue
      for (let dy = 0; dy < scale; dy++) {
        const by = y * scale + dy
        if (by >= bh) break
        for (let dx = 0; dx < scale; dx++) {
          const bx = x * scale + dx
          if (bx >= bw) break
          cells[by * bw + bx] = v + 1
        }
      }
    }
  }
  return { cols, rows, palette: ditherPalette, cells }
}
