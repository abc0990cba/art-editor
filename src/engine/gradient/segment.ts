/**
 * Region extraction for the gradient pipeline: cluster labels (from the existing quantizer) tile
 * the image into pixel-exclusive regions; each region gets a sample set for fitting and a
 * simplified spline outline (reused trace-engine stages) for SVG fills. Holes ride the same path
 * data — composeSvg fills with the evenodd rule.
 */

import { traceMask } from '../trace/binary-layer.ts'
import { loopToPath } from '../trace/compose.ts'
import { DEFAULT_TRACE_PARAMS, type TraceParams } from '../trace/params.ts'
import { normalizeLoop, simplifyLoop } from '../trace/simplify.ts'
import type { RegionPixels, RgbField } from './types.ts'

/** Outline settings for gradient regions: smooth splines, tight simplification, light speckle. */
const OUTLINE_PARAMS: TraceParams = {
  ...DEFAULT_TRACE_PARAMS,
  mode: 'spline',
  pathPrecision: 1,
  filterSpeckle: 4,
  lengthThreshold: 4,
}

/** All pixels of one cluster as fit samples (structure-of-arrays, weight 1). */
export function regionPixels(
  labels: Uint8Array,
  label: number,
  field: RgbField,
): RegionPixels | null {
  let count = 0
  for (let i = 0; i < labels.length; i++) if (labels[i] === label) count++
  if (count === 0) return null
  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  const rgb = new Float32Array(count * 3)
  const weights = new Float32Array(count).fill(1)
  const { width } = field
  let w = 0
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== label) continue
    const x = i % width
    xs[w] = x
    ys[w] = (i - x) / width
    rgb[w * 3] = field.rgb[i * 3]
    rgb[w * 3 + 1] = field.rgb[i * 3 + 1]
    rgb[w * 3 + 2] = field.rgb[i * 3 + 2]
    w++
  }
  return { count, xs, ys, rgb, weights }
}

/** Binary mask of one label. */
export function labelMask(labels: Uint8Array, label: number): Uint8Array {
  const mask = new Uint8Array(labels.length)
  for (let i = 0; i < labels.length; i++) mask[i] = labels[i] === label ? 1 : 0
  return mask
}

/** Simplified spline outline of a binary mask; `d` joins every contour (outer + holes). */
export function maskPath(
  mask: Uint8Array,
  width: number,
  height: number,
): { d: string; vertices: number } {
  const contours = traceMask(mask, width, height, OUTLINE_PARAMS.filterSpeckle)
  let d = ''
  let vertices = 0
  for (const c of contours) {
    const loop = normalizeLoop(c.pts)
    const simplified = simplifyLoop(loop, OUTLINE_PARAMS.lengthThreshold / 2)
    vertices += simplified.length / 2
    d += loopToPath(simplified, OUTLINE_PARAMS)
  }
  return { d, vertices }
}
