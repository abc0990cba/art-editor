/**
 * Gradient trace facade: raster → clustered smooth regions → per-region gradient fits (plus
 * optional stacked spot layers) → AI-safe SVG. Geometry (outline paths) and color clustering are
 * reused from the trace engine; this module only upgrades flat fills to gradients. Also produces a
 * downsampled ΔE heatmap so the workspace can show where the vector diverges from the raster.
 */

import type { ImportBitmap } from '../import/index.ts'
import { composeSvg, type SvgPath } from '../trace/compose.ts'
import { DEFAULT_TRACE_PARAMS } from '../trace/params.ts'
import { clusterImage } from '../trace/quantize.ts'
import { deltaE2000Rgb } from './color.ts'
import { fitFill, spotDef } from './compose.ts'
import { compositeColor, fitRegionLayers, type LayeredFit } from './layers.ts'
import { fitRegion } from './model-select.ts'
import { normalizeGradientParams, type GradientParams } from './params.ts'
import { evalFitColor } from './render.ts'
import { labelMask, maskPath, regionPixels } from './segment.ts'
import { DEFAULT_FIT_OPTIONS, type FitOptions, type GradFit, type RgbField } from './types.ts'

export interface GradientStats {
  regions: number
  /** Regions whose paint is a gradient (base fits, with or without spots) */
  gradients: number
  /** Total spot layers stacked over base fits */
  layers: number
  vertices: number
  ms: number
  /** Pixel-weighted mean of the per-region mean ΔE2000 */
  meanDE: number
  /** Worst per-region p95 ΔE2000 */
  p95DE: number
}

export interface ErrorMap {
  width: number
  height: number
  /** ΔE2000 × 8 clamped to 255, row-major */
  data: Uint8Array
}

export interface GradientResult {
  svg: string
  stats: GradientStats
  demap: ErrorMap
}

const DEMAP_STRIDE = 4
const DEMAP_DE_SCALE = 8

export function traceGradientImage(bitmap: ImportBitmap, raw: GradientParams): GradientResult {
  const params = normalizeGradientParams(raw)
  const t0 = performance.now()
  const field: RgbField = {
    width: bitmap.width,
    height: bitmap.height,
    rgb: bitmapToField(bitmap.data, bitmap.width * bitmap.height),
  }
  const clustered = clusterImage(bitmap, {
    ...DEFAULT_TRACE_PARAMS,
    colorPrecision: params.colorPrecision,
    layerDifference: 0,
  })
  const fitOpts: FitOptions = {
    deltaETolerance: params.deltaETolerance,
    maxStops: params.maxStops,
    bins: DEFAULT_FIT_OPTIONS.bins,
    smoothnessDE: params.smoothnessDE,
  }

  const defs: string[] = []
  const paths: SvgPath[] = []
  const fits: (LayeredFit | GradFit | null)[] = new Array(clustered.layers.length).fill(null)
  let defCount = 0
  let regions = 0
  let gradients = 0
  let layersTotal = 0
  let vertices = 0
  let deSum = 0
  let wSum = 0
  let p95Max = 0

  for (let label = 0; label < clustered.layers.length; label++) {
    const geom = maskPath(labelMask(clustered.labels, label), bitmap.width, bitmap.height)
    vertices += geom.vertices
    const pixels = regionPixels(clustered.labels, label, field)
    if (!pixels || pixels.count < params.minRegion) {
      // too small to fit — keep the cluster's flat color so the image stays opaque
      paths.push({ d: geom.d, fill: clustered.layers[label].color })
      continue
    }
    regions++
    const fit = fitRegion(pixels, fitOpts, field)
    let layered: LayeredFit | null = null
    if (params.mode === 'stacked' && params.maxLayers > 0) {
      const candidate = fitRegionLayers(pixels, fit.fit, {
        ...fitOpts,
        maxLayers: params.maxLayers,
      })
      if (candidate.layers.length > 0) layered = candidate
    }
    const err = layered ? layered.error : fit.fit.error
    deSum += err.mean * pixels.count
    wSum += pixels.count
    p95Max = Math.max(p95Max, err.p95)
    fits[label] = layered ?? fit.fit
    if (layered) {
      gradients++
      paths.push({ d: geom.d, fill: fitFill(layered.base, defs, `g${defCount++}`) })
      for (const spot of layered.layers) {
        const sid = `s${defCount++}`
        defs.push(spotDef(spot, sid))
        paths.push({ d: geom.d, fill: `url(#${sid})` })
      }
      layersTotal += layered.layers.length
    } else {
      paths.push({ d: geom.d, fill: fitFill(fit.fit, defs, `g${defCount++}`) })
      if (fit.fit.kind !== 'solid') gradients++
    }
  }

  const svg = composeSvg(bitmap.width, bitmap.height, paths, defs.join(''))
  return {
    svg,
    stats: {
      regions,
      gradients,
      layers: layersTotal,
      vertices,
      ms: performance.now() - t0,
      meanDE: wSum > 0 ? deSum / wSum : 0,
      p95DE: p95Max,
    },
    demap: errorMap(clustered.labels, field, fits),
  }
}

/** Downsampled ΔE heatmap of the final composite vs the source raster. */
function errorMap(
  labels: Uint8Array,
  field: RgbField,
  fits: (LayeredFit | GradFit | null)[],
): ErrorMap {
  const dw = Math.max(1, Math.ceil(field.width / DEMAP_STRIDE))
  const dh = Math.max(1, Math.ceil(field.height / DEMAP_STRIDE))
  const data = new Uint8Array(dw * dh)
  for (let gy = 0; gy < dh; gy++) {
    for (let gx = 0; gx < dw; gx++) {
      const x = Math.min(field.width - 1, gx * DEMAP_STRIDE)
      const y = Math.min(field.height - 1, gy * DEMAP_STRIDE)
      const i = y * field.width + x
      const rec = fits[labels[i]]
      let de = 0
      if (rec) {
        const orig = {
          r: field.rgb[i * 3],
          g: field.rgb[i * 3 + 1],
          b: field.rgb[i * 3 + 2],
        }
        const rendered =
          'layers' in rec ? compositeColor(rec.base, rec.layers, x, y) : evalFitColor(rec, x, y)
        de = deltaE2000Rgb(orig, rendered)
      }
      data[gy * dw + gx] = Math.min(255, Math.round(de * DEMAP_DE_SCALE))
    }
  }
  return { width: dw, height: dh, data }
}

function bitmapToField(data: Uint8ClampedArray, n: number): Float32Array {
  const rgb = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = data[i * 4] / 255
    rgb[i * 3 + 1] = data[i * 4 + 1] / 255
    rgb[i * 3 + 2] = data[i * 4 + 2] / 255
  }
  return rgb
}
