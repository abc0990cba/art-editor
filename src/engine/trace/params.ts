/**
 * Trace parameters, defaults and built-in presets. Mirrors the vtracer V1 option surface (see
 * docs/research/vectorization.md), extended with the project's additions: the centerline tracer,
 * hole handling and the mosaic composition. Values are clamped by `normalizeTraceParams` so any
 * partially-filled object (storage, presets) becomes valid.
 */

export type TraceTracer = 'outline' | 'centerline'
export type TraceColorMode = 'color' | 'binary'
/** Stacked = painter's layers; cutout = disjoint regions; mosaic = cutout with shared edges. */
export type TraceHierarchical = 'stacked' | 'cutout' | 'mosaic'
export type TracePathMode = 'spline' | 'polygon' | 'none'
/** Keep = nested contours stay holes (evenodd); fill = holes are dropped, regions fill solid. */
export type TraceHoles = 'keep' | 'fill'

export interface TraceParams {
  tracer: TraceTracer
  colorMode: TraceColorMode
  hierarchical: TraceHierarchical
  mode: TracePathMode
  /** Drop same-color components smaller than this many pixels (vtracer filter_speckle) */
  filterSpeckle: number
  /** Significant bits per channel kept before clustering (vtracer color_precision) */
  colorPrecision: number
  /** Color distance below which clusters merge (vtracer layer_difference) */
  layerDifference: number
  /** Turn angle (deg) above which a vertex is a hard corner (vtracer corner_threshold) */
  cornerThreshold: number
  /** Base simplification tolerance in px (vtracer length_threshold); epsilon = half of it */
  lengthThreshold: number
  /** Max curve-fitting recursion depth (vtracer max_iterations) */
  maxIterations: number
  /** Turn angle (deg) below which a vertex is smoothed over entirely (vtracer splice_threshold) */
  spliceThreshold: number
  holes: TraceHoles
  /** Decimal digits kept in path coordinates (vtracer path_precision) */
  pathPrecision: number
  /** Binary mode: foreground when luminance < threshold (0..255) */
  binaryThreshold: number
  binaryInvert: boolean
  /** Centerline: drop skeleton chains shorter than this many px */
  minStrokeLength: number
  /** Centerline: stroke width in px; 0 = estimate from local stroke thickness */
  strokeWidth: number
}

export const DEFAULT_TRACE_PARAMS: TraceParams = {
  tracer: 'outline',
  colorMode: 'color',
  hierarchical: 'stacked',
  mode: 'spline',
  filterSpeckle: 4,
  colorPrecision: 6,
  layerDifference: 16,
  cornerThreshold: 60,
  lengthThreshold: 4,
  maxIterations: 10,
  spliceThreshold: 45,
  holes: 'keep',
  pathPrecision: 8,
  binaryThreshold: 128,
  binaryInvert: false,
  minStrokeLength: 6,
  strokeWidth: 0,
}

/**
 * Built-in presets; labels live in i18n (`vector.preset.<id>`). `demo` is a free stock photo (Lorem
 * Picsum) the preset ships with, so the effect can be tried on a real image in one tap.
 */
export interface TracePreset {
  id: string
  params: Partial<TraceParams>
  demo?: string
}

const demo = (id: number): string => `https://picsum.photos/id/${id}/480/360`

export const TRACE_PRESETS: readonly TracePreset[] = [
  { id: 'default', params: {}, demo: demo(1015) },
  {
    id: 'photo',
    params: { colorPrecision: 8, layerDifference: 8, filterSpeckle: 8, hierarchical: 'stacked' },
    demo: demo(237),
  },
  {
    id: 'poster',
    params: { colorPrecision: 4, layerDifference: 32, filterSpeckle: 12, hierarchical: 'stacked' },
    demo: demo(1024),
  },
  { id: 'bw', params: { colorMode: 'binary', mode: 'spline', filterSpeckle: 2 }, demo: demo(64) },
  {
    id: 'pixel',
    params: {
      colorPrecision: 8,
      layerDifference: 0,
      filterSpeckle: 0,
      mode: 'polygon',
      cornerThreshold: 180,
    },
    demo: demo(1084),
  },
  {
    id: 'lineart',
    params: { tracer: 'centerline', mode: 'spline', minStrokeLength: 6, strokeWidth: 0 },
    demo: demo(1074),
  },
  {
    id: 'logo',
    params: { colorPrecision: 6, layerDifference: 24, filterSpeckle: 32, mode: 'spline' },
    demo: demo(1050),
  },
  {
    id: 'sketch',
    params: { colorMode: 'binary', binaryThreshold: 150, mode: 'spline', filterSpeckle: 4 },
    demo: demo(338),
  },
  {
    id: 'comic',
    params: {
      colorPrecision: 6,
      layerDifference: 24,
      filterSpeckle: 6,
      hierarchical: 'mosaic',
      mode: 'polygon',
    },
    demo: demo(40),
  },
  {
    id: 'antique',
    params: { colorPrecision: 2, layerDifference: 64, filterSpeckle: 16, hierarchical: 'stacked' },
    demo: demo(365),
  },
]

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(clamp(v, min, max))
}

/** Fill missing fields from the defaults and clamp every numeric range. */
export function normalizeTraceParams(raw: Partial<TraceParams> | null | undefined): TraceParams {
  const p: TraceParams = { ...DEFAULT_TRACE_PARAMS, ...raw }
  return {
    tracer: p.tracer === 'centerline' ? 'centerline' : 'outline',
    colorMode: p.colorMode === 'binary' ? 'binary' : 'color',
    hierarchical:
      p.hierarchical === 'cutout' || p.hierarchical === 'mosaic' ? p.hierarchical : 'stacked',
    mode: p.mode === 'polygon' || p.mode === 'none' ? p.mode : 'spline',
    filterSpeckle: clampInt(p.filterSpeckle, 0, 128),
    colorPrecision: clampInt(p.colorPrecision, 1, 8),
    layerDifference: clampInt(p.layerDifference, 0, 128),
    cornerThreshold: clamp(p.cornerThreshold, 0, 180),
    lengthThreshold: clamp(p.lengthThreshold, 0, 10),
    maxIterations: clampInt(p.maxIterations, 1, 30),
    spliceThreshold: clamp(p.spliceThreshold, 0, 180),
    holes: p.holes === 'fill' ? 'fill' : 'keep',
    pathPrecision: clampInt(p.pathPrecision, 0, 8),
    binaryThreshold: clampInt(p.binaryThreshold, 0, 255),
    binaryInvert: Boolean(p.binaryInvert),
    minStrokeLength: clamp(p.minStrokeLength, 0, 64),
    strokeWidth: clamp(p.strokeWidth, 0, 128),
  }
}
