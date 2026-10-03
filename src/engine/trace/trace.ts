/**
 * Trace facade: image (or explicit color layers) → SVG, mirroring the vtracer V1 pipeline (see
 * docs/research/vectorization.md). The stages — clustering, mask tracing, simplification, curve
 * fitting, composition — live in sibling modules and are public: hybrid pipelines (dithered
 * rasters, pattern fills) can call them directly instead of going through here.
 */

import type { ImportBitmap } from '../import/index.ts'
import { traceMask, type Contour } from './binary-layer.ts'
import { thresholdMask, traceCenterline } from './centerline.ts'
import { composeSvg, loopToPath, type SvgPath } from './compose.ts'
import { mosaicPaths } from './mosaic.ts'
import { normalizeTraceParams, type TraceParams } from './params.ts'
import { clusterImage, type ClusterLayer } from './quantize.ts'
import { normalizeLoop, simplifyLoop } from './simplify.ts'

/** Explicit color layer (mask = 1 where the color is). Mask order = paint order, first is bottom. */
export interface TraceLayerInput {
  color: string
  mask: Uint8Array
}

export type TraceInput =
  | { kind: 'raster'; bitmap: ImportBitmap }
  | { kind: 'layers'; width: number; height: number; layers: TraceLayerInput[] }

export interface TraceStats {
  clusters: number
  paths: number
  vertices: number
  strokes: number
  ms: number
}

export interface TraceResult {
  svg: string
  stats: TraceStats
}

const TRANSPARENT = 255

/**
 * Full outline trace. `stacked` traces the raw cluster masks and paints them bottom→top;
 * `cutout`/`mosaic` first cut every pixel to its topmost layer, so regions never overlap (mosaic
 * then stitches shared edges before fitting). `holes: fill` drops hole contours.
 */
export function traceImage(input: TraceInput, raw: TraceParams): TraceResult {
  const params = normalizeTraceParams(raw)
  const t0 = performance.now()
  const stats: TraceStats = { clusters: 0, paths: 0, vertices: 0, strokes: 0, ms: 0 }
  const width = input.kind === 'raster' ? input.bitmap.width : input.width
  const height = input.kind === 'raster' ? input.bitmap.height : input.height

  let svg: string
  if (params.tracer === 'centerline') {
    const mask = inputMask(input, params)
    const built = traceCenterline(mask, width, height, params)
    stats.strokes = built.paths.length
    stats.vertices = built.vertices
    svg = composeSvg(width, height, built.paths)
  } else {
    const resolved = resolveLayers(input, params)
    stats.clusters = resolved.layers.length
    const paths = outlinePaths(resolved, params, stats)
    svg = composeSvg(width, height, paths)
  }
  stats.ms = performance.now() - t0
  return { svg, stats }
}

interface ResolvedLayers {
  width: number
  height: number
  /** Paint order (bottom first) */
  layers: ClusterLayer[]
  /** Label per pixel for raster inputs, null for explicit masks */
  labels: Uint8Array | null
  /** Explicit masks (layers input), aligned with `layers`; null = derive from labels */
  masks: (Uint8Array | null)[] | null
}

/** Normalize both input kinds into paint-ordered layers with labels or explicit masks. */
function resolveLayers(input: TraceInput, params: TraceParams): ResolvedLayers {
  if (input.kind === 'layers') {
    return {
      width: input.width,
      height: input.height,
      layers: input.layers.map((l) => ({ color: l.color, count: 0 })),
      labels: null,
      masks: input.layers.map((l) => l.mask),
    }
  }
  if (params.colorMode === 'binary') {
    const mask = thresholdMask(input.bitmap, params)
    return {
      width: input.bitmap.width,
      height: input.bitmap.height,
      layers: [{ color: '#000000', count: mask.reduce((a, v) => a + v, 0) }],
      labels: null,
      masks: [mask],
    }
  }
  const clustered = clusterImage(input.bitmap, params)
  return {
    width: input.bitmap.width,
    height: input.bitmap.height,
    layers: clustered.layers,
    labels: clustered.labels,
    masks: null,
  }
}

/** Union mask of all explicit layers (centerline over a layers input); raster uses the threshold. */
function inputMask(input: TraceInput, params: TraceParams): Uint8Array {
  if (input.kind === 'raster') return thresholdMask(input.bitmap, params)
  const union = new Uint8Array(input.width * input.height)
  for (const l of input.layers) {
    for (let i = 0; i < union.length; i++) union[i] ||= l.mask[i]
  }
  return union
}

/** Trace every layer into fill paths according to the hierarchical composition. */
function outlinePaths(resolved: ResolvedLayers, params: TraceParams, stats: TraceStats): SvgPath[] {
  const { width: w, height: h } = resolved
  const topmost = params.hierarchical === 'stacked' ? null : cutoutLabels(resolved, w, h)
  const scratch = new Uint8Array(w * h)
  const layers: { color: string; contours: Contour[] }[] = []
  for (let li = 0; li < resolved.layers.length; li++) {
    const mask = layerMask(resolved, topmost, li, scratch)
    const contours = mask ? traceMask(mask, w, h, params.filterSpeckle) : []
    layers.push({ color: resolved.layers[li].color, contours: filterHoles(contours, params) })
  }
  if (params.hierarchical === 'mosaic') {
    const mosaic = mosaicPaths(w, layers, params)
    stats.paths += mosaic.paths.length
    stats.vertices += mosaic.vertices
    return mosaic.paths
  }
  const paths: SvgPath[] = []
  for (const layer of layers) {
    if (layer.contours.length === 0) continue
    paths.push({
      d: layer.contours.map((c) => loopPath(c, params, stats)).join(''),
      fill: layer.color,
    })
  }
  stats.paths += paths.length
  return paths
}

function filterHoles(contours: Contour[], params: TraceParams): Contour[] {
  return params.holes === 'fill' ? contours.filter((c) => !c.hole) : contours
}

/** Per-layer mask: stacked = the raw cluster region; cutout = pixels whose topmost layer it is. */
function layerMask(
  resolved: ResolvedLayers,
  topmost: Uint8Array | null,
  li: number,
  scratch: Uint8Array,
): Uint8Array | null {
  const explicit = resolved.masks?.[li]
  if (explicit && !topmost) return explicit
  if (explicit && topmost) {
    for (let i = 0; i < explicit.length; i++) scratch[i] = explicit[i] && topmost[i] === li ? 1 : 0
    return scratch
  }
  const labels = resolved.labels
  if (!labels) return null
  for (let i = 0; i < labels.length; i++) {
    scratch[i] = topmost ? (topmost[i] === li ? 1 : 0) : labels[i] === li ? 1 : 0
  }
  return scratch
}

/**
 * Cut each pixel to its topmost layer (the last one painted there): iterating paint order from the
 * top down, the first writer wins.
 */
function cutoutLabels(resolved: ResolvedLayers, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h).fill(TRANSPARENT)
  if (resolved.labels) {
    for (let li = resolved.layers.length - 1; li >= 0; li--) {
      for (let i = 0; i < out.length; i++) {
        if (resolved.labels[i] === li && out[i] === TRANSPARENT) out[i] = li
      }
    }
    return out
  }
  const masks = resolved.masks ?? []
  for (let li = masks.length - 1; li >= 0; li--) {
    const m = masks[li]
    if (!m) continue
    for (let i = 0; i < out.length; i++) {
      if (m[i] && out[i] === TRANSPARENT) out[i] = li
    }
  }
  return out
}

/** Contour → simplified loop → path data (accumulating vertex stats). */
function loopPath(contour: Contour, params: TraceParams, stats: TraceStats): string {
  const loop = normalizeLoop(contour.pts)
  const simplified = simplifyLoop(loop, params.lengthThreshold / 2)
  stats.vertices += simplified.length / 2
  return loopToPath(simplified, params)
}
