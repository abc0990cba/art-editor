/**
 * Image import: convert an external photo into document cells (palette indices). Pure pipeline —
 * fit sampling, pre-processing, palette quantization and dithering, then post-processing — with no
 * DOM APIs, so it stays unit-testable. The dialog decodes a File into an ImportBitmap (offscreen
 * canvas) and this module turns it into cells + palette. The stages live in sibling modules:
 * import-fit (sampling + pre-filters), import-quantize (palettes), import-ordered /
 * import-diffusion / import-special / import-glyph (dithering), import-post (post effects),
 * import-shared (common palette helpers); this file owns the public types and the pipeline glue.
 */

import { hexToRgb } from './color.ts'
import { DITHER_CATALOG, type ImportDither } from './dither-catalog.ts'
import type { SubDetail } from './doc'
import type { GlyphTileSet } from './glyph-tiles.ts'
import { mapPosterizeJitter } from './import-adaptive.ts'
import { DIFFUSION_KERNELS, mapErrorDiffusion } from './import-diffusion.ts'
import { mapDuotone } from './import-duotone.ts'
import type { SampleLayout } from './import-fit.ts'
import { prepareSample, resolveLayout } from './import-fit.ts'
import { GLYPH_MAPPERS } from './import-glyph.ts'
import { mapHybrid, type HybridPlan } from './import-hybrid.ts'
import { mapOrdered, orderedFieldFor } from './import-ordered.ts'
import { mapPathDiffusion, pathOrderFor } from './import-path.ts'
import { applyPostEffects } from './import-post.ts'
import { applyEdgeOutline } from './import-post.ts'
import { expandPaletteWithBlend, medianCut, normalizePalette } from './import-quantize.ts'
import { mapNearest, paletteChannels, type PaletteRgb } from './import-shared.ts'
import { SPECIAL_MAPPERS } from './import-special.ts'
import { asciiGlyphSet, builtinDitherSets } from './text-raster.ts'

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

/** Every import dither id; the catalog (dither-catalog.ts) owns the list and the families. */
export type { ImportDither } from './dither-catalog.ts'

/** Ordered dithers: tone compared against a threshold matrix; the threshold bias applies. */
export { ORDERED_DITHERS } from './dither-catalog.ts'

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
  /** Tile set for 'glyph' / 'palette-glyph' dithering; null falls back to nearest */
  glyphSet: GlyphTileSet | null
  /** Hybrid band dithering: the algorithm per tone band (dither = 'hybrid') */
  hybridLow: ImportDither
  hybridMid: ImportDither
  hybridHigh: ImportDither
  /** Shadows end / highlights start at this luminance, 0..255 (hybrid) */
  bandLow: number
  bandHigh: number
  /** Posterize band count 2..32 (dither = 'posterize') */
  posterizeLevels: number
  /** Gradient-map duotone endpoints; null keeps the photo colors */
  duotone: { dark: string; light: string } | null
  /** Edge outline 0..100: darkest ink over detected luminance edges after dithering */
  edgeOutline: number
  /** Custom character ramp override (dither = 'ascii'); null uses the builtin ramp */
  asciiRamp: string | null
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  fit: 'cover',
  dither: 'floyd',
  glyphSet: null,
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
  hybridLow: 'sierra-lite',
  hybridMid: 'floyd',
  hybridHigh: 'bayer8',
  bandLow: 85,
  bandHigh: 170,
  posterizeLevels: 5,
  duotone: null,
  edgeOutline: 0,
  asciiRamp: null,
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

// public pipeline helpers implemented in the stage modules
export { resizeTargetSize } from './import-fit.ts'
export { expandPaletteWithBlend, medianCut, normalizePalette } from './import-quantize.ts'

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
  const layout = resolveLayout(src, opts, grid)
  const sample = prepareSample(src, opts, layout)
  if (opts.duotone) {
    const dark = hexToRgb(opts.duotone.dark)
    const light = hexToRgb(opts.duotone.light)
    if (dark && light)
      mapDuotone(sample, { dark: [dark.r, dark.g, dark.b], light: [light.r, light.g, light.b] })
  }
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
  const idx = ditherSample(sample, opts, layout, pal)
  // post effects run on the snapped colors and land back on the palette
  const post =
    (opts.glowRadius > 0 && opts.glowIntensity > 0) ||
    opts.postDenoise > 0 ||
    opts.postSmooth > 0 ||
    opts.edgeOutline > 0
  if (post) applyPostEffects(idx, pal, layout.tw, layout.th, opts)
  if (opts.edgeOutline > 0) applyEdgeOutline(idx, pal, layout.tw, layout.th, opts.edgeOutline)
  return {
    cols: layout.cols,
    rows: layout.rows,
    palette: ditherPalette,
    cells: expandCells(idx, layout),
  }
}

/** Run the selected dithering strategy over the sample; unknown strategies fall back to nearest. */
function ditherSample(
  sample: Float64Array,
  opts: ImportOptions,
  layout: SampleLayout,
  pal: PaletteRgb,
): Int32Array {
  return runDither(sample, opts, layout, pal, opts.dither)
}

/** Dispatch one algorithm id; hybrid bands re-enter here with plain ids only. */
function runDither(
  sample: Float64Array,
  opts: ImportOptions,
  layout: SampleLayout,
  pal: PaletteRgb,
  id: ImportDither,
): Int32Array {
  const { tw, th } = layout
  const strength = Math.max(0, Math.min(100, opts.ditherStrength)) / 100
  const idx = new Int32Array(tw * th)
  const nearest = (): void => {
    mapNearest(sample, tw * th, pal, idx)
  }
  switch (DITHER_CATALOG[id].family) {
    case 'off':
      nearest()
      break
    case 'ordered': {
      const field = orderedFieldFor(id, opts.glyphSet)
      if (field) {
        mapOrdered(
          sample,
          tw,
          th,
          { pal, fieldAt: field, strength, threshold: opts.threshold },
          idx,
        )
      } else nearest()
      break
    }
    case 'diffusion': {
      const kernel = DIFFUSION_KERNELS[id]
      if (kernel) mapErrorDiffusion(sample, tw, th, { pal, kernel, strength }, idx)
      else nearest()
      break
    }
    case 'path': {
      const order = pathOrderFor(id, tw, th)
      if (order) mapPathDiffusion(sample, tw, th, { pal, order, strength }, idx)
      else nearest()
      break
    }
    case 'glyph': {
      const map = GLYPH_MAPPERS[id]
      const ramp =
        id === 'ascii' && opts.asciiRamp ? asciiGlyphSet(opts.asciiRamp, 'custom') : undefined
      const set = opts.glyphSet ?? ramp ?? builtinDitherSets()[id]
      if (map && set) map(sample, tw, th, { pal, set, strength }, idx)
      else nearest()
      break
    }
    case 'special': {
      if (id === 'posterize') {
        mapPosterizeJitter(sample, tw, th, { pal, strength, levels: opts.posterizeLevels }, idx)
        break
      }
      const map = SPECIAL_MAPPERS[id]
      if (map) map(sample, tw, th, { pal, strength }, idx)
      else nearest()
      break
    }
    case 'hybrid': {
      const plan: HybridPlan = {
        low: plainBandId(opts.hybridLow),
        mid: plainBandId(opts.hybridMid),
        high: plainBandId(opts.hybridHigh),
        bandLow: Math.max(0, Math.min(255, opts.bandLow)),
        bandHigh: Math.max(0, Math.min(255, opts.bandHigh)),
        strength,
      }
      mapHybrid(
        sample,
        tw,
        th,
        { plan, pal, run: (d) => runDither(sample, opts, layout, pal, d) },
        idx,
      )
      break
    }
  }
  return idx
}

/** Hybrid bands accept any id except hybrid itself — nested hybrid degrades to nearest. */
function plainBandId(id: ImportDither): ImportDither {
  return DITHER_CATALOG[id].family === 'hybrid' ? 'none' : id
}

/** Expand the sample-level indices into full-resolution document cells (0 = empty). */
function expandCells(idx: Int32Array, layout: SampleLayout): Uint16Array {
  const { bw, tw, th } = layout
  const cells = new Uint16Array(bw * layout.bh)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const v = idx[y * tw + x]
      if (v < 0) continue
      stampCell(cells, layout, x, y, v)
    }
  }
  return cells
}

/** Replicate one sample's palette value into its scale² cell block, clipped to the buffer. */
function stampCell(
  cells: Uint16Array,
  layout: SampleLayout,
  x: number,
  y: number,
  v: number,
): void {
  const { bw, bh, scale } = layout
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
