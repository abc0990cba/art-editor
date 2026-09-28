/**
 * Gradient-trace parameters: segmentation coarseness, per-region fit tolerances and the layered
 * "spot" budget. Mirrors the trace/params.ts pattern — normalize clamps every field, so any
 * partially-filled object (old storage rows, preset fragments) becomes a valid parameter set.
 */

export type GradientMode = 'single' | 'stacked'

export interface GradientParams {
  /** Single = one paint per region; stacked = soft spot layers on top of the base fit */
  mode: GradientMode
  /** Mean ΔE2000 a region fit must stay under to count as a gradient */
  deltaETolerance: number
  /** Stop budget per gradient */
  maxStops: number
  /** Spot-layer budget per region in stacked mode (0 = base fits only) */
  maxLayers: number
  /** Channel bits kept by the segmentation clustering — fewer bits, larger smoother regions */
  colorPrecision: number
  /** Regions with fewer pixels keep their flat cluster color */
  minRegion: number
  /** Quadratic-surface gate: mean ΔE for a region to be treated as smooth at all */
  smoothnessDE: number
}

export const DEFAULT_GRADIENT_PARAMS: GradientParams = {
  mode: 'single',
  deltaETolerance: 2,
  maxStops: 6,
  maxLayers: 8,
  colorPrecision: 4,
  minRegion: 24,
  smoothnessDE: 8,
}

export interface GradientPreset {
  id: string
  params: Partial<GradientParams>
  /** Free stock photo (Lorem Picsum) the preset ships with, for one-tap demos. */
  demo?: string
}

const demo = (id: number): string => `https://picsum.photos/id/${id}/480/360`

/** Built-in starting points; keys are i18n labels (`gradient.preset.<id>`). */
export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'art', params: { ...DEFAULT_GRADIENT_PARAMS }, demo: demo(1018) },
  {
    id: 'flat',
    params: { deltaETolerance: 1.5, maxStops: 4, maxLayers: 0, colorPrecision: 5, minRegion: 48 },
    demo: demo(1060),
  },
  {
    id: 'photo',
    params: {
      mode: 'stacked',
      deltaETolerance: 3,
      maxStops: 8,
      maxLayers: 16,
      colorPrecision: 4,
      minRegion: 16,
    },
    demo: demo(1025),
  },
  {
    id: 'soft',
    params: { deltaETolerance: 2, maxStops: 6, maxLayers: 0, minRegion: 64 },
    demo: demo(1039),
  },
  {
    id: 'detailed',
    params: {
      mode: 'stacked',
      deltaETolerance: 2,
      maxStops: 10,
      maxLayers: 32,
      colorPrecision: 5,
      minRegion: 8,
    },
    demo: demo(1015),
  },
  {
    id: 'poster',
    params: { deltaETolerance: 5, maxStops: 3, maxLayers: 0, minRegion: 128 },
    demo: demo(29),
  },
  {
    id: 'duotone',
    params: { deltaETolerance: 4, maxStops: 2, maxLayers: 0, minRegion: 96 },
    demo: demo(110),
  },
]

function clampNum(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(max, Math.max(min, raw))
    : fallback
}

export function normalizeGradientParams(raw: unknown): GradientParams {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_GRADIENT_PARAMS
  return {
    mode: r['mode'] === 'stacked' ? 'stacked' : 'single',
    deltaETolerance: clampNum(r['deltaETolerance'], 0.5, 10, d.deltaETolerance),
    maxStops: Math.round(clampNum(r['maxStops'], 2, 12, d.maxStops)),
    maxLayers: Math.round(clampNum(r['maxLayers'], 0, 64, d.maxLayers)),
    colorPrecision: Math.round(clampNum(r['colorPrecision'], 2, 8, d.colorPrecision)),
    minRegion: Math.round(clampNum(r['minRegion'], 1, 4096, d.minRegion)),
    smoothnessDE: clampNum(r['smoothnessDE'], 2, 30, d.smoothnessDE),
  }
}
